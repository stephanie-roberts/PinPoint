// Sends email through Postmark: sign-in codes and snag notifications.
// Without a Postmark token (while you're trying it out), emails are printed in the Terminal instead.

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

export function createMailer({ token, from, apiUrl = "https://api.postmarkapp.com/email", log = console }) {
  async function send({ to, subject, text, html }) {
    if (!token) {
      log.warn(`\n  [pinpoint] Email to ${to}: ${subject}\n${text.replace(/^/gm, "    ")}\n`);
      return;
    }
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: from,
        To: to,
        Subject: subject,
        TextBody: text,
        HtmlBody: html,
        MessageStream: "outbound",
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Postmark answered ${response.status}: ${detail.slice(0, 300)}`);
    }
  }

  return {
    live: Boolean(token),
    send,

    sendCode({ to, name, code, siteName }) {
      const where = siteName ? `leave feedback on ${siteName}` : "sign in to the PinPoint inbox";
      if (!token) {
        log.warn(
          `\n  [pinpoint] Sign-in code for ${to}: ${code}\n  (Add POSTMARK_SERVER_TOKEN to .env to email it instead.)\n`,
        );
        return Promise.resolve();
      }
      return send({
        to,
        subject: `${code} is your PinPoint code`,
        text: [
          `Hi ${name},`,
          "",
          `Your code to ${where} is:`,
          "",
          `    ${code}`,
          "",
          "It works for 10 minutes. If you didn't ask for it, you can ignore this email.",
        ].join("\n"),
        html: [
          `<p>Hi ${escapeHtml(name)},</p>`,
          `<p>Your code to ${escapeHtml(where)} is:</p>`,
          `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:24px 0">${code}</p>`,
          "<p>It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p>",
        ].join(""),
      });
    },
  };
}
