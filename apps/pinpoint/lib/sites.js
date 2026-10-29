// Your client sites: a name, the addresses the widget runs on, the client emails invited to snag it,
// and the team emails notified about new snags and client replies.
// Saved to data/sites.json and managed from the inbox's Sites screen.

import { existsSync } from "node:fs";
import { readJson, writeJson } from "./json-file.js";

const SITE_NAME = /^[a-z0-9][a-z0-9-]{0,59}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normaliseEmail = (email) =>
  String(email ?? "")
    .trim()
    .toLowerCase();
export const isEmail = (email) => EMAIL.test(email) && email.length <= 254;

// "https://www.test.org/about" → "https://www.test.org"; anything that isn't http(s) → null
function toOrigin(address) {
  try {
    const url = new URL(String(address).trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function validateSite(input) {
  const name = String(input?.name ?? "")
    .trim()
    .toLowerCase();
  if (!SITE_NAME.test(name)) {
    return { error: "Use a short name of letters, numbers and dashes, like test or ards-dental." };
  }

  const rawAddresses = Array.isArray(input?.addresses) ? input.addresses : [];
  const addresses = [...new Set(rawAddresses.map(toOrigin))];
  if (!rawAddresses.length || addresses.includes(null)) {
    return { error: "Add the site's full address, starting with https:// (or http:// for local sites)." };
  }
  if (addresses.length > 10) return { error: "A site can have up to 10 addresses." };

  const emails = (list) => [...new Set((Array.isArray(list) ? list : []).map(normaliseEmail).filter(Boolean))];
  const clients = emails(input?.clients);
  const notify = emails(input?.notify);
  const bad = [...clients, ...notify].find((email) => !isEmail(email));
  if (bad) return { error: `"${bad}" doesn't look like an email address.` };
  if (clients.length > 200) return { error: "A site can have up to 200 clients." };
  if (notify.length > 50) return { error: "A site can notify up to 50 people." };

  return { site: { name, addresses, clients, notify } };
}

export function createSites({ file, dev, port, onChange }) {
  let sites;

  if (existsSync(file)) {
    // Older files have no client or notify lists yet.
    sites = readJson(file, []).map((site) => ({ clients: [], notify: [], ...site }));
  } else {
    // First run: start with the practice page (npm run dev only), so there's something to try.
    sites = dev ? [{ name: "test", addresses: [`http://localhost:${port}`], clients: [], notify: [] }] : [];
    writeJson(file, sites);
  }

  function save(next) {
    writeJson(file, next);
    sites = next;
    onChange?.();
  }

  return {
    all: () => sites,
    get: (name) => sites.find((site) => site.name === name) ?? null,
    origins: () => [...new Set(sites.flatMap((site) => site.addresses))],
    isClientOf: (email, name) => Boolean(sites.find((site) => site.name === name)?.clients.includes(email)),

    upsert(input) {
      const { site, error } = validateSite(input);
      if (error) return { error };
      const exists = sites.some((s) => s.name === site.name);
      save(exists ? sites.map((s) => (s.name === site.name ? site : s)) : [...sites, site]);
      return { site, created: !exists };
    },

    remove(name) {
      if (!sites.some((s) => s.name === name)) return false;
      save(sites.filter((s) => s.name !== name));
      return true;
    },
  };
}
