# PinPoint

A self-hosted snagging tool: clients pin feedback to their website, the team works through it in one inbox. Built on SitePing (MIT), renamed to PinPoint. See README.md for install and use.

## Commands (npm workspaces, run from the repo root)
- `npm install`: install all workspaces
- `npm run dev`: the app on http://localhost:3000 (server + Vite middleware, live reload)
- `npm run build`: build every package and the inbox (Turborepo + tsup, cached)
- `npm start`: run the built app (needs `npm run build` and, when not in dev, a Postmark token)
- `npm run verify`: build + check + lint + test:run, the full gate before calling work done
- `npm run check`: TypeScript, src and `__tests__`
- `npm run lint` / `npm run lint:fix`: Biome
- `npm run test:run`: Vitest once; `npm run test:e2e`: Playwright widget tests (`npx playwright install` first)
- Node 22.19+ (Vitest's jsdom/undici need it)

## Layout
- `apps/pinpoint`: the app
  - `server.js`: Node http server. Routes `/api/tcpinpoint` (the `@tc-pinpoint/server` handler with a custom `access` policy), `/api/auth/*` (email-code sign-in), `/api/sites` (team only), `/pinpoint.js` (client-site loader), `/widget.js` (`packages/widget/dist/index.global.js`), and the inbox (Vite in `--dev`, `dist/` otherwise)
  - `lib/auth.js`: 6-digit codes (memory, 10 min, 5 tries), sessions (data/sessions.json, sha256 of token, 30 days), rate limits, roles. Team = email at `TC_PINPOINT_TEAM_DOMAINS`; clients = emails listed on a site
  - `lib/sites.js`: data/sites.json: `{ name, addresses (origins), clients (emails), notify (team emails) }`; addresses feed CORS `allowedOrigins` (handler rebuilt on change)
  - `lib/notify.js`: emails sent right away: new snag / client reply → site's notify list; team reply / resolved or won't fix → the client author. Never the actor; team-only threads don't email clients. Hooked via `hooks.onCreated` plus a wrapper around the store's `addComment` / `updateFeedback` (new replies detected by clientId; who acted comes from an AsyncLocalStorage set per request in server.js)
  - `lib/email.js`: Postmark (`send`, `sendCode`); without `POSTMARK_SERVER_TOKEN` emails print to the terminal (dev only, or `TC_PINPOINT_PRINT_CODES=true`)
  - `loader/pinpoint.js`: vanilla script for client sites (`data-site`). Hidden unless `?feedback` (remembered) or a session; closed shadow DOM sign-in card; then loads the widget with `headers: { Authorization }` and `identity`
  - Inbox: `index.html` + `src/` (Tailwind 4 `@theme` + `@layer utilities`, Alpine `Alpine.data("inbox")` in `src/js/components/inbox.js`)
  - `demo.html`: a two-panel practice page in the inbox style (uses `src/css/site.css`) for trying the widget (dev only, not in the build; uses the seeded "test" site)
  - Snags: data/snags.json via `@tc-pinpoint/adapter-kit` `createCollectionStore`
- `packages/`: `core` (types, schema; internal, bundled into the others), `widget` (closed Shadow DOM, DOM-anchored annotations), `server` (Fetch API handler), `adapter-kit`, `adapter-memory` and `adapter-localstorage` (test stores)

## Rules the app relies on
- Permissions: team does everything; clients only `create`, `list`, `createComment` on sites that list their email
- `beforeCreate` / `beforeComment` stamp the session's name and email; `canCommentAsTeam` and `canReadAuthorEmail` are team only
- Uninvited emails get the same "code is on its way" answer but never a code (no enumeration)

## Code style
- Biome: 2 spaces, double quotes, semicolons, trailing commas, line width 120; `npm run lint:fix` formats
- Packages: TypeScript strict with exactOptionalPropertyTypes; the app is plain ES modules
- Feedback statuses: `open` / `in_progress` / `resolved` / `wont_fix`
- Keep the app accessible: real buttons, labels, visible focus, live regions for status messages
