import { escapeHtml } from "./email.js";

// Email notifications, sent right away:
//
//   New feedback from a client     → the site's Notify list (your team)
//   A client replies               → the site's Notify list
//   Your team replies              → the client who left the feedback
//   Resolved or won't fix          → the client who left the feedback
//   Assigned to someone            → the person it's assigned to
//
// Nobody is emailed about something they did themselves. Sending never slows down or
// fails the request: problems are written to the Terminal.

const TYPES = {
  bug: "Bug",
  change: "Change",
  question: "Question",
  other: "Other",
};

const CLOSED_STATUSES = new Set(["resolved", "wont_fix"]);

function snippet(text, length = 60) {
  const flat = String(text).replace(/\s+/g, " ").trim();

  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

function quote(text) {
  return String(text)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function plainText(lines) {
  return lines.filter((line) => line !== null).join("\n");
}

// Link to the original page with its feedback selected.
function pageLink(site, feedback) {
  try {
    const url = new URL(feedback.url, site?.addresses?.[0]);

    if (!["http:", "https:"].includes(url.protocol)) return null;

    url.searchParams.set("tcpinpoint", feedback.id);

    return url.toString();
  } catch {
    return null;
  }
}

function inboxLink(server, feedback) {
  const project = encodeURIComponent(feedback.projectName);
  const id = encodeURIComponent(feedback.id);

  return `${server}/?project=${project}&feedback=${id}`;
}

function teamFooter(siteName) {
  return `You're receiving this because you're on the notification list for ${siteName}.`;
}

function clientFooter(siteName) {
  return `You're receiving this because you left feedback on ${siteName}.`;
}

function htmlEmail({ intro, quoteText, details = [], button, footer }) {
  return [
    '<div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0a0a0a;max-width:560px">',
    `<p>${escapeHtml(intro)}</p>`,
    `<blockquote style="margin:20px 0;padding:12px 16px;border-left:3px solid #fed631;background:#f6f6f4;white-space:pre-wrap">${escapeHtml(quoteText)}</blockquote>`,

    details.length
      ? `<p style="color:#6e6e6e;font-size:13px">${details.map((detail) => escapeHtml(detail)).join("<br>")}</p>`
      : "",

    button
      ? `<p style="margin:28px 0"><a href="${escapeHtml(button.href)}" style="background:#0a0a0a;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(button.label)}</a></p>`
      : "",

    footer ? `<p style="color:#6e6e6e;font-size:12px">${escapeHtml(footer)}</p>` : "",

    "</div>",
  ].join("");
}

export function createNotifier({ mailer, sites, isTeam, log = console }) {
  function deliver(to, message) {
    void Promise.resolve()
      .then(() => mailer.send({ to, ...message }))
      .catch((error) => {
        log.error(`[pinpoint] Couldn't send a notification to ${to}: ${error?.message ?? String(error)}`);
      });
  }

  function teamRecipients(siteName, actorEmail) {
    const site = sites.get(siteName);

    return (site?.notify ?? []).filter((email) => email !== actorEmail);
  }

  function clientRecipient(feedback, actorEmail) {
    const email = feedback.authorEmail?.toLowerCase();

    if (!email || email === actorEmail || isTeam(email)) return null;

    return email;
  }

  function notifyTeam(siteName, actorEmail, message) {
    for (const to of teamRecipients(siteName, actorEmail)) {
      deliver(to, message);
    }
  }

  return {
    snagCreated(feedback, actor, server) {
      const site = sites.get(feedback.projectName);
      const type = (TYPES[feedback.type] ?? "Feedback").toLowerCase();
      const page = pageLink(site, feedback);
      const inbox = inboxLink(server, feedback);
      const intro = `${feedback.authorName} left a new ${type} on ${feedback.projectName}:`;

      notifyTeam(feedback.projectName, actor?.email, {
        subject: `New ${type} on ${feedback.projectName}: ` + snippet(feedback.message),

        text: plainText([
          intro,
          "",
          quote(feedback.message),
          "",
          page ? `Page: ${page}` : null,
          `Open in the inbox: ${inbox}`,
        ]),

        html: htmlEmail({
          intro,
          quoteText: feedback.message,
          details: page ? [`Page: ${page}`] : [],
          button: { href: inbox, label: "View feedback" },
          footer: teamFooter(feedback.projectName),
        }),
      });
    },

    commentAdded(feedback, comment, actor, server) {
      if (comment.authorRole === "team") {
        const to = clientRecipient(feedback, actor?.email);
        const page = pageLink(sites.get(feedback.projectName), feedback);

        if (!to || !page) return;

        deliver(to, {
          subject: `${comment.authorName} replied to your feedback ` + `on ${feedback.projectName}`,

          text: plainText([
            `Hi ${feedback.authorName},`,
            "",
            `${comment.authorName} replied to your feedback:`,
            "",
            quote(snippet(feedback.message, 200)),
            "",
            `${comment.authorName}: ${comment.body}`,
            "",
            `View the reply on your website: ${page}`,
          ]),

          html: htmlEmail({
            intro:
              `Hi ${feedback.authorName}, ${comment.authorName} ` +
              `replied to your feedback "${snippet(feedback.message, 80)}":`,
            quoteText: comment.body,
            button: { href: page, label: "View reply" },
            footer: clientFooter(feedback.projectName),
          }),
        });

        return;
      }

      const inbox = inboxLink(server, feedback);
      const intro =
        `${comment.authorName} replied to ` + `"${snippet(feedback.message, 80)}" on ${feedback.projectName}:`;

      notifyTeam(feedback.projectName, actor?.email, {
        subject: `${comment.authorName} replied on ${feedback.projectName}: ` + snippet(feedback.message),

        text: plainText([intro, "", quote(comment.body), "", `Open in the inbox: ${inbox}`]),

        html: htmlEmail({
          intro,
          quoteText: comment.body,
          button: { href: inbox, label: "View reply" },
          footer: teamFooter(feedback.projectName),
        }),
      });
    },

    assigned(feedback, assignee, actor, server) {
      if (!assignee?.email || assignee.email === actor?.email) return;

      const page = pageLink(sites.get(feedback.projectName), feedback);
      const inbox = inboxLink(server, feedback);
      const actorName = actor?.name ?? "Someone on your team";
      const intro = `${actorName} assigned you feedback on ${feedback.projectName} ` + `from ${feedback.authorName}:`;

      deliver(assignee.email, {
        subject: `${actorName} assigned you feedback on ${feedback.projectName}: ` + snippet(feedback.message),

        text: plainText([
          intro,
          "",
          quote(feedback.message),
          "",
          page ? `Page: ${page}` : null,
          `Open in the inbox: ${inbox}`,
        ]),

        html: htmlEmail({
          intro,
          quoteText: feedback.message,
          details: page ? [`Page: ${page}`] : [],
          button: { href: inbox, label: "View feedback" },
          footer: "You're receiving this because this feedback was assigned to you.",
        }),
      });
    },

    statusChanged(feedback, previous, actor) {
      // Only notify when feedback moves from an open to a closed status.
      if (!CLOSED_STATUSES.has(feedback.status) || CLOSED_STATUSES.has(previous)) {
        return;
      }

      const to = clientRecipient(feedback, actor?.email);
      const page = pageLink(sites.get(feedback.projectName), feedback);

      if (!to || !page) return;

      const resolved = feedback.status === "resolved";

      const subject = resolved
        ? `Your feedback on ${feedback.projectName} has been resolved`
        : `Your feedback on ${feedback.projectName} won't be changed`;

      const explanation = resolved
        ? "This has been resolved. Please check your website and reply if anything still needs attention."
        : "We've decided not to make this change. You can reply on your website if you'd like to discuss it.";

      deliver(to, {
        subject,

        text: plainText([
          `Hi ${feedback.authorName},`,
          "",
          explanation,
          "",
          quote(feedback.message),
          "",
          `View on your website: ${page}`,
        ]),

        html: htmlEmail({
          intro: `Hi ${feedback.authorName}, ${explanation}`,
          quoteText: feedback.message,
          button: { href: page, label: "View feedback" },
          footer: clientFooter(feedback.projectName),
        }),
      });
    },
  };
}
