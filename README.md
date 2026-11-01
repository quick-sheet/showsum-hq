# Showsum HQ

G's private control room for the Showsum outreach engine: one app on desktop and phone that sits over the existing Showsum Pipeline and Exhibitor Leads scripts.

**Release 4:** the Inbox. The pipeline checks Gmail every hour and logs messages from prospects to an Inbox tab; HQ shows them and you sort each new one with a tap. A real reply moves the prospect to Engaged with "Reply to them" due today, and HQ keeps anyone with a reply waiting out of batches. Release 3 brought batches; release 2 the live Overview and Customers; release 1 the shell, the Google sign-in lock, Launchpad and Settings. HQ sends no email yet: you send each batch from the Showsum menu until autopilot (step 5).

Lives at **https://hq.quick-sheet.com** (GitHub Pages with its own subdomain, so no other app shares its address).

## How it fits together

```
HQ app (this repo, GitHub Pages)          no links, sheet IDs or secrets in here
   │  every request carries your Google sign-in (ID token)
   ▼
HQ script (apps-script/Code.gs, a standalone Apps Script web app)
   │  checks the sign-in with Google: this app's client ID + ALLOWED_EMAIL, verified, not expired
   ├── reads: Showsum Pipeline sheet · Exhibitor Leads data · Showsum database
   ├── writes only: the Batch column on Prospects and its own Batches tab (when you make, move or remove a batch);
   │   the Inbox row you sort, and for a real reply or an opt-out that prospect's Stage, Next action, its date, Notes, and a Touches line
   ├── later: asks the pipeline web app to act (autopilot)
   └── Launchpad links and settings live in its Script Properties
HQ app ──► Exhibitor Leads web app directly (later release; it accepts the same sign-in)

Pipeline script + HQInbox.gs (apps-script/pipeline/, pasted into the pipeline's own Apps Script project)
   └── every hour, 7am–9pm: logs new messages from prospects to the Inbox tab. HQ never opens Gmail.
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
- Your pipeline, customers and inbox are kept in the app's memory only, never saved on the device. Arrivals and the Inbox never show an email address: addresses stay in the sheet, and any in a message's text are taken out before it reaches the app.
- HQ's script reads the three sheets. In the pipeline sheet it writes only:
  - the Batch column at the end of Prospects and its own Batches tab, when you make, move or remove a batch;
  - when you sort a reply: that Inbox row's Status and Confirmed cells. For a real reply also the prospect's Stage (New or Emailed become Engaged; other stages are left as you set them), Next action, Next action date and a line at the top of Notes, and one "Real reply" line in Touches. For an opt-out, their rows become Opted out with the next action cleared, a Notes line, and one "Opted out" line in Touches.

  The tests fail if it writes anywhere else. Before writing to Prospects it reads the Code column again, and if any row moved it saves nothing. It finds the Inbox row by its Message ID again just before writing its Status. Stage is written last and the Notes and Touches lines aren't repeated, so trying again after a failure finishes the job. Its own settings live in its Script Properties: the Launchpad, the name HQ calls you, and which customers are tests.
- HQ's script never touches Gmail. The pipeline's HQInbox file reads it, as the pipeline already does for "no thanks" and bounces, and only adds rows to the Inbox tab.
- The app drops any answer that arrives after you sign out.
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

## Batches

- A batch is a group of prospects from one show that goes through first email, Day 2 and Last touch together (or Season planning, for those not emailed before their show).
- HQ only offers rows the Showsum menu would send, by the menu's own rules: a code and an email, Can email Yes, a stage that can be emailed, not opted out on any row, not already emailed for the same business in the same sector (a blank Sector matches every sector), the named email not already sent to that business with the same subject, and one row per address in a batch. Show dates are read the way the pipeline reads them. Engaged and Call booked prospects are yours: HQ leaves them out and lists them under Your turn.
- Each member's batch ID (B01, B02…) goes in the Batch column. To send a batch from the menu, filter Prospects by **Batch** and by **Stage** (New for first emails and Season planning, Emailed for Day 2 and Last touch), select the rows, and use the Showsum menu. The Stage filter leaves out anyone who has moved on since, such as a prospect who became Engaged or bought a pass. HQ shows the exact filter on each batch.
- IDs are never reused. Removing a batch clears its Batch cells and marks it Removed on the Batches tab. HQ writes only the cells that change, keeps text that looks like a formula as text, and saves nothing if Prospects' rows or columns moved while it was saving.

## Inbox

- **Set-up, once:** in the pipeline sheet, Extensions → Apps Script. Next to Files, + → Script, name it `HQInbox`, paste in `apps-script/pipeline/HQInbox.gs` and save. Choose `hqInboxSetUp` in the function list and press Run. It makes the Inbox tab, logs the last 30 days and adds an hourly trigger. Nothing in the pipeline's own code changes.
- **Every hour, 7am to 9pm**, `hqInboxHourly` logs each new message from a prospect once. A prospect is matched by their email address, or by their company's own domain: never a personal or internet-provider domain (gmail.com, btinternet.com, ntlworld.com…), nor a domain shared by different businesses. Each row gets a guess: **Real**, **Automatic** (out-of-office, ticket systems, newsletters) or **No thanks**.
- The pipeline's own no-thanks, bounce and auto-reply checks run as before, at 8am and before every send. (Running them hourly as well could log a bounce twice and push the bounce rate over the 2% hold.)
- **Sorting in HQ:** a Real guess arrives as New, and so does a "no thanks" from someone else at the company (the pipeline's check only opts out the sender's own address). Until you sort it, HQ keeps that prospect out of batches.
  - **Real reply** moves New or Emailed rows to Engaged with "Reply to them" due today, so they show under Your turn.
  - **Automatic** and **Not a reply** put them back in their batch. A sorted one can be put back to sort, or marked real.
  - **Opt them out** makes their rows Opted out, as the pipeline's no-thanks check does, except Customer and Event Pass rows and your own Not a fit / Not a UK company calls. A "no thanks" from the sender's own address is opted out by the pipeline at 8am or before the next send; HQ can do it sooner, or put it back to sort if it wasn't one. One still holding someone back stays in the Sorted list whatever its age, so it can always be released.
- **The Showsum menu doesn't know about the Inbox.** If you send a batch from the menu, sort its replies first: HQ names anyone with a reply waiting on the batch, to leave out.
- **Open in Gmail** opens the thread in the account in ALLOWED_EMAIL.
- **To turn it off:** delete the `hqInboxHourly` trigger (Apps Script → Triggers). The Inbox tab stays as a record.
- The Overview warns if a header HQ relies on is missing or repeated in Prospects, Shows, Touches or Inbox (HQ reads columns by their row 1 name).

## Releases

- **4** (1 Nov 2026):
  - Inbox page: replies to sort (real, automatic, not a reply, opt them out), with their first line, show, stage and a link to the Gmail thread; the last 30 days sorted; bounces and "no thanks".
  - HQInbox.gs for the pipeline: the hourly Gmail check and the Inbox tab.
  - A reply waiting keeps that prospect out of batches; each batch names them, for sends from the menu.
  - Overview: a Your turn card to sort replies (or to set up the Inbox, or when the hourly check has stopped), waiting replies in Arrivals, an Inbox badge, and a warning for missing or repeated headers.

- **3** (1 Nov 2026):
  - Departures board on the Overview: batches with their stage (first email, Day 2, Last touch, done), what's ready now, how to send it from the menu, move up or down, remove; and the groups ready to become batches, with Make batch.
  - Your turn: a card for each batch with rows ready, and one for engaged prospects whose next email is due.
  - Your shows use the menu's skip rules too, and leave engaged prospects to you.
  - Customers: refunds come off the money taken; purchases counted at list price (no sale row) are labelled; the Ended filter and wording match each customer's real status.

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
