# PinPoint

PinPoint is a website feedback tool I built to keep client comments in one place.

Clients can draw a box around something on their website, choose a feedback type and leave a comment. The team can then view it in the inbox, reply and update its status.

It runs on our own server and saves feedback to JSON files, so there's no database to set up. Postmark handles sign-in codes and notification emails.

## Getting started

You'll need Node.js **22.19 or newer** and npm. Check your Node version with:

```bash
node --version
```

From the project folder, run:

```bash
npm install
cp apps/pinpoint/.env.example apps/pinpoint/.env
npm run build
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) once the server is running. Leave Terminal open while you're using it, and press **Ctrl + C** to stop it.

### Signing in

Enter your name and Thought Collective email, then click **Email me a code**.

If Postmark hasn't been set up yet, the code appears in Terminal instead:

```text
[pinpoint] Sign-in code for you@thoughtcollective.com: 482913
```

Codes expire after 10 minutes. Once signed in, your session lasts 30 days unless you sign out.

### Trying it out locally

1. Open [the demo page](http://localhost:3000/demo.html?feedback).
2. Click **Sign in to leave feedback** and sign in.
3. Open the feedback widget and select the pencil tool.
4. Draw a box around part of the page, choose a type and add your comment.
5. Click **Send**, then open the inbox and select the **test** site to see it.

The demo page is available when running `npm run dev`. A test site is added when you first run the app locally, if there isn't already a sites file.

## Managing feedback

Use the site picker in the inbox to choose a website. You can filter feedback by status or type, or search for a message or page.

Open an item to:

- View its screenshot and open the original page.
- Change its status to **Open**, **In progress**, **Resolved** or **Won't fix**.
- Reply to the client.
- View browser information and any captured console or network details.
- Delete feedback you no longer need.

If assignment controls are available in your version of the inbox, feedback can also be assigned to someone on the site's team notification list.

Keyboard shortcuts are available in the inbox: `j` / `k` to move between items, `/` to search and `Esc` to close. Use **Ctrl + Enter** or **⌘ + Enter** to send a reply.

## Adding a website

Go to **Sites → Add a site** and fill in:

| Field | What to enter |
|---|---|
| Site name | A short name such as `example-site`. Use lowercase letters, numbers and dashes. Start with a letter or number. |
| Website URLs | Each address the widget will run on, one per line. Include live, staging or local addresses as needed. Put the main address first. |
| Client email addresses | The people who can leave feedback on this website, one email per line. |
| Team notification emails | The team members who should receive new feedback and client replies, one email per line. This is under **Email notifications** in the form. |

The site name is used to link feedback to the website, so it can't be changed afterwards.

### Adding the widget

Save the site, expand **Installation** and copy the installation code. Add it to the website template before the closing `</body>` tag:

```html
<script
  src="https://your-pinpoint-server/pinpoint.js"
  data-site="example-site"
  defer
></script>
```

Use the code generated for your site. It includes your PinPoint server address and the correct site name.

For a Statamic site, add it near the bottom of the main layout, such as `layout.antlers.html`.

### Sharing it with clients

Click **Copy client link** and send that link to the client. It opens their website with feedback enabled, for example:

```text
https://www.example.com/?feedback
```

The client signs in with their name, an invited email address and an emailed code. They can then leave feedback and reply through the widget.

Clients can't change statuses or delete feedback. Team members can use all registered sites; clients can only use the sites they've been added to.

Feedback mode stays enabled in that browser until the client signs out, turns it off with `?feedback=off`, or needs to sign in again. Visitors who haven't enabled feedback mode won't see the widget.

### Updating a site

Expand **Settings** to view the site's URLs, client access and notification recipients. Choose **Edit site** to change them.

Changes take effect without restarting the server. Removing a client removes their access, including when they're already signed in.

Removing a site stops new feedback. Existing feedback is kept and becomes available again if you add the site using the same name.

## Email notifications

| What happens | Who gets an email |
|---|---|
| New feedback is submitted | The site's team notification list |
| A client replies | The site's team notification list |
| A team member replies | The client who originally left the feedback |
| Feedback moves from an open status to **Resolved** or **Won't fix** | The client who originally left the feedback |
| Feedback is assigned | The person it's assigned to |

You won't receive an email for an action you've taken yourself. Changing feedback to **In progress** doesn't send an email. Moving between **Resolved** and **Won't fix** doesn't send another one, but reopening and closing it again does.

Without Postmark, emails are printed in Terminal. If a notification fails to send, the error is logged and the feedback or reply remains saved.

### Setting up Postmark

In Postmark, copy your server's API token and verify the email address or domain you'll send from.

Add these values to `apps/pinpoint/.env`:

```dotenv
POSTMARK_SERVER_TOKEN=your-server-api-token
TC_PINPOINT_EMAIL_FROM=pinpoint@thoughtcollective.com
```

Restart the server after changing `.env`. Sign-in codes and notifications will then be sent by email.

## Putting it online

Clients can't access the server on your Mac through `localhost`. For shared use, deploy it to a Node host with persistent storage and HTTPS.

1. Upload or connect the project to your host. Keep `.env`, `node_modules` and saved data out of Git.
2. Set the build command to `npm install && npm run build`.
3. Set the start command to `npm start`.
4. Configure a persistent disk for the app's data folder. The default is `apps/pinpoint/data`; the exact mount path depends on the host's working directory.
5. Add your environment variables, including the Postmark token and verified sender address. The live server requires a Postmark token.
6. If the host uses a trusted reverse proxy, set `TC_PINPOINT_TRUST_PROXY=true`.
7. Open the live inbox, add your sites and use the installation code generated there.

Back up the data folder regularly. It contains saved feedback, sites, assignments and sessions. A deployment without persistent storage can lose these files when the app is redeployed or its instance is replaced.

## Settings

Settings are in `apps/pinpoint/.env`. See `.env.example` for the full list and notes.

| Setting | Purpose | Default |
|---|---|---|
| `POSTMARK_SERVER_TOKEN` | Sends sign-in codes and notification emails. Required when live. | Empty |
| `TC_PINPOINT_EMAIL_FROM` | Sender address verified in Postmark. | `pinpoint@thoughtcollective.com` |
| `TC_PINPOINT_TEAM_DOMAINS` | Email domains treated as team members, separated by commas. | `thoughtcollective.com` |
| `TC_PINPOINT_TRUST_PROXY` | Trusts the hosting proxy for visitor IPs and HTTPS information. | `false` |
| `TC_PINPOINT_DATA` | Feedback file location. Related data is saved in the same folder. | `data/snags.json` |
| `PORT` | Server port. | `3000` |

## Project structure

| Folder | What's in it |
|---|---|
| `apps/pinpoint/` | The inbox, server, widget loader and local demo. |
| `apps/pinpoint/lib/` | Sign-in, email, notifications, site settings and file storage. |
| `apps/pinpoint/data/` | Saved app data, created when needed. |
| `packages/widget/` | The feedback widget used on client websites. |
| `packages/server/` | Feedback API and permissions. |
| `packages/core/` | Shared types and rules. |
| `packages/adapter-*/` | Storage adapters and shared adapter code. |
| `e2e/` | Browser tests. |

## Commands

Run these from the main project folder.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the local development server. |
| `npm run build` | Builds the project. Run before `npm start` and after updates. |
| `npm start` | Runs the built app. |
| `npm run verify` | Runs the build, type checks, lint and tests. |
| `npm run lint:fix` | Applies automatic lint fixes. |
| `npm run test:e2e` | Runs the browser tests. Run `npx playwright install` first. |

## Common issues

**The local page won't open**

Check that `npm run dev` is still running and use the address shown in Terminal.

If another app is using port 3000, stop it or set `PORT=3001` in `.env`, restart the server and open [http://localhost:3001](http://localhost:3001).

**The sign-in code hasn't arrived**

- Without a Postmark token, check Terminal for the code.
- With Postmark enabled, check for an error and confirm the sender address is verified.
- For clients, check their email is listed against the correct site.
- For the inbox, use an email from one of the configured team domains.

**Notification emails aren't arriving**

Check the site's team notification list and any errors in Terminal. You won't receive notifications for your own actions.

**The widget isn't showing**

- Open the client feedback link and sign in.
- Check that the website's full origin is listed in **Sites**, including the protocol, `www` if used, and any non-default port.
- Check that the installation code's `data-site` matches the saved site name.

**Tests fail with a `reading 'bind'` error**

Check your Node version. The project requires Node.js 22.19 or newer.

## Sign-in and access

Sign-in codes expire after 10 minutes, with a limit on verification attempts. Code requests and guesses are also rate-limited.

Sessions last 30 days and are stored as token hashes. Codes are held in memory rather than saved to disk. During local development without Postmark, codes are printed in Terminal.

The server uses the signed-in user's identity for feedback and replies, and checks whether clients have access to the requested site.
