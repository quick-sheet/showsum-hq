# Showsum HQ

G's private control room for the Showsum outreach engine: one app on desktop and phone that sits over the existing Showsum Pipeline and Exhibitor Leads scripts.

**Release 7:** Exhibitors. Everything the Exhibitor Leads app does, inside HQ, with the pipeline's side of each show: Go (the pipeline's own import, straight away), a fast-lane batch of the P1 and P2 ones that you start, and your Companies House calls on "Check" rows. Release 6: one business, not one row. HQ knows when rows across shows are the same business, and autopilot rests a business 30 days before a new show's first email, sends it at most 4 emails a year and never two in a day. Release 5 brought autopilot: you start batches in HQ; the pipeline's HQAutopilot file emails them on weekday mornings, through the pipeline's own templates, Gmail alias, rules and limits. Release 4 brought the Inbox; release 3 batches; release 2 the live Overview and Customers; release 1 the shell, the Google sign-in lock, Launchpad and Settings.

Lives at **https://hq.quick-sheet.com** (GitHub Pages with its own subdomain, so no other app shares its address).

## How it fits together

```
HQ app (this repo, GitHub Pages)          no links, sheet IDs or secrets in here
   │  every request carries your Google sign-in (ID token)
   ▼
HQ script (apps-script/Code.gs, a standalone Apps Script web app)
   │  checks the sign-in with Google: this app's client ID + ALLOWED_EMAIL, verified, not expired
   ├── reads: Showsum Pipeline sheet · Exhibitor Leads data · Showsum database
   ├── writes only: the Batch column on Prospects and its own Batches tab (make, move, start, pause, remove a batch,
   │   take someone out); the Inbox row you sort, and for a real reply or an opt-out that prospect's Stage, Next action,
   │   its date, Notes, and a Touches line; the HQ settings tab (autopilot Off / Dry run / Live, dry run, your check)
   └── Launchpad links and settings live in its Script Properties
HQ Exhibitors page (exhibitors/) ──► Exhibitor Leads web app directly, with the same sign-in (its release 19 checks it
   │                                   as HQ does); its address comes from HQ (EL_URL), only after you sign in
   └──► HQ script: the pipeline's side of each show; Go and your Companies House calls, which HQ's script passes to
        the pipeline web app (PIPELINE_URL, SHEET_SECRET); the fast-lane batch, made like any other batch

Pipeline script + HQInbox.gs + HQAutopilot.gs (apps-script/pipeline/, pasted into the pipeline's own Apps Script project)
   ├── HQInbox, every hour, 7am–9pm: logs new messages from prospects to the Inbox tab. HQ never opens Gmail.
   └── HQAutopilot, every 10 minutes: sends started batches on weekdays 08:30–11:30 (or a dry run), logs to the Autopilot tab.
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
- **Remembered by hash.** A checked sign-in is remembered by its SHA-256, never the sign-in itself, until it expires. Signing out ends it on the server too, in HQ's script and in Exhibitor Leads.
- **Failed checks pause.** After 30 failed checks in 10 minutes, new checks pause for 10 minutes. A sign-in already checked keeps working.
- **Locked to your script.** `config.js` holds a fingerprint of your HQ script's address (`scriptPin`), not the address itself. HQ refuses to connect to any other script, whether typed in or from a link. HQ also refuses to run inside another page.
- The app never sees Script Property values, only whether each one is set.
- Your pipeline, customers and inbox are kept in the app's memory only, never saved on the device. Arrivals and the Inbox never show an email address: addresses stay in the sheet, and any in a message's text are taken out before it reaches the app.
- HQ's script reads the three sheets. In the pipeline sheet it writes only:
  - the Batch column at the end of Prospects and its own Batches tab, when you make, move or remove a batch;
  - when you sort a reply: that Inbox row's Status and Confirmed cells. For a real reply also the prospect's Stage (New or Emailed become Engaged; other stages are left as you set them), Next action, Next action date and a line at the top of Notes, and one "Real reply" line in Touches. For an opt-out, their rows become Opted out with the next action cleared, a Notes line, and one "Opted out" line in Touches.

  The tests fail if it writes anywhere else. Before writing to Prospects it reads the Code column again, and if any row moved it saves nothing. It finds the Inbox row by its Message ID again just before writing its Status. Stage is written last and the Notes and Touches lines aren't repeated, so trying again after a failure finishes the job. Its own settings live in its Script Properties: the Launchpad, the name HQ calls you, and which customers are tests.
- **Exhibitors:** the page shows exhibitors' emails and phones, as the Exhibitor Leads app does, and like the rest of HQ holds them in memory only, gone when the page closes. A CSV download is the one thing that saves to the device, and only when you press it. Exhibitor Leads takes your HQ sign-in only when its own Script Properties name HQ's client ID, your email and HQ_SUB (the same values as HQ's); without them it still takes only its phone token.
- **Go and your calls go through the pipeline.** HQ's script never writes Prospects rows itself for these: Go runs the pipeline's own import (the same rules as Import a show from Exhibitor Leads), and Yes (Ltd) or Consent needed is the pipeline's canEmail op, only on a "Check" row not yet emailed. The fast-lane batch is made, never started.
- HQ's script never touches Gmail. The pipeline's HQInbox file reads it, as the pipeline already does for "no thanks" and bounces, and only adds rows to the Inbox tab. The pipeline's HQAutopilot file sends, exactly as the Showsum menu does.
- Switching autopilot to Live, pressing Continue after the first-emails check, and starting a batch while autopilot is Live need a sign-in from the last 10 minutes. The app renews it by itself and tries again.
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
| EL_URL | Exhibitor Leads web app address (ending /exec): the Exhibitors page talks to it | Release 7 |
| HQ_NAME, HQ_NOT_CUSTOMERS_… | Saved by HQ itself (Settings → What HQ calls you; Customers → Not a customer). No need to touch them | Release 2 |

## Releasing

Bump together on every release:
- `config.js?v=N`, `hq.js?v=N` and `hq.css?v=N` in `index.html` and in `sw.js`;
- the cache name `showsum-hq-vN` in `sw.js`;
- `APP_VERSION` in `hq.js`.

If `Code.gs` changed, also bump `BUILD` in `Code.gs` and `EXPECT_BUILD` in `hq.js`.

- **Apps Script:** paste `Code.gs` → Deploy → Manage deployments → pencil → Version: New version → Deploy. The address stays the same.
- **GitHub:** upload the changed files (Add file → Upload files → Commit), wait for the Pages tick, then reload HQ.

## Exhibitors

- **The page:** Exhibitors in the nav opens `exhibitors/`, the Exhibitor Leads app inside HQ: sectors, the show diary, shows, loading or pasting lists, the checks, Why this result?, Find on Companies House, rechecks, the organiser contact, CSV and notifications.
- **In the pipeline**, on each show: how many are in the pipeline, emailed and can email; the ones waiting for your Companies House call; its batches; what's not in the pipeline yet. Each exhibitor carries its priority, stage or "Your call", and its batch.
- **Go** runs the pipeline's own import for that show, straight away, for the exhibitors already checked (the rest, and any other listing of the same business, wait for the next Go). Going defaults to No for a new show, as in the menu. Then, if ticked, it makes a **fast-lane batch** of the P1 and P2 ones due a first email and not in a batch. Nothing is started: open it on the Departures board, check Members, press Start. Go again any time: it adds only what's new. For rows not yet emailed it also follows Exhibitor Leads, safely: "Check" becomes "Yes (Ltd)" once the company is confirmed, only while the row is New, in no batch and still on Check Companies House (so a Check you set yourself stays); and a business you've decided in Exhibitor Leads isn't an emailable company becomes Consent needed (or Check), emailed or not, whatever its batch, with its rows at other shows. Rows are decided again just before they're written, so a call you make meanwhile stands. One import at a time (Go or the menu's); it never keeps the website waiting.
- **Your call on "Check" rows:** Yes (Ltd) or Consent needed, from the exhibitor. Yes (Ltd) on a company Exhibitor Leads hasn't confirmed asks first. A Yes (Ltd) row has "Not a limited company? Consent needed". Deciding a company in Exhibitor Leads moves the pipeline row with it: a confirmed company lifts a "Check" row to Yes (Ltd), only before any email; "No, a different one" makes it Consent needed, emailed or not (its follow-up becomes Ask before emailing). One business, not one row: Consent needed or a hold also reaches the same business's rows at other shows (matched as autopilot matches a business; consent they gave stays), each with a note saying why. Each change says what it expects the row to be, and the pipeline changes nothing if the row says otherwise. The home page lists the shows with calls waiting, and Your turn's Check Companies House card opens the page.
- **Set-up, once:** in Exhibitor Leads' Script Properties add HQ_CLIENT_ID, ALLOWED_EMAIL and HQ_SUB, with the same values as HQ's, then deploy its release 19 as a new version. In HQ's add EL_URL. Go also needs PIPELINE_URL and SHEET_SECRET (already there from release 3) and the pipeline's fix-47.

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

## Autopilot

- **Set-up, once:** in the pipeline's Apps Script, + → Script, name it `HQAutopilot`, paste in `apps-script/pipeline/HQAutopilot.gs`, save, choose `hqAutopilotSetUp` and press Run. It adds the HQ settings and Autopilot tabs and a 10-minute trigger. Autopilot starts **Off**. Nothing in the pipeline's own code changes.
- **Batches:** open **Members** on a batch to see who's in it and what autopilot will do for each (due now, waiting, replied, engaged, not sent and why); take out anyone you don't want emailed. Press **Start**. Autopilot only ever emails started batches, top of the board first. **Pause** stops a batch at once.
- **Modes (on the Autopilot panel):**
  - **Off:** nothing is sent.
  - **Dry run:** once each weekday morning in the window it works out exactly what it would send, logs it to the Autopilot tab and Telegram, and sends nothing. **Dry run now** asks for one straight away, at any hour (within 10 minutes).
  - **Live:** in each sending window (weekdays 08:30–11:30, London; not bank holidays or 20 Dec – 3 Jan) it sends up to 20 emails a run, every 10 minutes, within the day's limit and the bounce hold from the Send limits tab. After each switch to Live, the first run sends 5 and waits: check them in Gmail Sent and press **Continue**.
- **What it sends:** each member's next email when it's due: the first email (A for Google Workspace, B otherwise) from 14 days before the show up to the day before it starts; Day 2 two days after the show ends; Last touch 12 days after Day 2; Season planning in the second week of January. Before each email it checks again with the Showsum menu's own skip rules, and never emails anyone opted out, bounced, without "Yes" in Can email, engaged, with a reply waiting in the Inbox, or already sent that email. It sends and records each one exactly as the menu does (Touches note "Autopilot B01").
- **Safety:** before each live run it checks the Inbox (HQInbox.gs must be in the pipeline project too) and runs the "no thanks" check; if either fails, nothing is sent. Each email's row is read again just before it goes. The Touches line is written straight after each email; if an email that went can't be recorded, autopilot switches itself Off and tells you (Telegram and the Autopilot panel), so nothing is sent twice. Three failed sends in a row also switch it off. Don't send from the Showsum menu while autopilot is Live.
- **One business, many rows (release 6):** rows are the same business when they share a name (tidied: Ltd, The, UK, spaces and punctuation ignored, "&" and "+" read as "and"), an email address, or the company's own domain: its email domain or its website. Personal mail providers (gmail.com, btinternet.com…) and shared site platforms (Etsy, Facebook, Instagram, Linktree…) never link rows, and nor does a domain used by more than three differently named businesses. For each business, across all its rows and shows:
  - **Rest days** (30): no first email for a new show, or Season planning, within 30 days of any outreach email to it, whatever the sector. If the rest runs past the show's start, that show's first email is skipped.
  - **Yearly cap** (4): at most 4 outreach emails in 12 months, follow-ups included. Customer emails and thank-yous don't count.
  - Never two emails on the same day: the top batch on the board goes first, the other waits.
  - Nothing more while another of its rows is opted out, a customer, engaged or marked Not now; a reply waiting on any of its rows holds them all.
  - Change Rest days and Yearly cap on the HQ settings tab (0 turns either off). Autopilot adds the two rows there on its next look.
  - Members tag anyone also in another batch (ALSO IN B01), and say why someone is resting or not sent.
- **The plan is HQ's own:** HQAutopilot.gs carries a copy of HQ's planning code, rebuilt with every release, so the preview on the Overview, the dry run and the live sends agree. Paste the new HQAutopilot.gs whenever a release includes it.
- **To stop at once:** switch it Off in HQ, or delete the `hqAutopilotTick` trigger.

## Releases

- **7** (3 Nov 2026):
  - Exhibitors page: the Exhibitor Leads app inside HQ, on HQ's sign-in, in memory only.
  - The pipeline's side of each show; Go; the fast-lane batch; Yes (Ltd) or Consent needed on "Check" rows, also when you confirm a company; the shows with calls waiting.
  - Nav: Exhibitors. Your turn: Check Companies House opens it. Sharing a show's page to HQ on Android opens Add exhibition.
  - Autopilot as it happens: while it's sending (Live or a dry run, in its window), the Overview looks every 30 seconds (the HQ settings tab only), reloads the moment a run lands and says what went; the panel counts down to the next run. Back on the tab, it catches up at once.
  - Needs: HQ Code.gs (build 7), the pipeline's fix-47, Exhibitor Leads release 19.

- **6** (2 Nov 2026):
  - One business across rows and shows: matched by name ("+" = "and"), address, own email domain or website.
  - Autopilot: 30-day rest before a new show's first email, at most 4 emails a year, never two in a day, nothing while another row is opted out, a customer, engaged or not now; a reply on any row holds them all. Rest days and Yearly cap on the HQ settings tab.
  - Members: ALSO IN tags; resting notes. Refresh reads open member lists again.
  - Recent runs count every row of a run (they counted only the latest 60). Your turn's follow-up card leaves out people already in a batch. Before its first look, the Autopilot panel says it comes within 10 minutes of set-up.

- **5** (2 Nov 2026):
  - Autopilot: HQAutopilot.gs for the pipeline (10-minute trigger, sending window, dry run, live sends as the menu sends them, the 5-email check, log tab, Telegram).
  - Overview: an Autopilot panel (Off / Dry run / Live, what the next run sends, recent runs, Dry run now, Continue); Start, Pause and Members on each batch, with Take out.
  - Your turn: batches ready to start, and the first-emails check.

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
