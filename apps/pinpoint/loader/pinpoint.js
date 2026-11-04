(() => {
    if (window.__pinpoint) return;
    window.__pinpoint = true;

    const script = document.currentScript;
    const site = script?.dataset.site;

    if (!script || !site) {
        console.warn("[pinpoint] Add data-site=\"your-site-name\" to the pinpoint.js script tag.");
        return;
    }

    const server = new URL(script.src).origin;
    const SESSION_KEY = `pinpoint:session:${server}`;
    const LAST_KEY = `${SESSION_KEY}:last`;
    const ON_KEY = `pinpoint:on:${site}`;

  // saving to the browser
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

  //  talking to the server
    async function api(path, { method = "GET", body, token } = {}) {
        const headers = { Accept: "application/json" };
        if (body) headers["Content-Type"] = "application/json";
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(server + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw Object.assign(new Error(data.error || "Something went wrong."), { status: response.status });
        }
        return data;
    }

  const LOGO = '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#5B3DF5"/><path d="M12 8.5 L12 23 L15.6 19.8 L18.1 25 L20.7 23.8 L18.2 18.7 L23 18.7 Z" fill="#FFFFFF" stroke="#15122E" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.6 10.2 L7.4 9.4 M10.4 7.2 L9.4 5.2 M13.4 6.4 L13.9 4.3" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/></svg>';

  // building the UI

    const host = document.createElement("div");
    host.setAttribute("data-pinpoint-ignore", ""); // left out of screenshots
    const root = host.attachShadow({ mode: "closed" });
    const ui = document.createElement("div");
    ui.className = "ui";
    // Styles come from pinpoint.css. Stay hidden until they've loaded, so nothing flashes up unstyled.
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = `${server}/pinpoint.css`;
    host.style.visibility = "hidden";
    sheet.onload = sheet.onerror = () => host.style.removeProperty("visibility");
    root.append(sheet, ui);

    function h(tag, attrs = {}, children = []) {
        const el = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
            if (value === false || value == null) continue;
            if (key === "text") el.textContent = value;
            else if (key === "html") el.innerHTML = value; // only ever our own logo
            else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
            else el.setAttribute(key, value === true ? "" : value);
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
            h("button", { class: "signin-pill", type: "button", text: "Sign in to leave feedback", onclick: () => openSignIn() }),
        );
    }

  // One sign-in step: a card with a title, a line of help, its fields, an error line and buttons.
  // onSubmit gets the error line; anything it throws is shown there.
    function dialog({ title, intro, introId, fields, buttons, onSubmit, focus }) {
        const error = h("p", { class: "signin-error", role: "alert" });
        const form = h(
            "form",
            {
                class: "signin-card",
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "pp-title",
                onsubmit: async (event) => {
                    event.preventDefault();
                    error.textContent = "";
                    try {
                    await onSubmit();
                    } catch (e) {
                    error.textContent = e.message;
                    }
                },
            },
            [
                h("span", { html: LOGO }),
                h("h2", { id: "pp-title", text: title }),
                h("p", { id: introId, text: intro }),
                ...fields,
                error,
                h("div", { class: "signin-row" }, buttons),
            ],
        );
        showDialog(form, focus);
        return form;
    }

    function openSignIn(message = "") {
        returnFocus ??= document.activeElement;
        const name = h("input", { id: "pp-name", autocomplete: "name", required: true, maxlength: "100" });
        const email = h("input", { id: "pp-email", type: "email", autocomplete: "email", required: true });
        const send = h("button", { class: "signin-btn", type: "submit", text: "Email me a code" });

        const saved = store.get(LAST_KEY);
        name.value = saved?.name ?? "";
        email.value = saved?.email ?? "";

        const form = dialog({
            title: "Leave feedback on this site",
            intro: "We'll email you a 6-digit code to check it's you.",
            fields: [h("label", { for: "pp-name", text: "Your name" }), name, h("label", { for: "pp-email", text: "Email" }), email],
            buttons: [h("button", { class: "signin-btn ghost", type: "button", text: "Cancel", onclick: () => closeDialog() }), send],
            focus: saved?.name ? email : name,
            onSubmit: async () => {
            send.disabled = true;
            send.textContent = "Sending…";
            try {
                await api("/api/auth/code", { method: "POST", body: { name: name.value, email: email.value, site } });
                store.set(LAST_KEY, { name: name.value.trim(), email: email.value.trim() });
                openCode(email.value.trim());
            } finally {
                send.disabled = false;
                send.textContent = "Email me a code";
            }
            },
        });
        if (message) form.querySelector(".signin-error").textContent = message;
    }

    function openCode(email) {

        const code = h("input", {
            id: "pp-code",
            class: "signin-code",
            inputmode: "numeric",
            autocomplete: "one-time-code",
            pattern: "[0-9]{6}",
            maxlength: "6",
            required: true,
            "aria-describedby": "pp-code-help",
        });

        const verify = h("button", { class: "signin-btn", type: "submit", text: "Continue" });

        const form = dialog({
            title: "Check your email",
            intro: `If ${email} has been invited to this site, a code is on its way. It works for 10 minutes.`,
            introId: "pp-code-help",
            fields: [h("label", { for: "pp-code", text: "6-digit code" }), code],
            buttons: [h("button", { class: "signin-link", type: "button", text: "Use a different email", onclick: () => openSignIn() }), verify],
            focus: code,
            onSubmit: async () => {
            verify.disabled = true;
            try {
                const { token, user } = await api("/api/auth/verify", { method: "POST", body: { email, code: code.value } });
                // Signed in, but are they invited to this particular site?
                await api(`/api/auth/me?site=${encodeURIComponent(site)}`, { token }).catch((e) => {
                if (e.status !== 403) throw e;
                api("/api/auth/signout", { method: "POST", body: {}, token }).catch(() => {});
                throw new Error("This email hasn't been invited to give feedback on this site.");
                });
                const session = { token, ...user };
                store.set(SESSION_KEY, session);
                closeDialog(false);
                start(session);
            } catch (e) {
                code.select();
                throw e;
            } finally {
                verify.disabled = false;
            }
            },
        });

        // Sends by itself once all 6 digits are in.
        code.addEventListener("input", () => {
            code.value = code.value.replace(/\D/g, "").slice(0, 6);
            if (code.value.length === 6) form.requestSubmit();
        });
    }

    // Show a card over the page. Esc or clicking outside closes it, and Tab stays inside it.
    function showDialog(card, focusEl) {
        mount();
        const backdrop = h("div", { class: "signin-backdrop", onclick: (e) => e.target === backdrop && closeDialog() }, [card]);
        backdrop.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeDialog();
            if (e.key !== "Tab") return;
            const focusable = [...card.querySelectorAll("input, button")].filter((el) => !el.disabled);
            const first = focusable[0];
            const last = focusable.at(-1);
            if (e.shiftKey && root.activeElement === first) {
            e.preventDefault();
            last.focus();
            } else if (!e.shiftKey && root.activeElement === last) {
            e.preventDefault();
            first.focus();
            }
        });
        ui.replaceChildren(backdrop);
        focusEl.focus();
    }

    function closeDialog(restoreFocus = true) {
        showPill();
        if (restoreFocus) (returnFocus?.isConnected ? returnFocus : ui.querySelector(".signin-pill"))?.focus();
        returnFocus = null;
    }

  // the widget

  let widget = null;

    // The widget itself (loader/pinpoint-widget.js) is only downloaded once someone has signed in.
    function loadWidgetScript() {
        if (window.PinPointWidget) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const tag = document.createElement("script");
            tag.src = `${server}/pinpoint-widget.js`;
            tag.onload = resolve;
            tag.onerror = () => reject(new Error("Couldn't load the feedback widget."));
            document.head.append(tag);
        });
    }

    async function start(session) {
        await loadWidgetScript();
        widget = window.PinPointWidget.init({
            endpoint: `${server}/api/pinpoint`,
            projectName: site,
            token: session.token,
            identity: { name: session.name, email: session.email, role: session.role },
            onAuthError: () => signOut(true, "Your sign-in has expired. Sign in again."),
        });
        mount();
        ui.replaceChildren(
            h("div", { class: "signin-chip" }, [
            h("span", {}, ["Signed in as ", h("strong", { text: session.name })]),
            h("button", { type: "button", text: "Sign out", onclick: () => signOut(true) }),
            ]),
        );
    }

    function signOut(showSignIn, message) {
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

    // start
    async function boot() {
        // ?feedback turns feedback on in this browser; ?feedback=off turns it off. Links from emails (?pinpoint=…) count too.
        const params = new URLSearchParams(location.search);
        if (params.get("feedback") === "off") {
            store.set(ON_KEY, null);
            signOut(false);
            return;
        }
        if (params.has("feedback") || params.has("pinpoint")) store.set(ON_KEY, true);

        const session = store.get(SESSION_KEY);
        if (session?.token) {
            try {
            await api(`/api/auth/me?site=${encodeURIComponent(site)}`, { token: session.token });
            store.set(ON_KEY, true);
            start(session);
            return;
            } catch (e) {
            if (e.status !== 401 && e.status !== 403) {
                console.warn("[pinpoint]", e.message);
                return;
            }
                store.set(SESSION_KEY, null); // signed out or no longer invited
            }
        }
        // Ordinary visitors never see anything: only people who opened a ?feedback link.
        if (store.get(ON_KEY)) showPill();
    }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
