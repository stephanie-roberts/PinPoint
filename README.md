# PinPoint

A simple snagging tool for websites. Clients draw a box around the part of their site they want changed, pick what kind of snag it is and write a note. The snag is pinned to that spot on the page, and your team works through everything in one inbox.

- **Your team** signs in to the inbox with a Thought Collective email and a 6-digit code sent by email.
- **Clients** sign in on their own website the same way, but only on sites you've invited them to.
- **Email notifications** tell your team about new snags and replies, and tell clients when you reply or sort their snag.
- Everything runs on your own server and is saved to simple files. There's no database, no monthly fee and no third-party service holding your clients' feedback, apart from Postmark sending the emails.

---

## Contents

1. [What you need](#what-you-need)
2. [Install](#install)
3. [Run it on your Mac](#run-it-on-your-mac)
4. [Using it](#using-it)
5. [Sending real emails with Postmark](#sending-real-emails-with-postmark)
6. [Putting it online](#putting-it-online)
7. [Settings](#settings)
8. [How the project is organised](#how-the-project-is-organised)
9. [Commands](#commands)
10. [Troubleshooting](#troubleshooting)
11. [Security](#security)

---

## What you need

- **Node.js 22.19 or newer.** Check with `node --version` in Terminal. If you use Herd, pick a newer Node version in Herd's settings, or run `nvm install 22` and then `nvm alias default 22`.
- **npm**, which comes with Node.
- **A Postmark account** to email sign-in codes. You only need it once real people use it; while you try it out, codes are shown in Terminal instead.

## Install

Open Terminal in the project folder and run these once:

```bash
cd ~/Desktop/tcpinpoint
npm install
npm run build
cp apps/pinpoint/.env.example apps/pinpoint/.env
```

What each step does:

| Step | What it does |
|---|---|
| `npm install` | Downloads everything the project needs into `node_modules`. |
| `npm run build` | Builds the widget script, the server code and the inbox. Run it again after updating the project. |
| `cp …/.env.example …/.env` | Creates your settings file. You can leave it as it is to try things out. |

To check everything is working, run the full set of checks (they take about a minute):

```bash
npm run verify
```

When it finishes, the build, type checks, lint and tests should all pass.

## Run it on your Mac

```bash
npm run dev
```

Wait for this message:

```
  PinPoint is running on http://localhost:3000
```

Leave that Terminal window open while you use it. To stop it, press **Ctrl + C**.

### Sign in

1. Open **http://localhost:3000**.
2. Enter your name and your `@thoughtcollective.com` email, then choose **Email me a code**.
3. Until Postmark is set up, the code appears in the Terminal window, like this:

   ```
   [pinpoint] Sign-in code for you@thoughtcollective.com: 482913
   ```

4. Type the code. You'll stay signed in on that browser for 30 days.

### Try a snag

1. Open **http://localhost:3000/demo.html?feedback**, a practice page that's already set up.
2. Choose **Sign in to leave feedback** and sign in the same way.
3. Click the blue button in the bottom-right corner, then the **pencil**.
4. Drag a box around something, choose **Bug**, **Change**, **Question** or **Other**, write a note and press **Send**.
5. Back in the inbox, choose the **test** site. Your snag is there, with a screenshot of the area.

## Using it

### The inbox

- **Snags** lists everything for one site. Use the picker next to the heading to switch sites.
- **To do**, **Done** and **All** filter by status. Search and the **Show** menu narrow things further.
- Click a snag to see the details:
  - the screenshot (click it to enlarge)
  - the page it was left on
  - the browser and screen size used
  - any console errors from the client's browser
- In a snag you can:
  - set its status: **Open**, **In progress**, **Resolved** or **Won't fix**
  - **reply** to the client
  - use **Open on page** to jump to that exact spot on the site
  - **delete** it
- Keyboard shortcuts: `j` / `k` (or the arrow keys) move through snags, `/` jumps to search, `Esc` closes, and Ctrl/⌘ + Enter sends a reply.

### Adding a client's website

1. In the inbox, go to **Sites** and choose **Add a site**.
2. Fill in:
   - **Name**: short, lower case, like `test` or `ards-dental`. You'll see it in the inbox.
   - **Addresses**: one per line, for every place the site runs, for example:

     ```
     https://www.test.org
     https://staging.test.org
     ```

     The first one is used for "Open on page" links.
   - **Clients**: the email addresses of the people who'll review this site, one per line.
   - **Notify**: the team emails to tell about new snags and client replies on this site. It starts with your own email.
3. Copy the **snippet** and paste it into the site's template, just before `</body>`:

   ```html
   <script src="https://your-pinpoint-server/pinpoint.js" data-site="test" defer></script>
   ```

   On a Statamic site, that's the bottom of `layout.antlers.html`. On Squarespace, it's **Settings → Advanced → Code Injection → Footer**.
4. Send your clients the **link to send clients**, for example `https://www.test.org/?feedback`.

Changes on the Sites screen take effect immediately, with no restart:

- Adding someone lets them in.
- Removing someone locks them out, even if they're signed in.
- Removing a site stops new snags. Its existing snags are kept, and they come back if you add the site again.

### What clients see

- **Ordinary visitors see nothing at all.** The widget isn't even loaded for them.
- Opening the `?feedback` link shows a **Sign in to leave feedback** button. The client enters their name and email, gets a code, and the snagging widget appears.
- It stays switched on in their browser until they choose **Sign out** (bottom-left) or open the site with `?feedback=off`.
- Clients can add snags and reply, but they can't change statuses, delete anything or see other people's email addresses.
- Someone who hasn't been invited is told "if you've been invited, a code is on its way" and never receives one. That way the form can't be used to find out who has access.

### Email notifications

Emails go out straight away:

| When | Who's emailed | What it includes |
|---|---|---|
| Someone leaves a new snag | Everyone on the site's **Notify** list | The snag, who left it, and links to it in the inbox and on the page |
| A client replies | The **Notify** list | The reply and a link to the inbox |
| Your team replies | The client who left the snag | Your reply and a link to the snag on their site, where they can reply |
| A snag is marked **Resolved** or **Won't fix** | The client who left the snag | Which one it was, with a link to the snag on their site |

A few rules keep the emails useful:

- Nobody is emailed about something they did themselves.
- **In progress** doesn't email anyone.
- Moving a snag between Resolved and Won't fix doesn't email again. Reopening it and closing it again does.
- Snags and replies between your own team don't email clients.
- A retried snag or reply is only ever emailed once.

To stop someone getting emails for a site, remove them from its **Notify** list. Until Postmark is set up, notifications are shown in Terminal instead.

## Sending real emails with Postmark

1. In Postmark, open your server (or create one) and copy its **Server API token** from the **API Tokens** tab.
2. Make sure the address you'll send from is verified: either a **Sender Signature** for that address, or its whole domain under **Domains**.
3. In `apps/pinpoint/.env`, set:

   ```
   POSTMARK_SERVER_TOKEN=your-server-api-token
   TC_PINPOINT_EMAIL_FROM=pinpoint@thoughtcollective.com
   ```

4. Stop the server (Ctrl + C) and run `npm run dev` again. Codes and notifications now arrive by email. Codes have a subject like **"482913 is your PinPoint code"**.

If Postmark refuses a code, the person is asked to try again in a minute. If it refuses a notification, the snag or reply is still saved. Either way, the reason is shown in Terminal. That's usually a From address that isn't verified.

## Putting it online

Clients can't reach `localhost`, so for real use the server needs to be online. Any host that runs Node 22.19+ and keeps files between restarts works, for example Railway, Render, Fly.io or a small VPS.

1. **Upload the project.** The usual way is to push it to a private GitHub repository and connect that to the host. Don't upload `node_modules`, `.env` or `apps/pinpoint/data`; the `.gitignore` files already leave them out.
2. **Set the build and start commands:**
   - Build: `npm install && npm run build`
   - Start: `npm start`
3. **Add a disk (volume) for saved data**, mounted at `apps/pinpoint/data`. Without it, snags disappear whenever the host restarts.
4. **Copy your settings** from `.env` into the host's environment variables, and add `TC_PINPOINT_TRUST_PROXY=true`. The live server won't start without a Postmark token, so codes are never silently lost.
5. **Give it an address**, for example `pinpoint.thoughtcollective.com`, using the host's custom-domain settings.
6. **Open the live inbox**, sign in and add your sites. Their snippets automatically use the live address.

Back up `apps/pinpoint/data` now and then. It's the only copy of your snags, sites and sign-ins.

## Settings

Settings live in `apps/pinpoint/.env`. `.env.example` lists them all with notes.

| Setting | What it does | Default |
|---|---|---|
| `POSTMARK_SERVER_TOKEN` | Sends sign-in codes by email. Required when live; leave it empty to see codes in Terminal while trying it out. | empty |
| `TC_PINPOINT_EMAIL_FROM` | The address codes are sent from. Must be verified in Postmark. | `pinpoint@thoughtcollective.com` |
| `TC_PINPOINT_TEAM_DOMAINS` | Anyone with an email at these domains is on your team. Separate several with commas. | `thoughtcollective.com` |
| `TC_PINPOINT_TRUST_PROXY` | Set to `true` when hosted (Railway, Render…), so rate limits see real visitors and https is recognised. | `false` |
| `TC_PINPOINT_DATA` | Where snags are saved. Sites and sign-ins go in the same folder. | `data/snags.json` |
| `PORT` | The port the server runs on. | `3000` |

## How the project is organised

```
tcpinpoint/
├── apps/pinpoint/            the snagging tool you run
│   ├── index.html            the inbox page
│   ├── src/                  the inbox's code
│   ├── loader/pinpoint.js    the script tag for client sites (sign-in, then loads the widget)
│   ├── demo.html             the practice page (npm run dev only)
│   ├── server.js             the server: API, sign-in, sites, serves everything
│   ├── lib/                  sign-in codes, emails, notifications, sites, saving files
│   ├── data/                 your saved snags, sites and sign-ins (created when it first runs)
│   └── .env                  your settings
├── packages/
│   ├── widget/               the snagging widget clients use
│   ├── server/               the snag API: checks, permissions, replies
│   ├── core/                 shared types and rules
│   ├── adapter-kit/          turns "load and save a list" into a full snag store
│   ├── adapter-memory/       an in-memory store, used by the tests
│   └── adapter-localstorage/ a browser store, used by the widget's tests
├── e2e/                      browser tests for the widget (Chromium, Firefox, Safari)
└── scripts/fix-dts.mjs       a small build helper
```

## Commands

Run these from the main `tcpinpoint` folder.

| Command | What it does |
|---|---|
| `npm run dev` | Runs PinPoint on http://localhost:3000, with live reload for the inbox. |
| `npm run build` | Builds everything. Needed before `npm start`, and after updates. |
| `npm start` | Runs the built version, as it would run online. |
| `npm run verify` | Builds, type-checks, lints and runs all the tests. |
| `npm run lint:fix` | Tidies formatting automatically. |
| `npm run test:e2e` | Runs the widget's browser tests. Run `npx playwright install` once first. |

## Troubleshooting

**Safari "can't connect to the server".** The server isn't running. Run `npm run dev` and wait for "PinPoint is running".

**A different page appears at localhost:3000.** Another app is already using port 3000. Stop that app, or set `PORT=3001` in `.env` and use http://localhost:3001.

**No code arrives.**
- Without a Postmark token, codes are shown in Terminal.
- With one, check the Terminal for a Postmark error and make sure `TC_PINPOINT_EMAIL_FROM` is verified in Postmark.
- Clients only get a code for a site they're listed on.

**Nobody's getting notification emails.**
- Check the site's **Notify** list on the Sites screen.
- Without a Postmark token, notifications are shown in Terminal instead of emailed.
- You won't be emailed about your own snags and replies.

**"The inbox is for your team".** The inbox only accepts emails at `TC_PINPOINT_TEAM_DOMAINS`. Clients leave feedback on their own website instead.

**The widget doesn't appear on a client's site.**
- Open the site with `?feedback` on the end and sign in.
- Check the site's address is listed under **Sites**, exactly as it appears in the browser (including `www` or not, and `https`).
- Check the snippet's `data-site` matches the site's name.

**Tests fail with "Cannot read properties of undefined (reading 'bind')".** Your Node version is too old. Install Node 22.19 or newer.

## Security

- Codes are 6 digits, last 10 minutes, and stop working after 5 wrong tries. Asking for codes and guessing them are both rate-limited.
- Every snag and reply is stamped with the signed-in person's name and email by the server, so nobody can post as someone else or as your team.
- Clients can only use the sites they're invited to, can't change statuses or delete, and can't see other people's email addresses.
- Only your listed sites can talk to the server from a browser.
- Sign-ins are saved as fingerprints only, so a copy of `data/sessions.json` can't be used to sign in. Codes are never written to disk.
