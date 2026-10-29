// PinPoint: one small server for snagging websites.
//
//   /                 the inbox, where your team works through the snags
//   /pinpoint.js      the one script tag you add to a client's site
//   /api/auth/*       sign-in with a code sent by email
//   /api/sites        your client sites and who's invited to them (team only)
//   /api/assignments  who on your team each piece of feedback is assigned to (team only)
//   /api/tcpinpoint   the API the widget and the inbox talk to
//
// Everything is saved as JSON files in data/. No database needed.
// Emails (sign-in codes and notifications) go through Postmark.
//
//   npm run dev       inbox with live reload (Vite) + API, on one port
//   npm start         production: run `npm run build` first

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCollectionStore, StorePersistenceError } from "@tc-pinpoint/adapter-kit";
import { createTcPinpointHandler } from "@tc-pinpoint/server";
import { createAssignments } from "./lib/assignments.js";
import { AuthError, createAuth } from "./lib/auth.js";
import { createMailer } from "./lib/email.js";
import { readJson, writeJson } from "./lib/json-file.js";
import { createNotifier } from "./lib/notify.js";
import { createSites, normaliseEmail } from "./lib/sites.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes("--dev");

if (existsSync(path.join(here, ".env"))) process.loadEnvFile(path.join(here, ".env"));

// ------------------------------------------------------------------ settings

const port = Number(process.env.PORT || 3000);
const dataFile = path.resolve(here, process.env.TC_PINPOINT_DATA || "data/snags.json");
const dataDir = path.dirname(dataFile);
// Hosts like Railway and Render sit behind a proxy: trust its headers for the visitor's address and https.
const trustProxy = process.env.TC_PINPOINT_TRUST_PROXY === "true";
const teamDomains = (process.env.TC_PINPOINT_TEAM_DOMAINS || "thoughtcollective.com")
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);

const mailer = createMailer({
  token: process.env.POSTMARK_SERVER_TOKEN,
  from: process.env.TC_PINPOINT_EMAIL_FROM,
  apiUrl: process.env.TC_PINPOINT_POSTMARK_URL, // for testing only
});

if (mailer.live && !process.env.TC_PINPOINT_EMAIL_FROM) {
  console.error("[pinpoint] Set TC_PINPOINT_EMAIL_FROM in .env: the address codes are sent from.");
  process.exit(1);
}
if (!mailer.live && !dev && process.env.TC_PINPOINT_PRINT_CODES !== "true") {
  console.error("[pinpoint] Set POSTMARK_SERVER_TOKEN in .env so sign-in codes can be emailed.");
  process.exit(1);
}

// ------------------------------------------------------------------ snags (JSON file store)

function revive(feedback) {
  return {
    ...feedback,
    createdAt: new Date(feedback.createdAt),
    updatedAt: new Date(feedback.updatedAt),
    resolvedAt: feedback.resolvedAt ? new Date(feedback.resolvedAt) : null,
    comments: (feedback.comments ?? []).map((comment) => ({ ...comment, createdAt: new Date(comment.createdAt) })),
  };
}

function createJsonFileStore(file) {
  let cache = readJson(file, []).map(revive);
  const store = createCollectionStore({
    load: () => cache,
    persist: (next) => {
      try {
        writeJson(file, next);
        cache = next;
      } catch (error) {
        throw new StorePersistenceError(`Couldn't save snags to ${file}: ${error.message}`);
      }
    },
    generateId: () => randomUUID(),
    comments: true,
  });
  return {
    store,
    find: (id) => cache.find((feedback) => feedback.id === id) ?? null,
    hasComment: (clientId) => cache.some((feedback) => feedback.comments?.some((c) => c.clientId === clientId)),
  };
}

const snags = createJsonFileStore(dataFile);

// ------------------------------------------------------------------ sites, sign-in, permissions

const sites = createSites({
  file: path.join(dataDir, "sites.json"),
  dev,
  port,
  onChange: () => {
    handler = buildHandler();
  },
});

const auth = createAuth({ sessionsFile: path.join(dataDir, "sessions.json"), teamDomains, sites, mailer });
const assignments = createAssignments({ file: path.join(dataDir, "assignments.json") });
const notifier = createNotifier({ mailer, sites, isTeam: auth.isTeam });

// Who's acting, and this server's public address, for the request being handled.
const requestContext = new AsyncLocalStorage();

// The snag store, watched so replies and status changes can send notifications once they're saved.
// A retried reply (same clientId) is saved once, and emails once.
const store = {
  ...snags.store,
  async addComment(feedbackId, data) {
    const isNew = !snags.hasComment(data.clientId);
    const comment = await snags.store.addComment(feedbackId, data);
    const context = requestContext.getStore();
    const feedback = snags.find(feedbackId);
    if (isNew && context && feedback) notifier.commentAdded(feedback, comment, context.user, context.server);
    return comment;
  },
  async updateFeedback(id, data) {
    const previous = snags.find(id)?.status;
    const updated = await snags.store.updateFeedback(id, data);
    const context = requestContext.getStore();
    if (context) notifier.statusChanged(updated, previous, context.user);
    return updated;
  },
  async deleteFeedback(id) {
    await snags.store.deleteFeedback(id);
    assignments.remove(id);
  },
  async deleteAllFeedbacks(projectName) {
    await snags.store.deleteAllFeedbacks(projectName);
    assignments.removeProject(projectName);
  },
};

// What a client may do on a site they're invited to. Your team can do everything.
const CLIENT_ACTIONS = new Set(["create", "list", "createComment"]);

// Who's signed in is stamped onto every snag and reply, so nobody can post under someone else's name.
const asAuthor = (input, { principal }) => ({ ...input, authorName: principal.name, authorEmail: principal.email });

function buildHandler() {
  return createTcPinpointHandler({
    store,
    allowedOrigins: sites.origins(),
    access: {
      authenticate: (request) => auth.userFromRequest(request.headers),
      authorize: ({ principal, action, projectName }) =>
        principal.role === "team" || (CLIENT_ACTIONS.has(action) && auth.canUseSite(principal, projectName)),
      canReadAuthorEmail: (principal) => principal.role === "team",
      canCommentAsTeam: (principal) => principal.role === "team",
    },
    beforeCreate: asAuthor,
    beforeComment: asAuthor,
    hooks: {
      // Runs once per new snag (never for a retried one).
      onCreated: (feedback, { principal, request }) =>
        notifier.snagCreated(feedback, principal, new URL(request.url).origin),
    },
    // Inline screenshots make bodies large; 4 MiB is the server's own default.
    maxBodyBytes: 4 * 1024 * 1024,
  });
}

let handler = buildHandler();

// ------------------------------------------------------------------ HTTP helpers

function clientIp(req) {
  const forwarded = trustProxy
    ? String(req.headers["x-forwarded-for"] ?? "")
        .split(",")[0]
        .trim()
    : "";
  return forwarded || req.socket.remoteAddress || "unknown";
}

function protocol(req) {
  const forwarded = trustProxy
    ? String(req.headers["x-forwarded-proto"] ?? "")
        .split(",")[0]
        .trim()
    : "";
  return forwarded === "https" ? "https" : "http";
}

// Sign-in is called from client sites too, so it answers their CORS requests.
function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && sites.origins().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  res.setHeader("Vary", "Origin");
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 64 * 1024) {
  if (!String(req.headers["content-type"] ?? "").includes("application/json")) {
    throw Object.assign(new Error("Send JSON."), { status: 415 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Too large."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON."), { status: 400 });
  }
}

// A request from a browser page must come from this server or one of your sites.
function fromAllowedPage(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === `${protocol(req)}://${req.headers.host}` || sites.origins().includes(origin);
}

// ------------------------------------------------------------------ routes

async function handleAuth(req, res, pathname) {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (!fromAllowedPage(req)) return sendJson(res, 403, { error: "This site isn't set up for feedback." });

  if (pathname === "/api/auth/code" && req.method === "POST") {
    await auth.requestCode(await readBody(req), clientIp(req));
    return sendJson(res, 200, { sent: true });
  }

  if (pathname === "/api/auth/verify" && req.method === "POST") {
    return sendJson(res, 200, auth.verifyCode(await readBody(req), clientIp(req)));
  }

  if (pathname === "/api/auth/me" && req.method === "GET") {
    const user = auth.userFromRequest(req.headers);
    if (!user) return sendJson(res, 401, { error: "Not signed in." });
    const site = new URL(req.url, "http://localhost").searchParams.get("site");
    if (site && !auth.canUseSite(user, site)) return sendJson(res, 403, { error: "No access to this site." });
    return sendJson(res, 200, { user });
  }

  if (pathname === "/api/auth/signout" && req.method === "POST") {
    auth.signOut(req.headers);
    return sendJson(res, 200, { signedOut: true });
  }

  return sendJson(res, 404, { error: "Not found." });
}

// GET lists your sites; PUT adds or updates one; DELETE removes one (its snags are kept). Team only.
async function handleSites(req, res) {
  const user = auth.userFromRequest(req.headers);
  if (!user) return sendJson(res, 401, { error: "Sign in first." });
  if (user.role !== "team") return sendJson(res, 403, { error: "Only your team can manage sites." });
  if (!fromAllowedPage(req)) return sendJson(res, 403, { error: "Not allowed from this page." });

  if (req.method === "GET") return sendJson(res, 200, { sites: sites.all() });

  if (req.method === "PUT") {
    const { site, created, error } = sites.upsert(await readBody(req));
    if (error) return sendJson(res, 400, { error });
    return sendJson(res, created ? 201 : 200, { site, sites: sites.all() });
  }

  if (req.method === "DELETE") {
    const { name } = await readBody(req);
    if (!sites.remove(name)) return sendJson(res, 404, { error: "That site isn't in the list." });
    return sendJson(res, 200, { sites: sites.all() });
  }

  res.writeHead(405, { Allow: "GET, PUT, DELETE" });
  res.end();
}

// GET ?project=name lists who's assigned what on a site; PUT assigns (or unassigns) one piece of feedback.
// Only people on the site's Notify list can be assigned its feedback. Team only.
async function handleAssignments(req, res) {
  const user = auth.userFromRequest(req.headers);
  if (!user) return sendJson(res, 401, { error: "Sign in first." });
  if (user.role !== "team") return sendJson(res, 403, { error: "Only your team can assign feedback." });
  if (!fromAllowedPage(req)) return sendJson(res, 403, { error: "Not allowed from this page." });

  if (req.method === "GET") {
    const projectName = new URL(req.url, "http://localhost").searchParams.get("project") ?? "";
    const site = sites.get(projectName);
    if (!site) return sendJson(res, 404, { error: "That site isn't in the list." });
    const assigned = assignments.forProject(projectName);
    // Names for everyone who can be (or already is) assigned, from when they last signed in.
    const emails = new Set([...site.notify, ...Object.values(assigned)]);
    const names = Object.fromEntries([...emails].map((email) => [email, auth.nameFor(email)]));
    return sendJson(res, 200, { assignments: assigned, names });
  }

  if (req.method === "PUT") {
    const { feedbackId, email: rawEmail } = await readBody(req);
    const feedback = snags.find(String(feedbackId ?? ""));
    if (!feedback) return sendJson(res, 404, { error: "That feedback doesn't exist any more." });
    const email = rawEmail ? normaliseEmail(rawEmail) : null;
    const site = sites.get(feedback.projectName);
    if (email && !site?.notify.includes(email)) {
      return sendJson(res, 400, { error: "Only people on this site's Notify list can be assigned its feedback." });
    }
    const previous = assignments.get(feedback.id)?.email ?? null;
    assignments.set(feedback.id, { projectName: feedback.projectName, email, assignedBy: user.email });
    if (email && email !== previous) {
      notifier.assigned(feedback, { email, name: auth.nameFor(email) }, user, `${protocol(req)}://${req.headers.host}`);
    }
    return sendJson(res, 200, { feedbackId: feedback.id, email, name: email ? auth.nameFor(email) : null });
  }

  res.writeHead(405, { Allow: "GET, PUT" });
  res.end();
}

async function toRequest(req) {
  // The real public address, so the API recognises the inbox's own requests behind a proxy.
  const url = `${protocol(req)}://${req.headers.host ?? `localhost:${port}`}${req.url}`;
  const hasBody = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const chunks = [];
  if (hasBody) for await (const chunk of req) chunks.push(chunk);
  return new Request(url, {
    method: req.method,
    headers: Object.entries(req.headers).flatMap(([name, value]) =>
      Array.isArray(value) ? value.map((v) => [name, v]) : value === undefined ? [] : [[name, value]],
    ),
    body: hasBody ? Buffer.concat(chunks) : undefined,
  });
}

async function sendResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function sendFile(res, file, type, cache = "no-cache") {
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
  res.end(readFileSync(file));
}

const widgetFile = path.resolve(here, "../../packages/widget/dist/index.global.js");
const loaderFile = path.join(here, "loader/pinpoint.js");
const distDir = path.join(here, "dist");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

// In development Vite serves the inbox (live reload, Tailwind); in production the built files in dist/ do.
const vite = dev
  ? await (await import("vite")).createServer({ root: here, server: { middlewareMode: true }, appType: "spa" })
  : null;

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost");

    if (pathname === "/api/tcpinpoint") {
      const method = req.method in handler ? req.method : null;
      if (!method) {
        res.writeHead(405, { Allow: "GET, POST, PATCH, DELETE, OPTIONS" });
        res.end();
        return;
      }
      const context = { user: auth.userFromRequest(req.headers), server: `${protocol(req)}://${req.headers.host}` };
      return await requestContext.run(context, async () =>
        sendResponse(res, await handler[method](await toRequest(req))),
      );
    }

    if (pathname.startsWith("/api/auth/")) return await handleAuth(req, res, pathname);
    if (pathname === "/api/sites") return await handleSites(req, res);
    if (pathname === "/api/assignments") return await handleAssignments(req, res);

    if (pathname === "/pinpoint.js" || pathname === "/widget.js") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return sendFile(res, pathname === "/pinpoint.js" ? loaderFile : widgetFile, TYPES[".js"]);
    }

    if (vite) {
      vite.middlewares(req, res);
      return;
    }

    // Built inbox: hashed assets can be cached for good, everything else falls back to index.html.
    const file = path.join(distDir, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
    if (pathname.startsWith("/assets/") && file.startsWith(distDir) && existsSync(file)) {
      return sendFile(
        res,
        file,
        TYPES[path.extname(file)] ?? "application/octet-stream",
        "public, max-age=31536000, immutable",
      );
    }
    return sendFile(res, path.join(distDir, "index.html"), TYPES[".html"]);
  } catch (error) {
    if (error instanceof AuthError || error.status) return sendJson(res, error.status, { error: error.message });
    console.error("[pinpoint]", error);
    if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong on the server." });
  }
});

server.listen(port, () => {
  console.log(`\n  PinPoint is running on http://localhost:${port}\n`);
  console.log(`  Inbox:   http://localhost:${port}/`);
  console.log(`  Team:    anyone @${teamDomains.join(", @")}`);
  console.log(
    `  Sites:   ${
      sites
        .all()
        .map((s) => s.name)
        .join(", ") || "none yet, add them in the inbox"
    }`,
  );
  console.log(`  Codes:   ${mailer.live ? "emailed through Postmark" : "printed here (no Postmark token yet)"}\n`);
});
