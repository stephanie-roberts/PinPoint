// Send sign-in codes and notifications through Postmark.
// Without a token, print emails to the terminal instead.

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

export function createMailer({ token, from, apiUrl = "https://api.postmarkapp.com/email", log = console }) {
  async function send({ to, subject, text, html }) {
    if (!token) {
      const indentedText = text.replace(/^/gm, "    ");

      log.warn(`\n  [pinpoint] Email to ${to}: ${subject}\n${indentedText}\n`);

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

      throw new Error(`Postmark returned ${response.status}: ${detail.slice(0, 300)}`);
    }
  }

  async function sendCode({ to, name, code, siteName }) {
    if (!token) {
      log.warn(
        `\n  [pinpoint] Sign-in code for ${to}: ${code}\n` +
          "  Add POSTMARK_SERVER_TOKEN to .env to send it by email.\n",
      );

      return;
    }

    const purpose = siteName ? `leave feedback on ${siteName}` : "sign in to the PinPoint inbox";

    const expiry = "This code expires in 10 minutes. " + "If you didn't request it, you can ignore this email.";

    return send({
      to,
      subject: `${code} is your PinPoint sign-in code`,

      text: [`Hi ${name},`, "", `Your code to ${purpose} is:`, "", `    ${code}`, "", expiry].join("\n"),

      html: [
        `<p>Hi ${escapeHtml(name)},</p>`,
        `<p>Your code to ${escapeHtml(purpose)} is:</p>`,
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:24px 0">${escapeHtml(code)}</p>`,
        `<p>${escapeHtml(expiry)}</p>`,
      ].join(""),
    });
  }

  return {
    live: Boolean(token),
    send,
    sendCode,
  };
}
