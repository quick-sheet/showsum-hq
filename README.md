# Showsum HQ

G's private control room for the Showsum outreach engine: one app on desktop and phone that sits over the existing Showsum Pipeline and Exhibitor Leads scripts.

**Release 2:** your live pipeline on the Overview (sending against the daily limit, every show with its prospects by stage and what's next, your turn, arrivals, shows ahead) and a Customers page (plans, money, passes, what's coming up). Release 1 brought the shell, the Google sign-in lock, Launchpad and Settings. HQ still only reads your sheets: nothing in the pipeline changes.

Lives at **https://hq.quick-sheet.com** (GitHub Pages with its own subdomain, so no other app shares its address).

## How it fits together

```
HQ app (this repo, GitHub Pages)          no links, sheet IDs or secrets in here
   │  every request carries your Google sign-in (ID token)
   ▼
HQ script (apps-script/Code.gs, a standalone Apps Script web app)
   │  checks the sign-in with Google: this app's client ID + ALLOWED_EMAIL, verified, not expired
   ├── reads (never writes): Showsum Pipeline sheet · Exhibitor Leads data · Showsum database
   ├── later: asks the pipeline web app to act (batches, inbox, autopilot)
   └── Launchpad links and settings live in its Script Properties
HQ app ──► Exhibitor Leads web app directly (later release; it accepts the same sign-in)
```

- The pipeline sheet stays the master record. HQ adds a few tabs of its own in later releases (Batches, Inbox, Sectors, Show list, HQ settings).
- The pipeline script keeps doing all sending, with its Gmail alias, templates and limits.

## Security

- **Every action needs your Google sign-in.** Anyone can reach the script's address, but every action is refused unless the request carries a Google sign-in that:
  - is for **ALLOWED_EMAIL**;
  - was issued to **HQ_CLIENT_ID**;
  - has a verified email;
  - is still in date.

  The script checks the token's claims itself first, so junk never reaches Google. Google then checks the signature (tokeninfo).
- **One account, for good.** The first sign-in records that account's permanent Google ID in **HQ_SUB**. From then on, only that account gets in.
- **Remembered by hash.** A checked sign-in is remembered by its SHA-256, never the sign-in itself, until it expires. Signing out ends it on the server too.
- **Failed checks pause.** After 30 failed checks in 10 minutes, new checks pause for 10 minutes. A sign-in already checked keeps working.
- **Locked to your script.** `config.js` holds a fingerprint of your HQ script's address (`scriptPin`), not the address itself. HQ refuses to connect to any other script, whether typed in or from a link. HQ also refuses to run inside another page.
- The app never sees Script Property values, only whether each one is set.
- Your pipeline and customers are kept in the app's memory only, never saved on the device. Arrivals never show an email address.
- HQ's script only reads the three sheets (the tests fail if it ever tries to write to one). The only things it saves are its own settings, in its Script Properties: the Launchpad, the name HQ calls you, and which customers are tests.
- The sign-in sits in the browser tab's session storage and is gone when the tab closes. The app keeps the connection (script address, client ID) and a copy of your Launchpad on the device for offline opening.
- The service worker only keeps the app's own files. Nothing from your scripts is cached.
- With the Google Cloud OAuth audience set to **Internal**, only accounts in your own Workspace can even start the sign-in.

## config.js

Two values, both safe to publish. Once yours are filled in, **never upload config.js from a release zip**: release zips leave it out on purpose, so yours stays as it is.
- `clientId`: the Google sign-in client ID.
- `scriptPin`: the first 22 characters of the SHA-256 of the HQ script's address, base64url.

HQ shows both lines the first time you connect. On a Mac, you can also work out the pin with:
`printf %s 'https://script.google.com/macros/s/…/exec' | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | cut -c1-22`

## Script Properties (Apps Script → Project Settings)

| Property | What it is | Needed from |
|---|---|---|
| HQ_CLIENT_ID | Google sign-in client ID for HQ | Release 1 |
| ALLOWED_EMAIL | The only account that can open HQ | Release 1 |
| HQ_SUB | Filled in by itself on the first sign-in. Delete it only if you move HQ to another account | Release 1 |
| PIPELINE_SHEET_ID, LEADS_SHEET_ID, POS_DB_ID | The three sheets (the code between `/d/` and `/edit` in each address) | Release 2 |
| PIPELINE_URL, SHEET_SECRET | The pipeline web app address and its secret | Release 3 |
| TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID | Same as the pipeline's | Release 4 |
| EL_URL | Exhibitor Leads web app address | Release 6 |
| HQ_NAME, HQ_NOT_CUSTOMERS_… | Saved by HQ itself (Settings → What HQ calls you; Customers → Not a customer). No need to touch them | Release 2 |

## Releasing

Bump together on every release:
- `config.js?v=N`, `hq.js?v=N` and `hq.css?v=N` in `index.html` and in `sw.js`;
- the cache name `showsum-hq-vN` in `sw.js`;
- `APP_VERSION` in `hq.js`.

If `Code.gs` changed, also bump `BUILD` in `Code.gs` and `EXPECT_BUILD` in `hq.js`.

- **Apps Script:** paste `Code.gs` → Deploy → Manage deployments → pencil → Version: New version → Deploy. The address stays the same.
- **GitHub:** upload the changed files (Add file → Upload files → Commit), wait for the Pages tick, then reload HQ.

## Releases

- **2** (1 Nov 2026):
  - Overview over your live pipeline, read-only:
    - sent today against the day's limit, with the 7-day bounce rate and the step-up hold;
    - 7-day tiles for emails, visits, bounces and sales;
    - every show with its prospects by stage and its next step (first email window, Day 2, Last touch, Season planning);
    - your turn: next actions due today, grouped, plus new customers still being set up;
    - arrivals from the last 7 days, and shows ahead for the next 3 weeks from Exhibitor Leads.
    - It reads again every 5 minutes while open (the script keeps a copy for a minute).
  - Customers: plans, monthly recurring, money taken, Event Pass journeys, the list, coming up in 30 days, and Not a customer for tests.
  - Settings: what HQ calls you.
  - The service worker always asks GitHub for config.js, so edits to it arrive straight away.

- **1** (31 Oct 2026):
  - app shell, with a rail on desktop and a tab bar on phone;
  - connect screen, locked to your script by `config.js`;
  - Google sign-in lock, with a server-side account ID check, sign-out and a pause after repeated failures;
  - Launchpad: starter links, edit, reorder, add and remove;
  - Settings: which sheets and web apps are reachable, Script Properties checklist, Telegram test, link for your phone;
  - offline opening.
