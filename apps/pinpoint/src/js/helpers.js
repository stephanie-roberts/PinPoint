// A feedback's url is written by the visitor's browser, so only http(s) becomes a link.
export function parseHttpUrl(url, base) {
  try {
    const parsed = new URL(url, base);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

// Screenshots are stored as https URLs or inline data URLs; nothing else is rendered.
export function safeImageUrl(url) {
  if (!url) return null;
  if (/^data:image\/(jpeg|png|webp);base64,/.test(url)) return url;
  return parseHttpUrl(url)?.protocol === "https:" || url.startsWith("http://localhost") ? url : null;
}

const UNITS = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

export function relativeTime(value) {
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

const full = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function formatDate(value) {
  return full.format(new Date(value));
}

// "Mozilla/5.0 (Macintosh…) … Version/18.1 Safari/605.1.15" → "Safari 18 on macOS"
export function shortBrowser(userAgent = "") {
  const browser =
    [
      [/Edg\/(\d+)/, "Edge"],
      [/OPR\/(\d+)/, "Opera"],
      [/Firefox\/(\d+)/, "Firefox"],
      [/Chrome\/(\d+)/, "Chrome"],
      [/Version\/(\d+).*Safari/, "Safari"],
    ]
      .map(([pattern, name]) => {
        const match = userAgent.match(pattern);
        return match ? `${name} ${match[1]}` : null;
      })
      .find(Boolean) ?? "Unknown browser";
  const os =
    [
      [/iPhone|iPad/, "iOS"],
      [/Android/, "Android"],
      [/Mac OS X/, "macOS"],
      [/Windows/, "Windows"],
      [/Linux/, "Linux"],
    ].find(([pattern]) => pattern.test(userAgent))?.[1] ?? "";
  return os ? `${browser} on ${os}` : browser;
}
