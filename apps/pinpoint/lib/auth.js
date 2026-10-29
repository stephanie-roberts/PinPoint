// Sign-in with a 6-digit code sent by email.
//
// Team members (an email at one of your team domains) can use the inbox and do everything.
// Clients can sign in on a site they've been invited to, then add snags and reply there.
//
// Codes live in memory for 10 minutes. Sessions last 30 days and are saved to data/sessions.json,
// storing only a hash of each session token.

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { readJson, writeJson } from "./json-file.js";
import { isEmail, normaliseEmail } from "./sites.js";

const CODE_TTL = 10 * 60 * 1000;
const CODE_RESEND_GAP = 30 * 1000;
const MAX_ATTEMPTS = 5;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const NAME_MAX = 100;

const hash = (value) => createHash("sha256").update(value).digest("hex");

function sameHash(a, b) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

// A small sliding-window limiter, so nobody can spray codes or guesses.
function createLimiter(limit, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear();
    return recent.length > limit;
  };
}

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createAuth({ sessionsFile, teamDomains, sites, mailer }) {
  const codes = new Map(); // email → { codeHash, name, expires, attempts, sentAt, siteName }
  const tooManyCodes = createLimiter(10, 10 * 60 * 1000);
  const tooManyGuesses = createLimiter(30, 10 * 60 * 1000);

  const sessions = Object.fromEntries(
    Object.entries(readJson(sessionsFile, {})).filter(([, session]) => session.expires > Date.now()),
  );
  const saveSessions = () => writeJson(sessionsFile, sessions);

  const isTeam = (email) => teamDomains.some((domain) => email.endsWith(`@${domain}`));
  const roleFor = (email) => (isTeam(email) ? "team" : "client");

  // May this email sign in here? The inbox is team-only; a site takes its team and invited clients.
  function allowed(email, siteName) {
    if (isTeam(email)) return true;
    return Boolean(siteName) && sites.isClientOf(email, siteName);
  }

  return {
    isTeam,

    async requestCode({ name, email, site: siteName }, ip) {
      email = normaliseEmail(email);
      name = String(name ?? "")
        .trim()
        .slice(0, NAME_MAX);
      siteName = siteName ? String(siteName) : null;

      if (!name) throw new AuthError(400, "Please add your name.");
      if (!isEmail(email)) throw new AuthError(400, "That doesn't look like an email address.");
      if (siteName && !sites.get(siteName)) throw new AuthError(400, "This site isn't set up for feedback.");
      if (!siteName && !isTeam(email)) {
        throw new AuthError(403, "The inbox is for your team. Clients leave feedback on their own website.");
      }
      if (tooManyCodes(`ip:${ip}`) || tooManyCodes(`email:${email}`)) {
        throw new AuthError(429, "Too many codes asked for. Wait a few minutes and try again.");
      }

      // Uninvited emails get the same answer as invited ones, so the form can't be used to
      // find out who has access. They just never receive a code.
      if (!allowed(email, siteName)) return;

      const existing = codes.get(email);
      if (existing && Date.now() - existing.sentAt < CODE_RESEND_GAP) return;

      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      codes.set(email, {
        codeHash: hash(code),
        name,
        siteName,
        expires: Date.now() + CODE_TTL,
        attempts: 0,
        sentAt: Date.now(),
      });
      try {
        await mailer.sendCode({ to: email, name, code, siteName });
      } catch (error) {
        codes.delete(email);
        console.error("[pinpoint] Couldn't send a sign-in code:", error.message);
        throw new AuthError(502, "We couldn't send the email just now. Try again in a minute.");
      }
    },

    verifyCode({ email, code }, ip) {
      email = normaliseEmail(email);
      code = String(code ?? "").replace(/\D/g, "");
      if (tooManyGuesses(`ip:${ip}`)) throw new AuthError(429, "Too many tries. Wait a few minutes and try again.");

      const entry = codes.get(email);
      if (!entry || entry.expires < Date.now()) {
        codes.delete(email);
        throw new AuthError(400, "That code has expired. Ask for a new one.");
      }
      entry.attempts += 1;
      if (entry.attempts > MAX_ATTEMPTS) {
        codes.delete(email);
        throw new AuthError(400, "Too many wrong codes. Ask for a new one.");
      }
      if (code.length !== 6 || !sameHash(hash(code), entry.codeHash)) {
        throw new AuthError(400, "That code isn't right. Check the email and try again.");
      }

      codes.delete(email);
      const token = randomBytes(32).toString("base64url");
      const user = { name: entry.name, email, role: roleFor(email) };
      sessions[hash(token)] = { ...user, created: Date.now(), expires: Date.now() + SESSION_TTL };
      saveSessions();
      return { token, user };
    },

    // The signed-in person for a request (Authorization: Bearer <token>), or null.
    userFromRequest(headers) {
      const header = typeof headers.get === "function" ? headers.get("authorization") : headers.authorization;
      const token = String(header ?? "").replace(/^Bearer\s+/i, "");
      if (!token) return null;
      const session = sessions[hash(token)];
      if (!session) return null;
      if (session.expires < Date.now()) {
        delete sessions[hash(token)];
        saveSessions();
        return null;
      }
      // Roles follow the current rules, so a changed team domain applies straight away.
      return { name: session.name, email: session.email, role: roleFor(session.email) };
    },

    signOut(headers) {
      const token = String(headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      if (token && sessions[hash(token)]) {
        delete sessions[hash(token)];
        saveSessions();
      }
    },

    // May this person snag and reply on this site?
    canUseSite(user, siteName) {
      if (!user) return false;
      return user.role === "team" || sites.isClientOf(user.email, siteName);
    },
  };
}
