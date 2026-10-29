import { createApi } from "../api.js";
import { formatDate, parseHttpUrl, relativeTime, safeImageUrl, shortBrowser } from "../helpers.js";

export const TYPES = {
  bug: "Bug",
  change: "Change",
  question: "Question",
  other: "Other",
};

export const STATUSES = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

// Dot colours for each status (the colours are in site.css).
export const STATUS_DOTS = {
  open: "bg-open",
  in_progress: "bg-progress",
  resolved: "bg-resolved",
  wont_fix: "bg-wontfix",
};

const TABS = [
  { id: "active", label: "To do", statuses: "open,in_progress" },
  { id: "done", label: "Done", statuses: "resolved,wont_fix" },
  { id: "all", label: "All", statuses: "" },
];

const PAGE_SIZE = 50;
const TOKEN_STORAGE = "tcpinpoint:inbox-session";
const LAST_STORAGE = "tcpinpoint:inbox-last";

// Signed-in sessions last 30 days, so the token is kept in localStorage.
function readStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing: you stay signed in for this page only.
  }
}

// Focus an element once it's on screen (Alpine may still be showing its section).
function focusWhenVisible(el, tries = 20) {
  if (!el) return;
  if (el.offsetParent !== null) el.focus();
  else if (tries > 0) requestAnimationFrame(() => focusWhenVisible(el, tries - 1));
}

const Inbox = () => ({
  TYPES,
  STATUSES,
  STATUS_DOTS,
  TABS,

  // Your client sites come from the server (/api/sites) once you sign in.
  sites: [],
  projects: [],

  view: "snags", // or "sites"
  siteForm: { open: false, editing: false, name: "", addresses: "", clients: "", notify: "" },
  siteError: "",
  savingSite: false,
  removingSite: null,
  copiedSite: null,
  initialParams: null,

  token: readStored(TOKEN_STORAGE),
  user: null,
  signedIn: false,
  checking: false,
  signInStep: "details", // then "code"
  nameDraft: readStored(LAST_STORAGE)?.name ?? "",
  emailDraft: readStored(LAST_STORAGE)?.email ?? "",
  codeDraft: "",
  signInError: "",

  project: "",
  tab: "active",
  type: "",
  search: "",

  items: [],
  total: 0,
  counts: { active: null, done: null, all: null },
  page: 1,
  loading: false,
  loadingMore: false,
  capabilities: { comments: false, deleteComments: false },

  // Who each piece of feedback on this site is assigned to ({ feedbackId: email }), and names to show.
  assignments: {},
  names: {},
  assigning: false,

  selectedId: null,
  reply: "",
  sending: false,
  confirmingDelete: false,
  zoomed: false,

  toasts: [],
  announcement: "",

  api: null,
  requestId: 0,

  async init() {
    this.api = createApi({ endpoint: "/api/tcpinpoint", getKey: () => this.token });
    this.initialParams = new URLSearchParams(window.location.search);

    this.$watch("type", () => this.refresh());
    this.$watch("project", () => {
      this.selectedId = null;
      this.syncUrl();
      this.refresh();
    });
    this.$watch("selectedId", () => {
      this.reply = "";
      this.confirmingDelete = false;
      this.zoomed = false;
      this.syncUrl();
    });

    if (this.token) this.resume();
  },

  // The open project and feedback live in the URL, so a reload or a shared link lands in the same place.
  syncUrl() {
    const url = new URL(window.location.href);
    if (this.project) url.searchParams.set("project", this.project);
    else url.searchParams.delete("project");
    if (this.selectedId) url.searchParams.set("feedback", this.selectedId);
    else url.searchParams.delete("feedback");
    history.replaceState(null, "", url);
  },

  // ---------------------------------------------------------------- sign-in

  // Step 1: name and email. The server emails a 6-digit code to team addresses.
  async requestCode() {
    this.signInError = "";
    this.checking = true;
    try {
      await this.api.requestCode(this.nameDraft.trim(), this.emailDraft.trim());
      writeStored(LAST_STORAGE, { name: this.nameDraft.trim(), email: this.emailDraft.trim() });
      this.codeDraft = "";
      this.signInStep = "code";
      focusWhenVisible(this.$refs.code);
    } catch (error) {
      this.signInError = error.message;
    } finally {
      this.checking = false;
    }
  },

  // Step 2: the code from the email.
  async verifyCode() {
    if (this.checking) return;
    this.signInError = "";
    this.checking = true;
    try {
      const { token } = await this.api.verifyCode(this.emailDraft.trim(), this.codeDraft);
      this.token = token;
      writeStored(TOKEN_STORAGE, token);
      await this.resume();
    } catch (error) {
      this.signInError = error.message;
      this.$refs.code?.select();
    } finally {
      this.checking = false;
    }
  },

  useDifferentEmail() {
    this.signInStep = "details";
    this.signInError = "";
    focusWhenVisible(this.$refs.email);
  },

  // Open the inbox with the saved session.
  async resume() {
    this.loading = true;
    try {
      const { user } = await this.api.me();
      if (user.role !== "team") {
        this.forgetSession();
        this.signInError = "The inbox is for your team. Clients leave feedback on their own website.";
        return;
      }
      this.user = user;
      const data = await this.api.sites();
      this.setSites(data.sites);
      this.signedIn = true;
      this.signInStep = "details";

      const params = this.initialParams;
      const wanted = params?.get("project");
      this.project = this.projects.some((p) => p.name === wanted) ? wanted : (this.projects[0]?.name ?? "");
      // Let the project change settle first: it clears the selection, which would drop the one from the link.
      await this.$nextTick();
      if (params?.get("feedback")) this.selectedId = params.get("feedback");
      this.initialParams = null;

      if (!this.sites.length) this.showSites();
      else await this.refresh();
    } catch (error) {
      this.forgetSession();
      if (error.status !== 401) this.signInError = error.message;
    } finally {
      this.loading = false;
    }
  },

  forgetSession() {
    this.token = null;
    writeStored(TOKEN_STORAGE, null);
    this.user = null;
    this.signedIn = false;
    this.items = [];
    this.selectedId = null;
    this.view = "snags";
  },

  async signOut() {
    await this.api.signOut().catch(() => {});
    this.forgetSession();
    this.signInStep = "details";
  },

  // ---------------------------------------------------------------- sites

  setSites(list) {
    this.sites = list;
    this.projects = list.map((site) => ({ name: site.name, site: site.addresses[0] ?? null }));
  },

  showSites() {
    this.selectedId = null;
    this.view = "sites";
    if (!this.sites.length) this.$nextTick(() => this.openSiteForm());
  },

  showSnags(name = this.project) {
    this.view = "snags";
    if (name !== this.project) this.project = name;
    else this.refresh();
  },

  openSiteForm(site = null) {
    this.siteError = "";
    this.siteForm = site
      ? {
          open: true,
          editing: true,
          name: site.name,
          addresses: site.addresses.join("\n"),
          clients: (site.clients ?? []).join("\n"),
          notify: (site.notify ?? []).join("\n"),
        }
      : {
          open: true,
          editing: false,
          name: "",
          addresses: "",
          clients: "",
          // New sites notify whoever's adding them, to start with.
          notify: this.user?.email ?? "",
        };
    focusWhenVisible(site ? this.$refs.siteAddresses : this.$refs.siteName);
  },

  closeSiteForm() {
    this.siteForm.open = false;
    this.siteError = "";
  },

  async saveSite() {
    const name = this.siteForm.name.trim().toLowerCase();
    const list = (text) => text.split(/[\s,;]+/).filter(Boolean);
    this.savingSite = true;
    this.siteError = "";
    try {
      const data = await this.api.saveSite({
        name,
        addresses: list(this.siteForm.addresses),
        clients: list(this.siteForm.clients),
        notify: list(this.siteForm.notify),
      });
      const isNew = !this.siteForm.editing;
      this.setSites(data.sites);
      this.siteForm.open = false;
      if (!this.project) this.project = data.site.name;
      this.notify(isNew ? `${data.site.name} added. Paste its snippet into the site.` : `${data.site.name} saved.`);
      if (isNew) this.$nextTick(() => document.getElementById(`site-${data.site.name}`)?.focus());
    } catch (error) {
      if (error.status === 401) return this.handleError(error);
      this.siteError = error.message;
    } finally {
      this.savingSite = false;
    }
  },

  async removeSite(name) {
    try {
      const data = await this.api.removeSite(name);
      this.setSites(data.sites);
      this.removingSite = null;
      if (this.project === name) this.project = this.projects[0]?.name ?? "";
      this.notify(`${name} removed. Its feedback is kept, and comes back if you add it again.`);
    } catch (error) {
      this.handleError(error);
    }
  },

  // The script tag to paste into a client's site, before </body>.
  snippet(site) {
    return `<script src="${window.location.origin}/pinpoint.js" data-site="${site.name}" defer></script>`;
  },

  // The link to send clients: it turns feedback on for them on that site.
  feedbackLink(site) {
    const first = site.addresses[0];
    return first ? `${first}/?feedback` : "";
  },

  async copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      this.notify(`${label} copied.`);
      return true;
    } catch {
      this.notify("Couldn't copy. Select it and copy it instead.", "error");
      return false;
    }
  },

  async copySnippet(site) {
    if (!(await this.copyText(this.snippet(site), "Snippet"))) return;
    this.copiedSite = site.name;
    setTimeout(() => {
      if (this.copiedSite === site.name) this.copiedSite = null;
    }, 2500);
  },

  // ---------------------------------------------------------------- data

  query(page = 1) {
    const tab = TABS.find((t) => t.id === this.tab);
    return {
      projectName: this.project,
      page,
      limit: PAGE_SIZE,
      statuses: tab?.statuses,
      type: this.type,
      search: this.search.trim(),
    };
  },

  async refresh() {
    if (!this.signedIn || !this.project) return;
    const id = ++this.requestId;
    this.loading = true;
    try {
      const data = await this.api.list(this.query(1));
      if (id !== this.requestId) return; // a newer filter change won
      this.items = data.feedbacks;
      this.total = data.total;
      this.page = 1;
      this.capabilities = data.capabilities ?? this.capabilities;
      this.announcement = `${data.total} ${data.total === 1 ? "piece" : "pieces"} of feedback`;
      this.refreshCounts();
      this.loadAssignments();
    } catch (error) {
      if (id === this.requestId) this.handleError(error);
    } finally {
      if (id === this.requestId) this.loading = false;
    }
  },

  async loadMore() {
    this.loadingMore = true;
    try {
      const data = await this.api.list(this.query(this.page + 1));
      const known = new Set(this.items.map((item) => item.id));
      this.items.push(...data.feedbacks.filter((item) => !known.has(item.id)));
      this.total = data.total;
      this.page += 1;
    } catch (error) {
      this.handleError(error);
    } finally {
      this.loadingMore = false;
    }
  },

  // Tab counts ignore the search and type filters, like an email inbox.
  async refreshCounts() {
    if (!this.project) return;
    const results = await Promise.allSettled(
      TABS.map((tab) => this.api.list({ projectName: this.project, limit: 1, statuses: tab.statuses })),
    );
    results.forEach((result, index) => {
      this.counts[TABS[index].id] = result.status === "fulfilled" ? result.value.total : null;
    });
  },

  async loadAssignments() {
    const project = this.project;
    try {
      const data = await this.api.assignments(project);
      if (project !== this.project) return; // you've switched site since
      this.assignments = data.assignments;
      this.names = data.names;
    } catch (error) {
      this.handleError(error);
    }
  },

  // Who can be assigned feedback on this site: its Notify list, plus whoever has it now.
  get assignees() {
    const notify = this.sites.find((site) => site.name === this.project)?.notify ?? [];
    const current = this.assignments[this.selectedId];
    return current && !notify.includes(current) ? [...notify, current] : notify;
  },

  personLabel(email) {
    const name = this.names[email];
    return name ? `${name} (${email})` : email;
  },

  setTab(id) {
    if (this.tab === id) return;
    this.tab = id;
    this.refresh();
  },

  get hasMore() {
    return this.items.length < this.total;
  },

  get filtersActive() {
    return Boolean(this.type || this.search.trim());
  },

  clearFilters() {
    this.type = "";
    this.search = "";
    this.refresh();
  },

  // ---------------------------------------------------------------- selection

  get selected() {
    return this.items.find((item) => item.id === this.selectedId) ?? null;
  },

  get selectedIndex() {
    return this.items.findIndex((item) => item.id === this.selectedId);
  },

  open(id) {
    this.selectedId = id;
    this.$nextTick(() => this.$refs.drawerHeading?.focus());
  },

  close() {
    const id = this.selectedId;
    this.selectedId = null;
    this.$nextTick(() => document.getElementById(`row-${id}`)?.focus());
  },

  move(step) {
    if (!this.items.length) return;
    const next = Math.min(Math.max(this.selectedIndex + step, 0), this.items.length - 1);
    this.selectedId = this.items[next].id;
    this.$nextTick(() => document.getElementById(`row-${this.selectedId}`)?.scrollIntoView({ block: "nearest" }));
  },

  onKeydown(event) {
    if (!this.signedIn || this.view !== "snags" || event.metaKey || event.ctrlKey || event.altKey) return;
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);
    if (event.key === "Escape") {
      if (this.zoomed) this.zoomed = false;
      else if (this.confirmingDelete) this.confirmingDelete = false;
      else if (this.selectedId && !typing) this.close();
      return;
    }
    if (typing) return;
    if (event.key === "j" || event.key === "ArrowDown") {
      event.preventDefault();
      this.move(1);
    } else if (event.key === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      this.move(-1);
    } else if (event.key === "/") {
      event.preventDefault();
      this.$refs.search.focus();
    }
  },

  // ---------------------------------------------------------------- actions

  can(permission, item = this.selected) {
    // The server sends what you're allowed to do with each piece of feedback, and checks again on every change.
    return item?.permissions ? item.permissions[permission] !== false : true;
  },

  async setStatus(status) {
    const item = this.selected;
    if (!item || item.status === status) return;
    const previous = item.status;
    item.status = status; // optimistic
    try {
      const updated = await this.api.setStatus(item.projectName, item.id, status);
      Object.assign(item, updated);
      this.notify(`Marked as ${STATUSES[status].toLowerCase()}.`);
      this.refreshCounts();
    } catch (error) {
      item.status = previous;
      this.handleError(error);
    }
  },

  async assign(email) {
    const item = this.selected;
    if (!item || this.assigning) return;
    const previous = this.assignments[item.id] ?? "";
    if (email === previous) return;
    this.assigning = true;
    this.assignments = { ...this.assignments, [item.id]: email || undefined }; // optimistic
    try {
      const result = await this.api.assign(item.id, email || null);
      if (result.name) this.names = { ...this.names, [result.email]: result.name };
      if (!email) this.notify("Unassigned.");
      else if (email === this.user?.email) this.notify("Assigned to you.");
      else this.notify(`Assigned to ${this.names[email] ?? email}. They've been emailed.`);
    } catch (error) {
      this.assignments = { ...this.assignments, [item.id]: previous || undefined };
      this.handleError(error);
    } finally {
      this.assigning = false;
    }
  },

  async sendReply() {
    const item = this.selected;
    const body = this.reply.trim();
    if (!item || !body || this.sending) return;
    this.sending = true;
    try {
      const comment = await this.api.comment(item.projectName, item.id, body, this.user?.name ?? "Team");
      item.comments = [...(item.comments ?? []), comment];
      this.reply = "";
      this.notify("Reply sent.");
    } catch (error) {
      this.handleError(error);
    } finally {
      this.sending = false;
    }
  },

  async deleteComment(comment) {
    const item = this.selected;
    try {
      await this.api.removeComment(item.projectName, item.id, comment.id);
      item.comments = item.comments.filter((c) => c.id !== comment.id);
      this.notify("Reply deleted.");
    } catch (error) {
      this.handleError(error);
    }
  },

  async deleteSelected() {
    const item = this.selected;
    if (!item) return;
    try {
      await this.api.remove(item.projectName, item.id);
      const index = this.selectedIndex;
      this.items.splice(index, 1);
      this.total -= 1;
      this.selectedId = null;
      this.notify("Feedback deleted.");
      this.refreshCounts();
      this.$nextTick(() => {
        const next = this.items[Math.min(index, this.items.length - 1)];
        document.getElementById(next ? `row-${next.id}` : "search")?.focus();
      });
    } catch (error) {
      this.handleError(error);
    }
  },

  async copyLink() {
    const link = this.pageLink(this.selected);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.notify("Link copied.");
    } catch {
      this.notify("Couldn't copy the link.", "error");
    }
  },

  // ---------------------------------------------------------------- display helpers

  siteFor(item) {
    return this.projects.find((p) => p.name === item?.projectName)?.site ?? window.location.origin;
  },

  pageLink(item) {
    if (!item) return null;
    const url = parseHttpUrl(item.url, this.siteFor(item));
    if (!url) return null;
    url.searchParams.set("tcpinpoint", item.id);
    return url.toString();
  },

  pagePath(item) {
    const url = parseHttpUrl(item.url, this.siteFor(item));
    return url ? url.pathname + url.search : item.url;
  },

  screenshot(item) {
    return safeImageUrl(item?.screenshotUrl);
  },

  regionStyle(item) {
    const r = item?.screenshotRegion;
    if (!r) return "display:none";
    const pct = (n) => `${(n * 100).toFixed(3)}%`;
    return `left:${pct(r.xPct)};top:${pct(r.yPct)};width:${pct(r.wPct)};height:${pct(r.hPct)}`;
  },

  diagnosticsCount(item) {
    const d = item?.diagnostics;
    return d ? d.console.length + d.network.length : 0;
  },

  relativeTime,
  formatDate,
  shortBrowser,

  // ---------------------------------------------------------------- feedback to the user

  notify(message, tone = "info") {
    const id = crypto.randomUUID();
    this.toasts.push({ id, message, tone });
    this.announcement = message;
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 4000);
  },

  handleError(error) {
    if (error.status === 401) {
      this.forgetSession();
      this.signInError = "Your sign-in has expired. Sign in again.";
      return;
    }
    this.notify(error.message || "Something went wrong.", "error");
  },
});

export default Inbox;
