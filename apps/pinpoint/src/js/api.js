// Small client for the PinPoint server's API (server.js).

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createApi({ endpoint, getKey }) {
  async function request(method, { query, body, path = endpoint } = {}) {
    const url = new URL(path, window.location.origin);
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, value);
    }

    const headers = { Accept: "application/json" };
    const key = getKey();
    if (key) headers.Authorization = `Bearer ${key}`;
    if (body) headers["Content-Type"] = "application/json";

    let response;
    try {
      response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError(0, "Couldn't reach the PinPoint server.");
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        data?.error ?? data?.errors?.[0]?.message ?? `The server answered ${response.status} ${response.statusText}.`;
      throw new ApiError(response.status, message);
    }
    return data;
  }

  return {
    list: (query) => request("GET", { query }),
    setStatus: (projectName, id, status) => request("PATCH", { body: { projectName, id, status } }),
    remove: (projectName, id) => request("DELETE", { body: { projectName, id } }),
    comment: (projectName, feedbackId, body, authorName) =>
      request("POST", {
        body: {
          projectName,
          feedbackId,
          body,
          authorName,
          authorEmail: "",
          authorRole: "team",
          clientId: crypto.randomUUID(),
        },
      }),
    removeComment: (projectName, feedbackId, commentId) =>
      request("DELETE", { body: { projectName, feedbackId, commentId } }),

    // Your client sites (server.js, /api/sites)
    sites: () => request("GET", { path: "/api/sites" }),
    saveSite: (site) => request("PUT", { path: "/api/sites", body: site }),

    // Sign-in with a code sent by email (server.js, /api/auth/*)
    requestCode: (name, email) => request("POST", { path: "/api/auth/code", body: { name, email } }),
    verifyCode: (email, code) => request("POST", { path: "/api/auth/verify", body: { email, code } }),
    me: () => request("GET", { path: "/api/auth/me" }),
    signOut: () => request("POST", { path: "/api/auth/signout", body: {} }),
    removeSite: (name) => request("DELETE", { path: "/api/sites", body: { name } }),

    // Who each piece of feedback is assigned to (server.js, /api/assignments)
    assignments: (project) => request("GET", { path: "/api/assignments", query: { project } }),
    assign: (feedbackId, email) => request("PUT", { path: "/api/assignments", body: { feedbackId, email } }),
  };
}
