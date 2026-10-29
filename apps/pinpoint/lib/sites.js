import { existsSync } from "node:fs";
import { readJson, writeJson } from "./json-file.js";

// Site settings are saved to data/sites.json and managed in the inbox.
const SITE_NAME = /^[a-z0-9][a-z0-9-]{0,59}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normaliseEmail = (email) =>
  String(email ?? "")
    .trim()
    .toLowerCase();

export const isEmail = (email) => EMAIL.test(email) && email.length <= 254;

function normaliseEmails(value) {
  const emails = Array.isArray(value) ? value : [];
  return [...new Set(emails.map(normaliseEmail).filter(Boolean))];
}

// Keep the origin only, removing paths, queries and fragments.
function toOrigin(address) {
  try {
    const url = new URL(String(address).trim());

    return ["http:", "https:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

function validateSite(input) {
  const name = String(input?.name ?? "")
    .trim()
    .toLowerCase();

  if (!SITE_NAME.test(name)) {
    return {
      error: "Use 1–60 lowercase letters, numbers or dashes. Start with a letter or number.",
    };
  }

  const rawAddresses = Array.isArray(input?.addresses) ? input.addresses : [];

  const addresses = [...new Set(rawAddresses.map(toOrigin))];

  if (!addresses.length || addresses.includes(null)) {
    return {
      error: "Enter a full website URL starting with https:// or http://.",
    };
  }

  if (addresses.length > 10) {
    return { error: "A site can have up to 10 website URLs." };
  }

  const clients = normaliseEmails(input?.clients);
  const notify = normaliseEmails(input?.notify);
  const invalidEmail = [...clients, ...notify].find((email) => !isEmail(email));

  if (invalidEmail) {
    return {
      error: `"${invalidEmail}" doesn't look like a valid email address.`,
    };
  }

  if (clients.length > 200) {
    return { error: "A site can have up to 200 clients." };
  }

  if (notify.length > 50) {
    return { error: "A site can notify up to 50 people." };
  }

  return { site: { name, addresses, clients, notify } };
}

export function createSites({ file, dev, port, onChange }) {
  let sites;

  if (existsSync(file)) {
    // Support older files without client or notification lists.
    sites = readJson(file, []).map((site) => ({
      clients: [],
      notify: [],
      ...site,
    }));
  } else {
    // Include a practice site when running locally.
    sites = dev
      ? [
          {
            name: "test",
            addresses: [`http://localhost:${port}`],
            clients: [],
            notify: [],
          },
        ]
      : [];

    writeJson(file, sites);
  }

  const getSite = (name) => sites.find((site) => site.name === name) ?? null;

  function save(nextSites) {
    writeJson(file, nextSites);
    sites = nextSites;
    onChange?.();
  }

  return {
    all: () => sites,

    get: getSite,

    origins: () => [...new Set(sites.flatMap((site) => site.addresses))],

    isClientOf: (email, name) => getSite(name)?.clients.includes(email) ?? false,

    upsert(input) {
      const { site, error } = validateSite(input);

      if (error) return { error };

      const exists = Boolean(getSite(site.name));

      const nextSites = exists
        ? sites.map((existing) => (existing.name === site.name ? site : existing))
        : [...sites, site];
      save(nextSites);
      return { site, created: !exists };
    },

    remove(name) {
      if (!getSite(name)) return false;
      save(sites.filter((site) => site.name !== name));
      return true;
    },
  };
}
