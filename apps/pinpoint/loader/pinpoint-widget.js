/*!
 * PinPoint widget: draw a box on the page, leave a note, see and reply to notes already left.
 *
 * Loaded by pinpoint.js once someone has signed in:
 *
 *   <script src="https://your-pinpoint-server/pinpoint.js" data-site="test" defer></script>
 *
 * It talks to the same API as the inbox (/api/tcpinpoint), so feedback left here shows up there.
 * Everything is drawn inside a closed shadow root, so the site's CSS can't change it and its CSS
 * can't leak onto the site.
 */
(() => {
  if (window.PinPointWidget) return;

  const TYPES = { bug: "Bug", change: "Change", question: "Question", other: "Other" };
  const TYPE_COLOURS = { bug: "#d64536", change: "#e89c16", question: "#005ba4", other: "#808080" };
  const STATUSES = { open: "Open", in_progress: "In progress", resolved: "Resolved", wont_fix: "Won't fix" };
  const CLOSED = new Set(["resolved", "wont_fix"]);
  const MIN_BOX = 8; // a drag smaller than this counts as a click on one element

  // ---------------------------------------------------------------- styles

  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root { font: 14px/1.45 "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #15122e; }
    button, textarea { font: inherit; color: inherit; }
    button { cursor: pointer; }
    :focus-visible { outline: 2px solid #5b3df5; outline-offset: 2px; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

    /* the toolbar */
    .toolbar { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: flex; align-items: center; gap: 6px;
      padding: 6px; border-radius: 999px; background: #15122e; box-shadow: 0 12px 32px rgba(21,18,46,.3); }
    .tool { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%;
      background: #2a2650; color: #fff; transition: background .2s, transform .2s; }
    .tool:hover { background: #3a3566; }
    .tool[aria-pressed="false"] { background: transparent; color: #c9c6da; }
    .tool svg { width: 20px; height: 20px; }
    .tool-count { display: flex; gap: 8px; width: auto; padding: 0 14px; border-radius: 999px; font-weight: 600; }
    .tool-count svg { width: 18px; height: 18px; }
    .tool-main { width: 52px; height: 52px; background: #5b3df5; }
    .tool-main:hover { background: #4527d9; transform: scale(1.05); }
    .tool-main svg { width: 26px; height: 26px; }
    .toolbar :focus-visible { outline-color: #dcd5ff; }

    /* drawing a box */
    .draw { position: fixed; inset: 0; z-index: 2147483001; cursor: crosshair; background: rgba(21,18,46,.12); touch-action: none; }
    .bar { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 2147483002; display: flex; flex-wrap: wrap;
      align-items: center; justify-content: center; gap: 8px 14px; max-width: calc(100% - 32px); padding: 10px 12px 10px 18px;
      border-radius: 999px; background: #15122e; color: #fff; box-shadow: 0 8px 28px rgba(21,18,46,.3); font-weight: 500; }
    .bar button { border: 0; border-radius: 999px; padding: 6px 12px; background: rgba(255,255,255,.14); color: #fff; font-size: 13px; }
    .bar button:hover { background: rgba(255,255,255,.24); }
    .box { position: fixed; z-index: 2147483001; border: 3px solid #5b3df5; border-radius: 8px;
      background: rgba(91,61,245,.08); box-shadow: 0 0 0 9999px rgba(21,18,46,.12); pointer-events: none; }
    .box.hover { border-width: 2px; box-shadow: none; background: rgba(91,61,245,.06); }

    /* pins on the page */
    .pins { position: fixed; inset: 0; z-index: 2147482999; pointer-events: none; }
    .pin { position: fixed; display: grid; place-items: center; width: 28px; height: 28px; margin: -14px 0 0 -14px;
      border: 2px solid #fff; border-radius: 50%; background: #5b3df5; color: #fff; font-size: 12px; font-weight: 700;
      box-shadow: 0 3px 10px rgba(0,0,0,.3); pointer-events: auto; transition: transform .15s; }
    .pin:hover, .pin[aria-expanded="true"] { transform: scale(1.12); }
    .pin.in_progress { background: #e89c16; }

    /* cards: the new-feedback form and a feedback's details */
    .card { position: fixed; z-index: 2147483003; border: 2px solid #15122e; width: 340px; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px);
      overflow-y: auto; padding: 18px; border-radius: 16px; background: #fff; box-shadow: 0 16px 50px rgba(0,0,0,.22); }
    .card h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: -.01em; }
    .types { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 0 0 12px; padding: 0; border: 0; }
    .types legend { margin-bottom: 8px; font-size: 12px; font-weight: 700; color: #5b5873; text-transform: uppercase; letter-spacing: .06em; }
    .types button { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px; border: 1px solid #e4e2ee;
      border-radius: 10px; background: #fff; font-size: 12px; font-weight: 600; }
    .types button[aria-pressed="true"] { border-color: #15122e; background: #15122e; color: #fff; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex: none; }
    textarea { display: block; width: 100%; min-height: 96px; resize: vertical; padding: 10px 12px; border: 1px solid #c9c6da;
      border-radius: 10px; background: #fff; }
    textarea:focus { border-color: #15122e; outline: none; }
    .hint { margin: 6px 0 0; color: #5b5873; font-size: 12px; }
    .row { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .btn { min-height: 44px; border: 1px solid #15122e; border-radius: 999px; padding: 9px 18px; background: #15122e; color: #fff; font-weight: 600; }
    .btn.ghost { border: 2px solid #15122e; background: #fff; color: #15122e; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .error { margin: 10px 0 0; color: #c0392b; font-size: 13px; }
    .close { position: absolute; top: 10px; right: 10px; display: grid; place-items: center; width: 32px; height: 32px;
      border: 0; border-radius: 50%; background: none; }
    .close:hover { background: #f6f5fb; }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding-right: 30px; font-size: 12px; color: #5b5873; }
    .meta strong { color: #15122e; }
    .status { padding: 2px 8px; border-radius: 999px; background: #f6f5fb; color: #15122e; font-weight: 600; }
    .message { margin: 10px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 15px; font-weight: 500; }
    .replies { margin: 16px 0 0; padding: 0; list-style: none; }
    .reply { margin: 8px 0 0; padding: 10px 12px; border-radius: 12px; background: #f6f5fb; }
    .reply.team { background: #15122e; color: #fff; }
    .reply .who { font-size: 12px; font-weight: 700; }
    .reply .when { font-weight: 400; opacity: .7; }
    .reply p { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .card form textarea { min-height: 70px; margin-top: 14px; }
    .assign { margin-top: 16px; }
    .assign label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 700; color: #5b5873;
      text-transform: uppercase; letter-spacing: .06em; }
    select { display: block; width: 100%; padding: 9px 12px; border: 1px solid #c9c6da; border-radius: 10px;
      background: #fff; font: inherit; color: inherit; }
    select:focus { border-color: #15122e; outline: none; }

    /* list of everything on this page */
    .panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483003; display: flex; flex-direction: column;
      width: 380px; max-width: 100vw; background: #fff; box-shadow: -12px 0 40px rgba(0,0,0,.15); }
    .panel header { position: relative; padding: 20px 20px 14px; border-bottom: 1px solid #e4e2ee; }
    .panel h2 { margin: 0; font-size: 18px; }
    .panel header p { margin: 4px 0 0; color: #5b5873; font-size: 13px; }
    .panel .list { flex: 1; overflow-y: auto; padding: 8px 0 20px; }
    .panel h3 { margin: 16px 20px 6px; font-size: 11px; font-weight: 700; color: #5b5873; text-transform: uppercase; letter-spacing: .08em; }
    .item { display: block; width: 100%; padding: 12px 20px; border: 0; border-bottom: 1px solid #f0f0f0; background: none; text-align: left; }
    .item:hover, .item:focus-visible { background: #f6f5fb; }
    .item .top { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; }
    .item .num { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px;
      background: #5b3df5; color: #fff; font-size: 11px; }
    .item .text { display: -webkit-box; margin-top: 6px; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .item .sub { margin-top: 4px; font-size: 12px; color: #5b5873; }
    .empty { margin: 30px 20px; color: #5b5873; }
    details summary { margin: 16px 20px 6px; cursor: pointer; color: #5b5873; }
    details summary h3 { display: inline; margin: 0; }

    .toast { position: fixed; left: 50%; bottom: 100px; transform: translateX(-50%); z-index: 2147483004; padding: 10px 18px;
      border-radius: 999px; background: #15122e; color: #fff; font-weight: 500; box-shadow: 0 6px 24px rgba(0,0,0,.2); }
    .toast.error { background: #d64536; }

    /* phones: cards become sheets at the bottom of the screen */
    @media (max-width: 600px) {
      .card { left: 0 !important; right: 0; top: auto !important; bottom: 0; width: 100%; max-width: 100%; max-height: 80vh;
        border-radius: 18px 18px 0 0; }
      .panel { width: 100%; }
      .bar { top: auto; bottom: 90px; border-radius: 18px; }
    }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  `;

  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    draw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="M12 9v6M9 12h6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/></svg>',
    cursor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5 L6 19 L9.8 15.6 L12.5 21.3 L15.3 20 L12.6 14.4 L17.8 14.4 Z" fill="#FFFFFF" stroke="#15122E" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  // ---------------------------------------------------------------- small helpers

  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (key === "text") el.textContent = value;
      else if (key === "html") el.innerHTML = value; // only ever our own icons, never feedback text
      else if (key === "style") Object.assign(el.style, value);
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? "" : value);
    }
    for (const child of [children].flat()) if (child) el.append(child);
    return el;
  }

  function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function ago(iso) {
    const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
    if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} d ago`;
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  const clamp01 = (n) => Math.min(1, Math.max(0, n));
  const clamp = (min, value, max) => Math.min(max, Math.max(min, value));
  const round4 = (n) => clamp01(Math.round(n * 10_000) / 10_000);

  // ---------------------------------------------------------------- screenshots

  // html2canvas-pro draws the page onto a canvas. It's only loaded the first time someone leaves feedback.
  let screenshotLibrary = null;

  function loadScreenshotLibrary(server) {
    screenshotLibrary ??= new Promise((resolve) => {
      const found = () => window.html2canvas?.default ?? window.html2canvas ?? null;
      if (found()) return resolve(found());
      const tag = document.createElement("script");
      tag.src = `${server}/html2canvas.js`;
      tag.onload = () => resolve(typeof found() === "function" ? found() : null);
      tag.onerror = () => resolve(null);
      document.head.append(tag);
    });
    return screenshotLibrary;
  }

  // A JPEG of the area around the box (or the visible screen when there's no box), and where the box sits in it.
  // Returns null if anything goes wrong: the feedback is still sent, just without a screenshot.
  async function takeScreenshot(server, rect, isOurs) {
    const html2canvas = await loadScreenshotLibrary(server);
    if (!html2canvas) return null;

    const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    let area;
    let region = null;
    if (rect) {
      // Some of the page around the box, so it's clear where it is.
      const padX = clamp(48, rect.width * 0.6, 280);
      const padY = clamp(48, rect.height * 0.6, 220);
      const docX = window.scrollX + rect.left;
      const docY = window.scrollY + rect.top;
      const x = Math.max(0, docX - padX);
      const y = Math.max(0, docY - padY);
      area = { x, y, width: Math.min(docW, docX + rect.width + padX) - x, height: Math.min(docH, docY + rect.height + padY) - y };
      region = {
        xPct: round4((docX - x) / area.width),
        yPct: round4((docY - y) / area.height),
        wPct: round4(rect.width / area.width),
        hPct: round4(rect.height / area.height),
      };
    } else {
      area = { x: window.scrollX, y: window.scrollY, width: window.innerWidth, height: window.innerHeight };
    }
    if (area.width <= 0 || area.height <= 0) return null;

    try {
      const canvas = await html2canvas(document.body, {
        ...area,
        scale: window.devicePixelRatio || 1,
        useCORS: true,
        logging: false,
        ignoreElements: isOurs,
      });
      // At most 1200px wide, so the upload stays small.
      const ratio = Math.min(1, 1200 / canvas.width);
      const out = document.createElement("canvas");
      out.width = Math.round(canvas.width * ratio);
      out.height = Math.round(canvas.height * ratio);
      out.getContext("2d").drawImage(canvas, 0, 0, out.width, out.height);
      let dataUrl = out.toDataURL("image/jpeg", 0.85);
      if (dataUrl.length > 1_400_000) dataUrl = out.toDataURL("image/jpeg", 0.6);
      if (dataUrl.length > 1_400_000) return null;
      return { dataUrl, region };
    } catch (error) {
      console.warn("[pinpoint] Couldn't take a screenshot:", error);
      return null;
    }
  }

  // ---------------------------------------------------------------- finding elements on the page

  // A CSS selector that finds this element again: its id if unique, otherwise a path of tag:nth-of-type steps.
  function cssSelectorFor(el) {
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
    const steps = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node !== el && node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        steps.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const tag = node.localName;
      const sameTag = node.parentElement ? [...node.parentElement.children].filter((c) => c.localName === tag) : [];
      steps.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag);
      node = node.parentElement;
    }
    return steps.join(" > ");
  }

  function xpathFor(el) {
    const steps = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const tag = node.localName;
      const sameTag = node.parentElement ? [...node.parentElement.children].filter((c) => c.localName === tag) : [node];
      steps.unshift(sameTag.length > 1 ? `${tag}[${sameTag.indexOf(node) + 1}]` : tag);
    }
    return `/${steps.join("/")}`;
  }

  const flatText = (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

  // Everything needed to find this element again: id, CSS selector, XPath and some of its text.
  function describe(el) {
    const text = flatText(el);
    return {
      cssSelector: cssSelectorFor(el) || "body",
      xpath: xpathFor(el),
      textSnippet: text.slice(0, 200),
      elementTag: el.localName.slice(0, 50),
      ...(el.id && el.id.length <= 200 ? { elementId: el.id } : {}),
      textPrefix: "",
      textSuffix: "",
      fingerprint: `${el.localName}|${el.childElementCount}|${text.length}`,
      neighborText: flatText(el.parentElement ?? el)
        .replace(text, "")
        .trim()
        .slice(0, 200),
      anchorKey: el.closest("[data-feedback-anchor]")?.getAttribute("data-feedback-anchor")?.slice(0, 200) ?? null,
    };
  }

  // Find a saved element again: by id, then CSS selector, then XPath.
  function resolve(annotation) {
    const tries = [
      () => annotation.elementId && document.getElementById(annotation.elementId),
      () => !annotation.cssSelector.includes(">>>") && document.querySelector(annotation.cssSelector),
      () =>
        document.evaluate(annotation.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue,
    ];
    for (const attempt of tries) {
      try {
        const el = attempt();
        if (el && el.nodeType === 1) return el;
      } catch {
        // an old or odd selector: try the next way
      }
    }
    return null;
  }

  // The smallest element on the page that holds the whole box (ignoring our own widget).
  function elementHolding(rect, host) {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    let el = document.elementsFromPoint(x, y).find((e) => e !== host && !host.contains(e)) ?? document.body;
    while (el && el !== document.body && el !== document.documentElement) {
      const b = el.getBoundingClientRect();
      const holds =
        b.left <= rect.left + 2 && b.top <= rect.top + 2 && b.right >= rect.right - 2 && b.bottom >= rect.bottom - 2;
      if (holds) return el;
      el = el.parentElement;
    }
    return document.body;
  }

  // ---------------------------------------------------------------- the widget

  function init({ endpoint, projectName, token, identity, onAuthError }) {
    const host = document.createElement("div");
    host.setAttribute("data-tcpinpoint-ignore", "");
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>${STYLES}</style>`;
    const ui = h("div", { class: "root" });
    const pinLayer = h("div", { class: "pins" });
    const live = h("p", { class: "sr", role: "status", "aria-live": "polite" });
    ui.append(pinLayer, live);
    shadow.append(ui);
    document.body.append(host);

    const page = location.pathname;
    const server = new URL(endpoint).origin;
    // Leave PinPoint itself (this widget and the sign-in chip) out of screenshots.
    const isOurs = (el) => el === host || el.hasAttribute?.("data-tcpinpoint-ignore");
    let items = []; // feedback on this page, oldest first
    // Your team can assign feedback here too. Clients never see it (the server only answers your team).
    const team = identity.role === "team";
    let assigning = { assignments: {}, names: {}, people: [] };
    let pinsVisible = true;
    let layer = null; // whatever is open on top: the menu, drawing, a card or the panel
    let returnFocus = null;
    let frame = 0;
    let destroyed = false;

    // ---------------------------------------------------------------- talking to the server

    async function api(method, { query, body } = {}) {
      const url = new URL(endpoint);
      for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
      const response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) onAuthError?.();
      if (!response.ok) throw new Error(data?.error ?? data?.errors?.[0]?.message ?? "Something went wrong. Try again.");
      return data;
    }

    async function loadAssignments() {
      if (!team) return;
      try {
        const url = new URL(`${server}/api/assignments`);
        url.searchParams.set("project", projectName);
        const response = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
        if (response.ok) assigning = await response.json();
      } catch {
        // Assigning just isn't shown if this fails.
      }
    }

    async function assign(item, email) {
      const response = await fetch(`${server}/api/assignments`, {
        method: "PUT",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ feedbackId: item.id, email: email || null }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Couldn't assign it. Try again.");
      const assignments = { ...assigning.assignments };
      if (email) assignments[item.id] = email;
      else delete assignments[item.id];
      assigning = { ...assigning, assignments, names: { ...assigning.names, ...(data.name ? { [email]: data.name } : {}) } };
    }

    const personName = (email) => assigning.names?.[email] ?? email;

    async function load() {
      await loadAssignments();
      const data = await api("GET", { query: { projectName, url: page, limit: 100 } });
      items = [...data.feedbacks].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      renderToolbar();
      renderPins();
      if (layer?.kind === "panel") openPanel();
    }

    const numberOf = (item) => items.indexOf(item) + 1;
    const openItems = () => items.filter((item) => !CLOSED.has(item.status));

    // ---------------------------------------------------------------- messages

    function say(message, tone) {
      live.textContent = message;
      for (const old of ui.querySelectorAll(".toast")) old.remove();
      const toast = h("div", { class: `toast${tone === "error" ? " error" : ""}`, text: message });
      ui.append(toast);
      setTimeout(() => toast.remove(), 3200);
    }

    // ---------------------------------------------------------------- open and close things

    function open(kind, el, focusEl) {
      close(false);
      returnFocus = returnFocus ?? document.activeElement;
      layer = { kind, el };
      ui.append(el);
      (focusEl ?? el.querySelector("button, textarea"))?.focus();
      schedule();
    }

    function close(restoreFocus = true) {
      if (!layer) return;
      layer.el.remove();
      layer.box?.remove();
      layer = null;
      for (const pin of pinLayer.children) pin.setAttribute("aria-expanded", "false");
      if (restoreFocus) {
        const target = returnFocus?.isConnected ? returnFocus : fab;
        target.focus();
        returnFocus = null;
      }
    }

    // Esc closes whatever is open, wherever focus is.
    const onEscape = (event) => {
      if (event.key === "Escape" && layer) {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onEscape, true);

    // Tab stays inside a card or the panel.
    shadow.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && layer) {
        const focusable = [...layer.el.querySelectorAll("button, textarea, select")].filter((el) => !el.disabled);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && shadow.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && shadow.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    // ---------------------------------------------------------------- the toolbar: show or hide pins, the list, leave feedback

    const pinsToggle = h("button", {
      class: "tool",
      type: "button",
      "aria-pressed": "true",
      html: ICONS.eye,
      onclick: () => {
        pinsVisible = !pinsVisible;
        renderPins();
        renderToolbar();
        say(pinsVisible ? "Pins shown." : "Pins hidden.");
      },
    });
    const listCount = h("span", { "aria-hidden": "true" });
    const listButton = h("button", { class: "tool tool-count", type: "button", html: ICONS.chat, onclick: () => openPanel() });
    listButton.append(listCount);
    const fab = h("button", {
      class: "tool tool-main",
      type: "button",
      "aria-label": "Leave feedback",
      html: ICONS.cursor,
      onclick: () => (layer?.kind === "draw" ? close() : startDrawing()),
    });
    const toolbar = h("div", { class: "toolbar", role: "toolbar", "aria-label": "PinPoint feedback" }, [
      pinsToggle,
      listButton,
      fab,
    ]);
    ui.append(toolbar);

    function renderToolbar() {
      const count = openItems().length;
      listCount.textContent = count;
      listButton.setAttribute("aria-label", `Feedback on this page, ${count} open`);
      pinsToggle.setAttribute("aria-label", pinsVisible ? "Hide pins" : "Show pins");
      pinsToggle.setAttribute("aria-pressed", String(pinsVisible));
    }

    // ---------------------------------------------------------------- drawing a box

    function startDrawing() {
      loadScreenshotLibrary(server);
      returnFocus = fab;
      const surface = h("div", { class: "draw" });
      const hover = h("div", { class: "box hover", hidden: true });
      const bar = h("div", { class: "bar", role: "dialog", "aria-label": "Choose what your feedback is about" }, [
        h("span", { text: "Drag a box around what you want to comment on, or click an element." }),
        h("button", { type: "button", text: "Comment on the whole page", onclick: () => openForm(null) }),
        h("button", { type: "button", text: "Cancel", onclick: () => close() }),
      ]);
      const wrap = h("div", {}, [surface, hover, bar]);

      let start = null;
      let box = null;

      // Show which element a click would pick.
      surface.addEventListener("pointermove", (event) => {
        if (start) return;
        const target = document.elementsFromPoint(event.clientX, event.clientY).find((e) => e !== host);
        if (!target || target === document.body || target === document.documentElement) {
          hover.hidden = true;
          return;
        }
        const b = target.getBoundingClientRect();
        Object.assign(hover.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
        hover.hidden = false;
      });

      surface.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        surface.setPointerCapture(event.pointerId);
        start = { x: event.clientX, y: event.clientY };
        hover.hidden = true;
        box = h("div", { class: "box" });
        wrap.append(box);
      });

      surface.addEventListener("pointermove", (event) => {
        if (!start) return;
        const left = Math.min(start.x, event.clientX);
        const top = Math.min(start.y, event.clientY);
        Object.assign(box.style, {
          left: `${left}px`,
          top: `${top}px`,
          width: `${Math.abs(event.clientX - start.x)}px`,
          height: `${Math.abs(event.clientY - start.y)}px`,
        });
      });

      surface.addEventListener("pointerup", (event) => {
        if (!start) return;
        const width = Math.abs(event.clientX - start.x);
        const height = Math.abs(event.clientY - start.y);
        let rect;
        if (width < MIN_BOX && height < MIN_BOX) {
          // A click: pick the element under the pointer.
          const target = document.elementsFromPoint(event.clientX, event.clientY).find((e) => e !== host);
          rect = (target ?? document.body).getBoundingClientRect();
        } else {
          rect = new DOMRect(Math.min(start.x, event.clientX), Math.min(start.y, event.clientY), width, height);
        }
        start = null;
        openForm(rect);
      });

      open("draw", wrap, bar.querySelector("button"));
    }

    // ---------------------------------------------------------------- the new-feedback form

    // rect is where the box was drawn (on screen), or null for the whole page.
    function openForm(rect) {
      const screenshot = takeScreenshot(server, rect, isOurs);
      let annotation = null;
      let anchorEl = null;
      if (rect) {
        anchorEl = elementHolding(rect, host);
        const b = anchorEl.getBoundingClientRect();
        annotation = {
          anchor: describe(anchorEl),
          rect: {
            xPct: clamp01((rect.left - b.left) / (b.width || 1)),
            yPct: clamp01((rect.top - b.top) / (b.height || 1)),
            wPct: clamp01(rect.width / (b.width || 1)),
            hPct: clamp01(rect.height / (b.height || 1)),
          },
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          viewportW: Math.max(1, Math.round(window.innerWidth)),
          viewportH: Math.max(1, Math.round(window.innerHeight)),
          devicePixelRatio: window.devicePixelRatio || 1,
        };
      }

      let type = null;
      const typeButtons = Object.entries(TYPES).map(([value, label]) =>
        h(
          "button",
          {
            type: "button",
            "aria-pressed": "false",
            onclick: () => {
              type = value;
              for (const b of typeButtons) b.setAttribute("aria-pressed", String(b.dataset.type === value));
              update();
            },
            "data-type": value,
          },
          [h("span", { class: "dot", style: { background: TYPE_COLOURS[value] } }), h("span", { text: label })],
        ),
      );
      const message = h("textarea", {
        id: "ppw-message",
        maxlength: "5000",
        placeholder: "What should change?",
        "aria-label": "Your feedback",
      });
      const error = h("p", { class: "error", role: "alert" });
      const send = h("button", { class: "btn", type: "submit", text: "Send", disabled: true });
      const update = () => {
        send.disabled = !type || !message.value.trim();
      };
      message.addEventListener("input", update);
      message.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !send.disabled) form.requestSubmit();
      });

      const form = h(
        "form",
        {
          class: "card",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "ppw-form-title",
          onsubmit: async (event) => {
            event.preventDefault();
            error.textContent = "";
            send.disabled = true;
            send.textContent = "Sending…";
            try {
              // Wait up to 10 seconds for the screenshot, then send without it.
              const shot = await Promise.race([screenshot, new Promise((r) => setTimeout(() => r(null), 10_000))]);
              await api("POST", {
                body: {
                  projectName,
                  type,
                  message: message.value.trim(),
                  url: page,
                  viewport: `${window.innerWidth}x${window.innerHeight}`,
                  userAgent: navigator.userAgent.slice(0, 500),
                  // The server stamps these from your sign-in anyway, so nobody can post as someone else.
                  authorName: identity.name,
                  authorEmail: identity.email,
                  annotations: annotation ? [annotation] : [],
                  clientId: newId(),
                  ...(shot ? { screenshotDataUrl: shot.dataUrl, screenshotRegion: shot.region } : {}),
                },
              });
              close();
              say("Thanks, your feedback has been sent.");
              await load();
            } catch (e) {
              error.textContent = e.message;
              send.textContent = "Send";
              update();
            }
          },
        },
        [
          h("button", { class: "close", type: "button", "aria-label": "Cancel", html: ICONS.close, onclick: () => close() }),
          h("h2", { id: "ppw-form-title", text: rect ? "Leave feedback" : "Feedback on the whole page" }),
          h("fieldset", { class: "types" }, [h("legend", { text: "What kind?" }), ...typeButtons]),
          message,
          h("p", { class: "hint", text: "Ctrl or ⌘ + Enter to send" }),
          error,
          h("div", { class: "row" }, [
            h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: () => close() }),
            send,
          ]),
        ],
      );

      returnFocus = fab;
      open("form", form, typeButtons[0]);
      if (rect) {
        // Keep the drawn box on the element while the form is open, even if the page scrolls.
        const box = h("div", { class: "box" });
        ui.append(box);
        layer.box = box;
        layer.place = () => {
          const b = anchorEl.getBoundingClientRect();
          const r = {
            left: b.left + annotation.rect.xPct * b.width,
            top: b.top + annotation.rect.yPct * b.height,
            width: annotation.rect.wPct * b.width,
            height: annotation.rect.hPct * b.height,
          };
          Object.assign(box.style, {
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
          });
          placeCard(form, r);
        };
      } else {
        placeCard(form, null);
      }
      schedule();
    }

    // Put a card next to a box: below it if there's room, otherwise above, otherwise in the middle.
    function placeCard(card, r) {
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      const gap = 12;
      let left;
      let top;
      if (!r) {
        left = (window.innerWidth - width) / 2;
        top = (window.innerHeight - height) / 2;
      } else {
        left = r.left;
        if (r.top + r.height + gap + height <= window.innerHeight) top = r.top + r.height + gap;
        else if (r.top - gap - height >= 0) top = r.top - gap - height;
        else top = (window.innerHeight - height) / 2;
      }
      card.style.left = `${Math.min(Math.max(12, left), window.innerWidth - width - 12)}px`;
      card.style.top = `${Math.min(Math.max(12, top), window.innerHeight - height - 12)}px`;
    }

    // ---------------------------------------------------------------- pins on the page

    function boxFor(item) {
      const annotation = item.annotations?.[0];
      if (!annotation) return null;
      const el = resolve(annotation);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      if (!b.width && !b.height) return null; // hidden right now
      return {
        left: b.left + annotation.xPct * b.width,
        top: b.top + annotation.yPct * b.height,
        width: annotation.wPct * b.width,
        height: annotation.hPct * b.height,
      };
    }

    function renderPins() {
      pinLayer.replaceChildren();
      if (!pinsVisible) return;
      for (const item of openItems().filter((i) => i.annotations?.length)) {
        const pin = h("button", {
          class: `pin ${item.status}`,
          type: "button",
          "aria-expanded": "false",
          "aria-label": `Feedback ${numberOf(item)}: ${TYPES[item.type] ?? "Feedback"} from ${item.authorName}`,
          text: String(numberOf(item)),
          onclick: () => openDetail(item),
        });
        pin.dataset.id = item.id;
        pinLayer.append(pin);
      }
      schedule();
    }

    // Keep pins (and any open card) on their elements as the page scrolls or changes size.
    function placeAll() {
      frame = 0;
      for (const pin of pinLayer.children) {
        const item = items.find((i) => i.id === pin.dataset.id);
        const box = item && boxFor(item);
        pin.hidden = !box;
        if (box) {
          pin.style.left = `${box.left}px`;
          pin.style.top = `${box.top}px`;
        }
      }
      layer?.place?.();
    }

    function schedule() {
      if (!frame && !destroyed) frame = requestAnimationFrame(placeAll);
    }

    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    const resizes = new ResizeObserver(schedule);
    resizes.observe(document.body);
    const ticker = setInterval(schedule, 1000); // catches late-loading images and fonts

    // ---------------------------------------------------------------- a feedback's details and replies

    function openDetail(item) {
      const replies = h(
        "ol",
        { class: "replies", "aria-label": "Replies" },
        (item.comments ?? []).map((comment) =>
          h("li", { class: `reply${comment.authorRole === "team" ? " team" : ""}` }, [
            h("div", { class: "who" }, [
              comment.authorName,
              h("span", { class: "when", text: ` · ${ago(comment.createdAt)}` }),
            ]),
            h("p", { text: comment.body }),
          ]),
        ),
      );

      const canReply = item.permissions?.canComment !== false;
      const reply = h("textarea", { maxlength: "5000", placeholder: "Write a reply…", "aria-label": "Your reply" });
      const error = h("p", { class: "error", role: "alert" });
      const send = h("button", { class: "btn", type: "submit", text: "Reply", disabled: true });
      reply.addEventListener("input", () => {
        send.disabled = !reply.value.trim();
      });
      reply.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !send.disabled) replyForm.requestSubmit();
      });
      const replyForm = h(
        "form",
        {
          onsubmit: async (event) => {
            event.preventDefault();
            send.disabled = true;
            error.textContent = "";
            try {
              const comment = await api("POST", {
                body: {
                  projectName,
                  feedbackId: item.id,
                  body: reply.value.trim(),
                  authorName: identity.name,
                  authorEmail: identity.email,
                  clientId: newId(),
                },
              });
              item.comments = [...(item.comments ?? []), comment];
              say("Reply sent.");
              openDetail(item);
            } catch (e) {
              error.textContent = e.message;
              send.disabled = false;
            }
          },
        },
        [reply, error, h("div", { class: "row" }, [send])],
      );

      let assignControl = null;
      if (team) {
        const current = assigning.assignments?.[item.id] ?? "";
        const people = [...new Set([...(assigning.people ?? []), ...(current ? [current] : [])])];
        if (people.length) {
          const select = h("select", { id: "ppw-assignee" }, [
            h("option", { value: "", text: "Nobody", selected: !current }),
            ...people.map((email) =>
              h("option", {
                value: email,
                text: personName(email),
                selected: email === current,
              }),
            ),
          ]);
          select.addEventListener("change", async () => {
            const email = select.value;
            select.disabled = true;
            try {
              await assign(item, email);
              if (!email) say("Unassigned.");
              else if (email === identity.email) say("Assigned to you.");
              else say(`Assigned to ${personName(email)}. They've been emailed.`);
            } catch (e) {
              select.value = current;
              say(e.message, "error");
            } finally {
              select.disabled = false;
            }
          });
          assignControl = h("div", { class: "assign" }, [h("label", { for: "ppw-assignee", text: "Assigned to" }), select]);
        }
      }

      const card = h("div", { class: "card", role: "dialog", "aria-modal": "true", "aria-labelledby": "ppw-detail-title" }, [
        h("button", { class: "close", type: "button", "aria-label": "Close", html: ICONS.close, onclick: () => close() }),
        h("div", { class: "meta" }, [
          h("span", { class: "dot", style: { background: TYPE_COLOURS[item.type] } }),
          h("strong", { text: `${numberOf(item)}. ${TYPES[item.type] ?? "Feedback"}` }),
          h("span", { class: "status", text: STATUSES[item.status] ?? item.status }),
          h("span", { text: `${item.authorName} · ${ago(item.createdAt)}` }),
        ]),
        h("p", { class: "message", id: "ppw-detail-title", text: item.message }),
        assignControl,
        item.comments?.length ? replies : null,
        canReply && !CLOSED.has(item.status) ? replyForm : null,
      ]);

      const keepFocus = returnFocus;
      open("detail", card, card.querySelector(".close"));
      returnFocus = keepFocus ?? pinLayer.querySelector(`[data-id="${item.id}"]`) ?? fab;
      pinLayer.querySelector(`[data-id="${item.id}"]`)?.setAttribute("aria-expanded", "true");
      layer.place = () => placeCard(card, boxFor(item));
      schedule();
    }

    // ---------------------------------------------------------------- everything on this page

    function openPanel() {
      const row = (item) =>
        h(
          "button",
          {
            class: "item",
            type: "button",
            onclick: () => {
              const annotation = item.annotations?.[0];
              const el = annotation && resolve(annotation);
              el?.scrollIntoView({ block: "center", behavior: "smooth" });
              returnFocus = fab;
              setTimeout(() => openDetail(item), el ? 350 : 0);
            },
          },
          [
            h("span", { class: "top" }, [
              h("span", { class: "num", text: String(numberOf(item)) }),
              h("span", { class: "dot", style: { background: TYPE_COLOURS[item.type] } }),
              h("span", { text: TYPES[item.type] ?? "Feedback" }),
              item.status === "in_progress" ? h("span", { class: "status", text: "In progress" }) : null,
            ]),
            h("span", { class: "text", text: item.message }),
            h("span", {
              class: "sub",
              text: [
                `${item.authorName} · ${ago(item.createdAt)}`,
                item.comments?.length ? `${item.comments.length} ${item.comments.length === 1 ? "reply" : "replies"}` : null,
                assigning.assignments?.[item.id] ? `Assigned to ${personName(assigning.assignments[item.id])}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }),
          ],
        );

      const todo = openItems();
      const done = items.filter((item) => CLOSED.has(item.status));
      const list = h("div", { class: "list" }, [
        items.length ? null : h("p", { class: "empty", text: "No feedback on this page yet." }),
        todo.length ? h("h3", { text: `To do (${todo.length})` }) : null,
        ...todo.map(row),
        done.length
          ? h("details", {}, [h("summary", {}, [h("h3", { text: `Done (${done.length})` })]), ...done.map(row)])
          : null,
      ]);

      const panel = h("aside", { class: "panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "ppw-panel-title" }, [
        h("header", {}, [
          h("h2", { id: "ppw-panel-title", text: "Feedback on this page" }),
          h("p", { text: page }),
          h("button", { class: "close", type: "button", "aria-label": "Close", html: ICONS.close, onclick: () => close() }),
        ]),
        list,
      ]);
      returnFocus = fab;
      open("panel", panel, panel.querySelector(".close"));
    }

    // ---------------------------------------------------------------- start

    renderToolbar();
    load()
      .then(() => {
        // A link from an email or the inbox (?tcpinpoint=<id>) opens that feedback.
        const params = new URLSearchParams(location.search);
        const wanted = params.get("tcpinpoint");
        if (!wanted) return;
        params.delete("tcpinpoint");
        const rest = params.toString();
        const clean = `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`;
        history.replaceState(history.state, "", clean);
        const item = items.find((i) => i.id === wanted);
        if (!item) return say("That feedback isn't on this page any more.", "error");
        const annotation = item.annotations?.[0];
        resolve(annotation ?? {})?.scrollIntoView({ block: "center" });
        openDetail(item);
      })
      .catch((e) => say(e.message, "error"));

    return {
      reload: load,
      destroy() {
        destroyed = true;
        cancelAnimationFrame(frame);
        clearInterval(ticker);
        resizes.disconnect();
        window.removeEventListener("scroll", schedule, { capture: true });
        window.removeEventListener("resize", schedule);
        document.removeEventListener("keydown", onEscape, true);
        host.remove();
      },
    };
  }

  window.PinPointWidget = { init };
})();
