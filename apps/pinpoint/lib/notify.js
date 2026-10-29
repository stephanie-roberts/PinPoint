// Email notifications, sent right away:
//
//   New snag from a client         → the site's "Notify" list (your team)
//   A client replies               → the site's "Notify" list
//   Your team replies              → the client who left the snag
//   Snag resolved or won't fix     → the client who left the snag
//   Snag assigned to someone       → the person it's assigned to
//
// Nobody is emailed about something they did themselves. Sending never slows down or
// fails the request: problems are written to the Terminal.

import { escapeHtml } from "./email.js";

const TYPES = { bug: "Bug", change: "Change", question: "Question", other: "Other" };

function snippet(text, length = 60) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

// The page the snag was left on, opened on that snag (the widget reads ?tcpinpoint=<id>).
function pageLink(site, feedback) {
  try {
    const url = new URL(feedback.url, site?.addresses[0] ?? undefined);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.searchParams.set("tcpinpoint", feedback.id);
    return url.toString();
  } catch {
    return null;
  }
}

function inboxLink(server, feedback) {
  return `${server}/?project=${encodeURIComponent(feedback.projectName)}&feedback=${encodeURIComponent(feedback.id)}`;
}

function quote(text) {
  return String(text)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function htmlEmail({ intro, quoteText, details = [], button, footer }) {
  return [
    '<div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0a0a0a;max-width:560px">',
    `<p>${escapeHtml(intro)}</p>`,
    `<blockquote style="margin:20px 0;padding:12px 16px;border-left:3px solid #fed631;background:#f6f6f4;white-space:pre-wrap">${escapeHtml(quoteText)}</blockquote>`,
    details.length
      ? `<p style="color:#6e6e6e;font-size:13px">${details.map((d) => escapeHtml(d)).join("<br>")}</p>`
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
    mailer.send({ to, ...message }).catch((error) => {
      log.error(`[pinpoint] Couldn't send a notification to ${to}: ${error.message}`);
    });
  }

  // Your team members listed on the site, minus whoever did the thing.
  function teamRecipients(siteName, actorEmail) {
    const site = sites.get(siteName);
    return (site?.notify ?? []).filter((email) => email !== actorEmail);
  }

  // The client who left the snag, unless it was your team or they did the thing themselves.
  function clientRecipient(feedback, actorEmail) {
    const email = feedback.authorEmail?.toLowerCase();
    if (!email || email === actorEmail || isTeam(email)) return null;
    return email;
  }

  return {
    snagCreated(feedback, actor, server) {
      const site = sites.get(feedback.projectName);
      const type = TYPES[feedback.type] ?? "Snag";
      const page = pageLink(site, feedback);
      for (const to of teamRecipients(feedback.projectName, actor?.email)) {
        deliver(to, {
          subject: `New ${type.toLowerCase()} on ${feedback.projectName}: ${snippet(feedback.message)}`,
          text: [
            `${feedback.authorName} left a new ${type.toLowerCase()} on ${feedback.projectName}:`,
            "",
            quote(feedback.message),
            "",
            page ? `Page: ${page}` : null,
            `Open it in the inbox: ${inboxLink(server, feedback)}`,
          ]
            .filter((line) => line !== null)
            .join("\n"),
          html: htmlEmail({
            intro: `${feedback.authorName} left a new ${type.toLowerCase()} on ${feedback.projectName}:`,
            quoteText: feedback.message,
            details: page ? [`Page: ${page}`] : [],
            button: { href: inboxLink(server, feedback), label: "Open in the inbox" },
            footer: `You're getting this because you're on the notify list for ${feedback.projectName}.`,
          }),
        });
      }
    },

    commentAdded(feedback, comment, actor, server) {
      const site = sites.get(feedback.projectName);

      if (comment.authorRole === "team") {
        const to = clientRecipient(feedback, actor?.email);
        const page = pageLink(site, feedback);
        if (!to || !page) return;
        deliver(to, {
          subject: `${comment.authorName} replied to your feedback on ${feedback.projectName}`,
          text: [
            `Hi ${feedback.authorName},`,
            "",
            `${comment.authorName} replied to your feedback:`,
            "",
            quote(snippet(feedback.message, 200)),
            "",
            `${comment.authorName}: ${comment.body}`,
            "",
            `See it on your site, and reply there: ${page}`,
          ].join("\n"),
          html: htmlEmail({
            intro: `Hi ${feedback.authorName}, ${comment.authorName} replied to your feedback "${snippet(feedback.message, 80)}":`,
            quoteText: comment.body,
            button: { href: page, label: "See it on your site" },
            footer: `You're getting this because you left feedback on ${feedback.projectName}.`,
          }),
        });
        return;
      }

      for (const to of teamRecipients(feedback.projectName, actor?.email)) {
        deliver(to, {
          subject: `${comment.authorName} replied on ${feedback.projectName}: ${snippet(feedback.message)}`,
          text: [
            `${comment.authorName} replied to "${snippet(feedback.message, 80)}" on ${feedback.projectName}:`,
            "",
            quote(comment.body),
            "",
            `Open it in the inbox: ${inboxLink(server, feedback)}`,
          ].join("\n"),
          html: htmlEmail({
            intro: `${comment.authorName} replied to "${snippet(feedback.message, 80)}" on ${feedback.projectName}:`,
            quoteText: comment.body,
            button: { href: inboxLink(server, feedback), label: "Open in the inbox" },
            footer: `You're getting this because you're on the notify list for ${feedback.projectName}.`,
          }),
        });
      }
    },

    // Someone on your team assigned feedback to someone else (assigning it to yourself sends nothing).
    assigned(feedback, assignee, actor, server) {
      if (!assignee?.email || assignee.email === actor?.email) return;
      const type = (TYPES[feedback.type] ?? "Feedback").toLowerCase();
      const page = pageLink(sites.get(feedback.projectName), feedback);
      const who = actor?.name ?? "Someone on your team";
      deliver(assignee.email, {
        subject: `${who} assigned you a ${type} on ${feedback.projectName}: ${snippet(feedback.message)}`,
        text: [
          `${who} assigned you this ${type} on ${feedback.projectName}, from ${feedback.authorName}:`,
          "",
          quote(feedback.message),
          "",
          page ? `Page: ${page}` : null,
          `Open it in the inbox: ${inboxLink(server, feedback)}`,
        ]
          .filter((line) => line !== null)
          .join("\n"),
        html: htmlEmail({
          intro: `${who} assigned you this ${type} on ${feedback.projectName}, from ${feedback.authorName}:`,
          quoteText: feedback.message,
          details: page ? [`Page: ${page}`] : [],
          button: { href: inboxLink(server, feedback), label: "Open in the inbox" },
          footer: "You're getting this because it was assigned to you in PinPoint.",
        }),
      });
    },

    statusChanged(feedback, previous, actor) {
      const closed = feedback.status === "resolved" || feedback.status === "wont_fix";
      const wasClosed = previous === "resolved" || previous === "wont_fix";
      if (!closed || wasClosed) return;

      const to = clientRecipient(feedback, actor?.email);
      const page = pageLink(sites.get(feedback.projectName), feedback);
      if (!to || !page) return;

      const resolved = feedback.status === "resolved";
      const headline = resolved
        ? `Your feedback on ${feedback.projectName} has been resolved`
        : `Your feedback on ${feedback.projectName} won't be changed`;
      const explain = resolved
        ? "It's been sorted. Have a look, and reply on the site if anything still isn't right."
        : "We've decided not to change this one. You can reply on the site if you'd like to talk it through.";
      deliver(to, {
        subject: headline,
        text: [
          `Hi ${feedback.authorName},`,
          "",
          explain,
          "",
          quote(feedback.message),
          "",
          `See it on your site: ${page}`,
        ].join("\n"),
        html: htmlEmail({
          intro: `Hi ${feedback.authorName}, ${explain}`,
          quoteText: feedback.message,
          button: { href: page, label: "See it on your site" },
          footer: `You're getting this because you left feedback on ${feedback.projectName}.`,
        }),
      });
    },
  };
}
