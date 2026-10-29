/*!
 * PinPoint for client sites.
 *
 *   <script src="https://your-pinpoint-server/pinpoint.js" data-site="test" defer></script>
 *
 * Nothing shows to ordinary visitors. Open the site with ?feedback on the end of the address,
 * sign in with your name and email (a code is emailed to you), and the snagging widget appears.
 * It stays on in that browser until you sign out. ?feedback=off turns it off again.
 */
(() => {
  if (window.__tcpinpoint) return;
  window.__tcpinpoint = true;

  const script = document.currentScript;
  const site = script?.dataset.site;
  if (!script || !site) {
    console.warn('[tcpinpoint] Add data-site="your-site-name" to the pinpoint.js script tag.');
    return;
  }

  const server = new URL(script.src).origin;
  const SESSION_KEY = `tcpinpoint:session:${server}`;
  const ON_KEY = `tcpinpoint:on:${site}`;

  const store = {
    get(key) {
      try {
        return JSON.parse(localStorage.getItem(key));
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Private browsing: it works for this page only.
      }
    },
  };

  async function api(path, { method = "GET", body, token } = {}) {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(server + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Object.assign(new Error(data.error || "Something went wrong."), { status: response.status });
    return data;
  }

  // ---------------------------------------------------------------- UI (in its own shadow root)

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .ui { font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0a0a0a; }
    button, input { font: inherit; color: inherit; }
    :focus-visible { outline: 2px solid #0066ff; outline-offset: 2px; }
    .pill { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; border: 0; border-radius: 999px; padding: 12px 18px;
      background: #0a0a0a; color: #fff; font-weight: 600; cursor: pointer; box-shadow: 0 6px 24px rgba(0,0,0,.2); }
    .chip { position: fixed; left: 20px; bottom: 20px; z-index: 2147483000; display: flex; gap: 10px; align-items: center;
      padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,.95); box-shadow: 0 2px 12px rgba(0,0,0,.15); font-size: 13px; }
    .chip button { border: 0; background: none; padding: 0; text-decoration: underline; cursor: pointer; }
    .backdrop { position: fixed; inset: 0; z-index: 2147483001; display: grid; place-items: center; padding: 16px; background: rgba(10,10,10,.45); }
    .card { width: min(400px, 100%); background: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
    h2 { margin: 0 0 6px; font-size: 20px; }
    p { margin: 0 0 18px; color: #555; }
    label { display: block; margin: 14px 0 6px; font-size: 13px; font-weight: 600; }
    input { width: 100%; padding: 11px 12px; border: 1px solid #d0d0d0; border-radius: 10px; background: #fff; }
    input:focus { border-color: #0a0a0a; outline: none; }
    .code { letter-spacing: .4em; font-size: 22px; text-align: center; }
    .row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px; flex-wrap: wrap; }
    .btn { border: 1px solid #0a0a0a; border-radius: 999px; padding: 10px 18px; background: #0a0a0a; color: #fff; font-weight: 600; cursor: pointer; }
    .btn.ghost { background: #fff; color: #0a0a0a; border-color: #d0d0d0; }
    .btn:disabled { opacity: .6; cursor: progress; }
    .error { color: #c0392b; margin: 14px 0 0; }
    .link { border: 0; background: none; padding: 0; color: #0a0a0a; text-decoration: underline; cursor: pointer; font-size: 14px; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `;

  const host = document.createElement("div");
  host.setAttribute("data-tcpinpoint-ignore", "");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${CSS}</style><div class="ui"></div>`;
  const ui = root.querySelector(".ui");

  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "text") el.textContent = value;
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else if (value !== false && value != null) el.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children) if (child) el.append(child);
    return el;
  }

  function mount() {
    if (!host.isConnected) document.body.append(host);
  }

  let returnFocus = null;

  function showPill() {
    mount();
    ui.replaceChildren(
      h("button", { class: "pill", type: "button", text: "Sign in to leave feedback", onclick: () => openSignIn() }),
    );
  }

  function openSignIn(message = "") {
    returnFocus = document.activeElement;
    const name = h("input", { id: "tcp-name", autocomplete: "name", required: true, maxlength: "100" });
    const email = h("input", { id: "tcp-email", type: "email", autocomplete: "email", required: true });
    const error = h("p", { class: "error", role: "alert", text: message });
    const send = h("button", { class: "btn", type: "submit", text: "Email me a code" });

    const saved = store.get(`${SESSION_KEY}:last`);
    if (saved) {
      name.value = saved.name ?? "";
      email.value = saved.email ?? "";
    }

    const form = h(
      "form",
      {
        class: "card",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "tcp-title",
        onsubmit: async (event) => {
          event.preventDefault();
          error.textContent = "";
          send.disabled = true;
          send.textContent = "Sending…";
          try {
            await api("/api/auth/code", { method: "POST", body: { name: name.value, email: email.value, site } });
            store.set(`${SESSION_KEY}:last`, { name: name.value.trim(), email: email.value.trim() });
            openCode(email.value.trim());
          } catch (e) {
            error.textContent = e.message;
            send.disabled = false;
            send.textContent = "Email me a code";
          }
        },
      },
      [
        h("h2", { id: "tcp-title", text: "Leave feedback on this site" }),
        h("p", { text: "We'll email you a 6-digit code to check it's you." }),
        h("label", { for: "tcp-name", text: "Your name" }),
        name,
        h("label", { for: "tcp-email", text: "Email" }),
        email,
        error,
        h("div", { class: "row" }, [
          h("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: () => closeDialog() }),
          send,
        ]),
      ],
    );
    showDialog(form, saved?.name ? email : name);
  }

  function openCode(email) {
    const code = h("input", {
      id: "tcp-code",
      class: "code",
      inputmode: "numeric",
      autocomplete: "one-time-code",
      pattern: "[0-9]{6}",
      maxlength: "6",
      required: true,
      "aria-describedby": "tcp-code-help",
    });
    const error = h("p", { class: "error", role: "alert" });
    const verify = h("button", { class: "btn", type: "submit", text: "Continue" });

    const form = h(
      "form",
      {
        class: "card",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "tcp-title",
        onsubmit: async (event) => {
          event.preventDefault();
          error.textContent = "";
          verify.disabled = true;
          try {
            const { token, user } = await api("/api/auth/verify", {
              method: "POST",
              body: { email, code: code.value },
            });
            const session = { token, ...user };
            await api(`/api/auth/me?site=${encodeURIComponent(site)}`, { token }).catch((e) => {
              if (e.status !== 403) throw e;
              api("/api/auth/signout", { method: "POST", body: {}, token }).catch(() => {});
              throw new Error("This email hasn't been invited to give feedback on this site.");
            });
            store.set(SESSION_KEY, session);
            closeDialog(false);
            start(session);
          } catch (e) {
            error.textContent = e.message;
            verify.disabled = false;
            code.select();
          }
        },
      },
      [
        h("h2", { id: "tcp-title", text: "Check your email" }),
        h("p", {
          id: "tcp-code-help",
          text: `If ${email} has been invited to this site, a code is on its way. It works for 10 minutes.`,
        }),
        h("label", { for: "tcp-code", text: "6-digit code" }),
        code,
        error,
        h("div", { class: "row" }, [
          h("button", { class: "link", type: "button", text: "Use a different email", onclick: () => openSignIn() }),
          verify,
        ]),
      ],
    );
    code.addEventListener("input", () => {
      code.value = code.value.replace(/\D/g, "").slice(0, 6);
      if (code.value.length === 6) form.requestSubmit();
    });
    showDialog(form, code);
  }

  function showDialog(card, focusEl) {
    mount();
    const backdrop = h("div", { class: "backdrop", onclick: (e) => e.target === backdrop && closeDialog() }, [card]);
    backdrop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDialog();
      // Keep Tab inside the dialog.
      if (e.key === "Tab") {
        const focusable = [...card.querySelectorAll("input, button")].filter((el) => !el.disabled);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = root.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    ui.replaceChildren(backdrop);
    focusEl.focus();
  }

  function closeDialog(restore = true) {
    showPill();
    if (restore) (returnFocus?.isConnected ? returnFocus : ui.querySelector(".pill"))?.focus();
  }

  // ---------------------------------------------------------------- the widget

  let widget = null;

  function loadWidgetScript() {
    if (window.TcPinPoint) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = `${server}/widget.js`;
      tag.onload = resolve;
      tag.onerror = () => reject(new Error("Couldn't load the feedback widget."));
      document.head.append(tag);
    });
  }

  async function start(session) {
    await loadWidgetScript();
    widget = window.TcPinPoint.initTcPinpoint({
      endpoint: `${server}/api/tcpinpoint`,
      projectName: site,
      headers: { Authorization: `Bearer ${session.token}` },
      identity: { name: session.name, email: session.email },
      forceShow: true,
      enableScreenshot: true,
      captureDiagnostics: true,
      deepLink: true,
      onError: (error) => {
        if (error?.code === "AUTH" && error.status === 401) signOut(true, "Your sign-in has expired. Sign in again.");
      },
    });
    mount();
    ui.replaceChildren(
      h("div", { class: "chip" }, [
        h("span", { text: `Signed in as ${session.name}` }),
        h("button", { type: "button", text: "Sign out", onclick: () => signOut(true) }),
      ]),
    );
  }

  async function signOut(showSignIn, message) {
    const session = store.get(SESSION_KEY);
    store.set(SESSION_KEY, null);
    widget?.destroy?.();
    widget = null;
    if (session?.token) api("/api/auth/signout", { method: "POST", body: {}, token: session.token }).catch(() => {});
    if (showSignIn) {
      showPill();
      if (message) openSignIn(message);
    }
  }

  // ---------------------------------------------------------------- start

  async function boot() {
    // ?feedback turns snagging on in this browser; ?feedback=off turns it off. Links from the inbox (?tcpinpoint=…) count too.
    const params = new URLSearchParams(location.search);
    if (params.get("feedback") === "off") {
      store.set(ON_KEY, null);
      return signOut(false);
    }
    if (params.has("feedback") || params.has("tcpinpoint")) store.set(ON_KEY, true);

    const session = store.get(SESSION_KEY);
    if (session?.token) {
      try {
        await api(`/api/auth/me?site=${encodeURIComponent(site)}`, { token: session.token });
        store.set(ON_KEY, true);
        return start(session);
      } catch (e) {
        if (e.status === 401 || e.status === 403) store.set(SESSION_KEY, null);
        else return console.warn("[tcpinpoint]", e.message);
      }
    }
    // Ordinary visitors never see anything: only people who opened a ?feedback link.
    if (store.get(ON_KEY)) showPill();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
