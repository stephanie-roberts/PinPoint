import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { readJson, writeJson } from "./json-file.js";
import { isEmail, normaliseEmail } from "./sites.js";

// Codes expire after 10 minutes; sessions last 30 days.
// Only hashes of codes and session tokens are stored.
const CODE_TTL = 10 * 60 * 1000;
const CODE_RESEND_GAP = 30 * 1000;
const MAX_ATTEMPTS = 5;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const LIMIT_WINDOW = 10 * 60 * 1000; // how far back the rate limits look
const NAME_MAX = 100;

const hash = (value) => createHash("sha256").update(value).digest("hex");

function sameHash(first, second) {
  const firstBuffer = Buffer.from(first, "hex");
  const secondBuffer = Buffer.from(second, "hex");

  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

function tokenFromHeaders(headers) {
  const authorization = typeof headers.get === "function" ? headers.get("authorization") : headers.authorization;

  return String(authorization ?? "").replace(/^Bearer\s+/i, "");
}

// Return true when a key exceeds its sliding-window limit.
function createLimiter(limit, windowMs) {
  const hits = new Map();

  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);

    recent.push(now);
    hits.set(key, recent);

    if (hits.size > 10_000) hits.clear();

    return recent.length > limit;
  };
}

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function createAuth({ sessionsFile, teamDomains, sites, mailer }) {
  const codes = new Map();
  const tooManyCodes = createLimiter(10, LIMIT_WINDOW);
  const tooManyGuesses = createLimiter(30, LIMIT_WINDOW);

  const sessions = Object.fromEntries(
    Object.entries(readJson(sessionsFile, {})).filter(([, session]) => session.expires > Date.now()),
  );

  const saveSessions = () => writeJson(sessionsFile, sessions);

  const isTeam = (email) => teamDomains.some((domain) => email.endsWith(`@${domain}`));

  const roleFor = (email) => (isTeam(email) ? "team" : "client");

  function canSignIn(email, siteName) {
    return isTeam(email) || (Boolean(siteName) && sites.isClientOf(email, siteName));
  }

  return {
    isTeam,

    async requestCode(input, ip) {
      const email = normaliseEmail(input.email);
      const name = String(input.name ?? "")
        .trim()
        .slice(0, NAME_MAX);
      const siteName = input.site ? String(input.site) : null;

      if (!name) {
        throw new AuthError(400, "Please enter your name.");
      }

      if (!isEmail(email)) {
        throw new AuthError(400, "Please enter a valid email address.");
      }

      if (siteName && !sites.get(siteName)) {
        throw new AuthError(400, "This website isn't set up for feedback.");
      }

      if (!siteName && !isTeam(email)) {
        throw new AuthError(403, "The inbox is for your team. Clients leave feedback on their own website.");
      }

      if (tooManyCodes(`ip:${ip}`) || tooManyCodes(`email:${email}`)) {
        throw new AuthError(429, "Too many code requests. Please wait a few minutes and try again.");
      }

      // Keep the response identical for invited and uninvited clients.
      if (!canSignIn(email, siteName)) return;

      const now = Date.now();
      const existing = codes.get(email);

      if (existing && now - existing.sentAt < CODE_RESEND_GAP) return;

      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

      codes.set(email, {
        codeHash: hash(code),
        name,
        siteName,
        expires: now + CODE_TTL,
        attempts: 0,
        sentAt: now,
      });

      try {
        await mailer.sendCode({ to: email, name, code, siteName });
      } catch (error) {
        codes.delete(email);

        console.error("[pinpoint] Couldn't send a sign-in code:", error.message);

        throw new AuthError(502, "We couldn't send your code. Please try again in a minute.");
      }
    },

    verifyCode(input, ip) {
      const email = normaliseEmail(input.email);
      const code = String(input.code ?? "").replace(/\D/g, "");

      if (tooManyGuesses(`ip:${ip}`)) {
        throw new AuthError(429, "Too many attempts. Please wait a few minutes and try again.");
      }

      const entry = codes.get(email);

      if (!entry || entry.expires < Date.now()) {
        codes.delete(email);

        throw new AuthError(400, "Your code has expired. Please request a new one.");
      }

      entry.attempts += 1;

      if (entry.attempts > MAX_ATTEMPTS) {
        codes.delete(email);

        throw new AuthError(400, "Too many incorrect attempts. Please request a new code.");
      }

      if (code.length !== 6 || !sameHash(hash(code), entry.codeHash)) {
        throw new AuthError(400, "That code isn't correct. Please check your email and try again.");
      }

      codes.delete(email);

      const now = Date.now();
      const token = randomBytes(32).toString("base64url");
      const user = {
        name: entry.name,
        email,
        role: roleFor(email),
      };

      sessions[hash(token)] = {
        ...user,
        created: now,
        expires: now + SESSION_TTL,
      };

      saveSessions();

      return { token, user };
    },

    userFromRequest(headers) {
      const token = tokenFromHeaders(headers);

      if (!token) return null;

      const sessionHash = hash(token);
      const session = sessions[sessionHash];

      if (!session) return null;

      if (session.expires < Date.now()) {
        delete sessions[sessionHash];
        saveSessions();

        return null;
      }

      // Apply current team-domain rules to existing sessions.
      return {
        name: session.name,
        email: session.email,
        role: roleFor(session.email),
      };
    },

    signOut(headers) {
      const token = tokenFromHeaders(headers);

      if (!token) return;

      const sessionHash = hash(token);

      if (!sessions[sessionHash]) return;

      delete sessions[sessionHash];
      saveSessions();
    },

    nameFor(email) {
      let latestSession = null;

      for (const session of Object.values(sessions)) {
        if (session.email !== email) continue;

        if (!latestSession || session.created > latestSession.created) {
          latestSession = session;
        }
      }

      return latestSession?.name ?? null;
    },

    canUseSite(user, siteName) {
      if (!user) return false;

      return user.role === "team" || sites.isClientOf(user.email, siteName);
    },
  };
}
