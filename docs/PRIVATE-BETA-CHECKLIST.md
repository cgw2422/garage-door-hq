# Private beta checklist

**Nothing here is complete because the code exists.** Every item names what you
have to *observe*, and most of them can only be observed by a person with a
Railway, Cloudflare or Stripe login.

- **YOU** — needs a console, a card, a phone or a real inbox. I cannot do it.
- **DONE** — already verified in this repository, with the test or run that
  proves it named.
- **BLOCKER** — a real garage door company must not be invited until this is
  ticked.

Setup instructions: `docs/BETA-SETUP.md`. Security findings:
`docs/SECURITY-AUDIT.md`.

---

## A. Environments

### A1. Staging deployed · **YOU** · BLOCKER
- [ ] `https://staging.thegaragedoorhq.com` loads over HTTPS.
- [ ] Sign in works.
- [ ] `/admin/system` shows **Environment: STAGING · Declared**.

Not "the service exists in Railway" — you signed in.

### A2. Production deployed · **YOU** · BLOCKER
- [ ] `https://app.thegaragedoorhq.com` loads over HTTPS.
- [ ] `/admin/system` shows **Environment: PRODUCTION · Declared**.
- [ ] `node scripts/health-check.mjs https://app.thegaragedoorhq.com --expect production`
      exits 0.

That command fails if production is running with local disk, without an email
provider, or without `APP_ENV` — all of which would otherwise look fine.

### A3. A development push cannot deploy production · **YOU** · BLOCKER

The item that stops an ordinary Tuesday from reaching customers.

- [ ] Note production's current release on `/admin/system` ("This build").
- [ ] Merge a harmless, visible change to `main` (a word on the login page).
- [ ] Staging shows it within a few minutes.
- [ ] **Production still shows the old release and the old word**, an hour later.
- [ ] Then promote deliberately: **Actions → Promote to production** → the
      commit → `PROMOTE`. Production picks it up.
- [ ] Railway → `production` environment → **Settings → Source** reads branch
      `production` — not `main`, and above all not a `claude/…` working branch.

### A4. Staging is visually unmistakable · **YOU** · BLOCKER
- [ ] Amber **STAGING** bar across the top of every screen.
- [ ] Browser tab reads `… — STAGING`.
- [ ] Added to a phone home screen, the icon is **amber**, not navy.
- [ ] Production has **none** of these.

*Code side:* DONE — `tests/environment.test.ts`, "badges everything except
production".

### A5. Staging database isolated · **YOU** · BLOCKER
- [ ] Create a customer called `ISOLATION TEST` on staging.
- [ ] Search production for it. **Nothing.**
- [ ] `/admin/system` → Database row → the company counts differ.
- [ ] Railway → the two `DATABASE_URL` variables reference **different**
      database services.

### A6. Production database isolated · **YOU** · BLOCKER
- [ ] Create a customer on production. Search staging. **Nothing.**
- [ ] Nothing in the repository, in CI, or in any script names a production
      host. (*DONE* — `npm run check:secrets`, including every historical commit.)

### A7. Staging cannot email a real customer · **YOU** · BLOCKER
- [ ] On staging, create a customer with an address you control but that is
      **not** on the allowlist or redirect target — a colleague's, say.
- [ ] Send them an estimate.
- [ ] With `STAGING_EMAIL_REDIRECT_TO` set: **you** get it, subject tagged
      `[GARAGE DOOR HQ STAGING]`, naming the intended recipient. The colleague
      gets nothing.
- [ ] With neither variable set: nobody gets anything and the screen says the
      send failed rather than claiming success.

*Code side:* DONE — `tests/environment.test.ts`, "sends nothing at all from an
unconfigured staging deployment". The gate wraps the driver, so no send path
skips it.

---

### A8. The demo company on production behaves · **YOU** · BLOCKER

Only if you are keeping the demo on production. Skip the section entirely if
you are not — and then confirm `ALLOW_DEMO_RESET` and `DEMO_SEED_TOKEN` are
unset there.

- [ ] `DEMO_PASSWORD` on production is **not** the repository's default and is
      12+ characters. (Seeding refuses otherwise, so a successful seed proves
      this — but check the variable anyway.)
- [ ] Sign in as each of the three demo accounts and **change the password**.
      If the demo was seeded before this, those accounts carry a password that
      was published in a public repository.
- [ ] The platform admin account still works after a demo rebuild, with the
      password *you* set rather than the seeded one.
- [ ] `/admin` → the demo company reads as **Complimentary**, not Active, and
      is not counted in the MRR figure.
- [ ] After you have finished seeding: `ALLOW_DEMO_RESET` and `DEMO_SEED_TOKEN`
      are **removed** from the production variables.
- [ ] `/admin/system` → *Demo company access* row reads **Ready / Closed**.
      While either variable is set it reads Wrong, which is the point.
- [ ] Once a real beta company exists: run a demo rebuild, then confirm that
      company's customers, jobs and invoices are all still there.

*Code side:* DONE — `tests/demo-production.test.ts`, fifteen tests. Among them:
a reset with a real company in the same database leaves it untouched; the
platform administrator survives a reset and keeps its own password; a person
who also belongs to a real company is not deleted; a partner who referred a
real company is not deleted; the default password is refused on production;
and the unlock is not opened by a truthy-looking value.

---

## B. Storage and email

### B1. R2 production upload, read and delete · **YOU** · BLOCKER
On **production**:
- [ ] Take a photo on a job from a phone. It appears.
- [ ] Cloudflare → `gdhq-production` → the object is there, under a
      `production/org/…` key.
- [ ] Reload the app. Still renders (it is brokered through
      `/api/files/photos/…`, not a public URL).
- [ ] Paste the R2 object URL into a signed-out browser. **Denied.**
- [ ] Delete the photo in the app. Gone from the bucket.
- [ ] Redeploy production. The remaining photos still render — the test that
      local disk would fail.
- [ ] `gdhq-production` has **object versioning on**.

### B2. Production email actually received · **YOU** · BLOCKER
- [ ] Send yourself an estimate from production, to a **real** mailbox.
- [ ] It arrives. **No** `[STAGING]` tag.
- [ ] From-name is the garage door company, reply-to is their address.
- [ ] The link opens the estimate on `app.thegaragedoorhq.com`.
- [ ] It is in **Inbox**, not spam. If spam: recheck SPF/DKIM (§7 of the setup
      guide) and add DMARC.
- [ ] Repeat for an invoice and a team invitation.

---

## C. Backups

### C1. A backup actually created · **YOU** · BLOCKER
- [ ] Railway → `production-db` → **Backups** → scheduled backups **on**.
- [ ] At least one completed backup is listed, with a timestamp.
- [ ] One independent `pg_dump` exists somewhere that is **not** Railway.
- [ ] `BACKUP_SCHEDULE` set on production to describe what you did.

### C2. A backup actually restored · **YOU** · BLOCKER

The item everyone skips and everyone regrets.

- [ ] Restore into a **new, separate** database (setup guide §5).
- [ ] The row counts match production.
- [ ] Sanity-check a real record — open a job, an estimate, a signature.
- [ ] Delete the scratch database.
- [ ] `BACKUP_LAST_VERIFIED_RESTORE` set to today's date.
- [ ] `/admin/system` → **Backups: Ready**.

It refuses to go green on a schedule alone. *Code side:* DONE —
`tests/system-readiness.test.ts`, "is not satisfied by a schedule alone".

---

## D. Money

### D1. A $39.99 subscription, real production checkout · **YOU** · BLOCKER
- [ ] Sign up a company on **production** (yours is fine).
- [ ] Settings → Billing → Subscribe.
- [ ] Pay with a **real card**. Not a test card — this is live mode.
- [ ] $39.99 appears in your Stripe **live** dashboard.
- [ ] Refund yourself afterwards if you like; the point is that it went
      through.

### D2. The webhook changed the account state · **YOU** · BLOCKER
- [ ] Immediately after D1, the app shows the account **Active** — without you
      reloading, and without a redirect having done it.
- [ ] Stripe → Webhooks → the production endpoint → the delivery is **200**.
- [ ] `/admin/companies/<id>` shows the Stripe subscription id.
- [ ] Then: Stripe → **Resend** that same event. The account stays Active and
      no second subscription appears — idempotency, observed rather than
      assumed.

*Code side:* DONE — `tests/webhooks.test.ts` (17 tests: signature, replay,
concurrency, cross-tenant refusal).

### D3. Connect onboarding completed · **YOU** · BLOCKER
- [ ] Settings → Payments → Connect Stripe.
- [ ] Complete the whole Stripe onboarding with **real** business details.
- [ ] Return to the app: it says connected and ready to accept payments.
- [ ] Stripe → Connect → Accounts: the account is **enabled** for charges and
      payouts.

### D4. One real customer invoice payment, end to end · **YOU** · BLOCKER
- [ ] Complete a job on production so it raises an invoice.
- [ ] Send the customer link to yourself.
- [ ] Open it on a **different device**, signed out.
- [ ] Pay with a **real card**.

### D5. The money reached the company's Stripe account · **YOU** · BLOCKER
- [ ] The charge is on the **connected** account, not the platform account.
- [ ] Payout schedule shows it heading to their bank.
- [ ] Your platform account shows the application fee only, if you take one.

### D6. The invoice is marked paid, correctly · **YOU** · BLOCKER
- [ ] In the app: **Paid**, balance `$0.00`.
- [ ] The amount matches to the cent.
- [ ] Payment method and date recorded.
- [ ] Customer timeline shows the payment as its own event.
- [ ] Money dashboard reflects it.
- [ ] Stripe → resend the `payment_intent.succeeded`. **No second payment.**

*Code side:* DONE — `tests/customer-payments.test.ts` (15 tests: settlement,
double delivery, partial and full refunds, cross-tenant refusal).

---

## E. The field workflow

### E1. Estimate sent and received · **YOU**
- [ ] Build an estimate on production, send it.
- [ ] It arrives at a real mailbox.
- [ ] Opens on a phone, no account needed.
- [ ] Choosing an option and signing works; the PDF downloads.

### E2. Presentation Mode on a technician device · **YOU** · BLOCKER

The one to spend proper time on, with someone else holding the phone.

- [ ] Estimate → **Present to Customer**. Handover screen first.
- [ ] Hand the phone to someone and ask them to *try to get out of it*.
- [ ] Type `app.thegaragedoorhq.com/today` in the address bar → **comes back to
      the presentation**.
- [ ] Same for `/customers`, `/money`, `/settings`, `/admin`.
- [ ] Back gesture → stays inside.
- [ ] No costs, margins, SKUs, stock or technician notes anywhere on screen.
- [ ] The company's branding, not Garage Door HQ's.
- [ ] They cannot get out without your password.
- [ ] You enter it → back on the job.

*Code side:* DONE — `tests/security-presentation.test.ts` (20 tests) and
`npm run adversarial`, which types thirteen application URLs from inside a live
presentation and watches every one bounce, plus clearing the presentation
cookie. 64/64 refused.

### E3. One-option estimate · **YOU**
- [ ] Build an estimate with **exactly one** option.
- [ ] Present it. It reads **"Recommended repair"** with one **Approve This
      Repair** button.
- [ ] It is **not** labelled "GOOD".
- [ ] Nothing asks for a second or third option.

*Code side:* DONE — `tests/estimate-presentation.test.ts`, "never labels a lone
option Good".

### E4. Multi-option estimate · **YOU**
- [ ] Two options → "Choose one of two options", both selectable.
- [ ] Four options → counted honestly, not squeezed into three tiers.
- [ ] A deliberate Good/Better/Best set → tier labels appear.
- [ ] The chosen option is what gets signed and invoiced.

*Code side:* DONE — `tests/security-presentation.test.ts`, "presents one, two,
three or four without complaint".

### E5. Signature · **YOU** · BLOCKER
- [ ] Sign with a **finger on a real touchscreen**, not a mouse.
- [ ] The signature is legible in the PDF.
- [ ] Signer name, date and time are recorded.
- [ ] After signing, the estimate cannot be edited.
- [ ] Change that part's price in the price book — **the signed estimate does
      not move.**

*Code side:* DONE — `tests/security-integrity.test.ts`, "keeps its own numbers
when the price book moves underneath it".

### E6. Job completion · **YOU**
- [ ] Complete a job with parts used.
- [ ] An invoice is raised from the signed option.
- [ ] **Double-tap Complete on a slow connection.** One invoice, one deduction.

*Code side:* DONE — "deducts each part exactly once, even when the request
arrives twice at once" (a genuine concurrency test; this was a real bug).

### E7. Inventory deduction · **YOU**
- [ ] Note the truck count before.
- [ ] Complete a job using two of that part.
- [ ] Count is exactly two lower.
- [ ] The ledger shows the movement with the job against it.
- [ ] Try to use more than is on the truck → refused, nothing written.

### E8. Door Passport history · **YOU**
- [ ] Replace a spring on a door through a completed job.
- [ ] The passport shows the new spring as current.
- [ ] The **old** spring is still there as history.
- [ ] The service visit is on the timeline with its date.

---

## F. Devices

Each of these on **production**, on real hardware. Not a resized desktop window.

### F1. Phone · **YOU** · BLOCKER
- [ ] Sign in, open a job, run an inspection, build an estimate, present, sign.
- [ ] Take a photo with the camera.
- [ ] One-handed: every control reachable with a thumb.
- [ ] In sunlight, outdoors, if you can.

### F2. Tablet · **YOU** · BLOCKER
- [ ] The same walkthrough.
- [ ] Presentation Mode at tablet size — this is the device most companies will
      actually hand over.
- [ ] Signature area is comfortable.
- [ ] Both orientations.

### F3. Desktop · **YOU**
- [ ] Office workflow: schedule, customers, invoices, money, settings.
- [ ] Price book editing.
- [ ] `/admin/system`.

---

## G. Release safety

### G1. Rollback tested or rehearsed · **YOU** · BLOCKER

Rehearse it while nothing is broken, not while customers are waiting.

- [ ] Promote a harmless visible change to production.
- [ ] **Actions → Roll back production** → the previous release tag → `ROLLBACK`.
- [ ] Production goes back; the health check passes.
- [ ] The workflow summary told you which migrations the database still carries.
- [ ] Promote forward again.
- [ ] Also find the manual path once: Railway → production → **Deployments** →
      last good → **Redeploy**. That is what you will reach for at 7pm.

### G2. CI gates actually block · **DONE**
- CI runs typecheck, lint, tenant isolation, authorization, authentication,
  integrity, a production build, migration safety and a dependency audit on
  every push.
- Promotion refuses a commit that is not an ancestor of `main` or whose checks
  did not pass.
- *Verify once yourself:* push a deliberately failing test to a branch and
  watch CI go red.

---

## H. Before you invite anyone

### H1. You have used it for a real job · **YOU** · BLOCKER
- [ ] One complete real job on production: customer → door → inspection →
      estimate → presentation → signature → completion → invoice → payment.
- [ ] Nothing surprised you.

### H2. You can answer "what happened to my data?" · **YOU** · BLOCKER
- [ ] You know where the backups are and have restored one (C2).
- [ ] You know how to roll back (G1).
- [ ] You know how to reach a company's records for support without guessing.

### H3. The companies know what they are joining · **YOU**
- [ ] They know it is a beta.
- [ ] They know how to reach you when something breaks.
- [ ] They are companies whose data you could reconstruct if the worst happened.
- [ ] Start with **two or three**, not ten.

---

## What I can and cannot do

### Already done and verified in this repository

| Item | Proven by |
|---|---|
| Tenant isolation across every org-owned model | `tests/security-cross-tenant.test.ts` (31) |
| Roles and privilege escalation | `tests/security-authorization.test.ts` (14) |
| Login timing, password storage, cookie flags | `tests/security-auth.test.ts` (8) |
| Server-side pricing, quantities, tax, signed snapshots | `tests/security-integrity.test.ts` (13) |
| XSS, SQL, uploads, headers, redirects | `tests/security-web.test.ts` (20) |
| Environment separation and the email gate | `tests/environment.test.ts` (25) |
| Presentation Mode session and lock | `tests/security-presentation.test.ts` (20) |
| System Readiness leaks no values | `tests/system-readiness.test.ts` (12) |
| Webhook signature, replay, idempotency | `tests/webhooks.test.ts` (17) |
| Customer payments and refunds | `tests/customer-payments.test.ts` (15) |
| The whole field workflow, in a browser | `npm run e2e` — 54 steps |
| Two companies attacking each other, in a browser | `npm run adversarial` — 64/64 refused |
| No credential in the working tree or any commit | `npm run check:secrets --history` |
| Zero advisories in production dependencies | `npm audit --omit=dev` |

**564 tests across 43 files.**

### Only you can do these

Every one needs a login, a card, a phone or a real mailbox:

| # | Item |
|---|---|
| A1–A2 | Deploy staging and production |
| A3 | Prove a development push does not reach production |
| A4 | See the staging badge on a real phone |
| A5–A6 | Prove the two databases are separate |
| A7 | Prove staging cannot email a real customer |
| A8 | Change the demo passwords, then close the demo unlock |
| B1 | R2 upload, read, delete, survive a redeploy |
| B2 | Receive production email in a real inbox |
| C1–C2 | Create a backup, and **restore one** |
| D1–D6 | Real subscription, webhook, Connect onboarding, real invoice payment |
| E1–E8 | The field workflow on production |
| F1–F3 | Phone, tablet, desktop on real hardware |
| G1 | Rehearse a rollback |
| H1–H3 | Run a real job; be ready to support people |

### What I will do next, on request

- Fix anything these turn up.
- Add whatever the first companies ask for.
- Take the MEDIUM items from `docs/SECURITY-AUDIT.md` §10 — the
  password-reset timing floor, the vitest upgrade, the organization switcher.

---

## Verdict

**NOT READY FOR OUTSIDE BETA TESTERS.**

Not because anything is broken. Every code-level finding from the audit is
fixed and held down by a test, the application is in good shape, and
Presentation Mode is now a genuinely separate context rather than a hidden
navigation bar.

It is not ready because **25 blockers above have never been observed by
anybody**. The environments are specified but not built. The backups are
scripted but never taken, and never restored. No real card has been charged.
No real email has arrived. Nobody has handed a real phone to a real person.

None of that can be done from inside a repository, and none of it is optional
when the thing being trusted is the record of every job a company does.

Work the **BLOCKER** items. When they are all ticked, this says READY FOR
LIMITED PRIVATE BETA — two or three companies who know they are early — and
nothing about "ready for production" until that has run for a month.
