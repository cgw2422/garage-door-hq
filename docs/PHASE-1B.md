# Phase 1b — what shipped

Phase 1a produced a working field workflow that one person could use if someone
had already set their data up in the database. Phase 1b is the difference
between that and something a real garage door company can open on a Monday and
start using: editing their own prices, adding their own people, sending a
customer a document, and seeing the calendar.

Everything in Phase 1a's architecture is intact. Nothing about versioned spring
systems, immutable signed estimates, atomic job completion, or the ledger was
refactored to make this phase fit.

---

## 1. Price book management

A full editing surface at `/settings/price-book`: search, category filters,
archive and restore, duplicate, and packages with ordered lines.

- **Money is still integer cents.** The form takes dollars and converts once.
- **Archiving never deletes.** An archived item keeps every estimate line,
  invoice line and ledger row that references it. Restoring brings it back.
- **Duplicating a spring keeps its `springSpec`**, because the physical
  measurements are the point of the row.
- **Editing a price does not reprice anything.** Estimate and invoice lines
  carry their own `unitPriceCents`, copied at the moment they were added. There
  is a test that adds a line, multiplies the catalog price by five, and asserts
  the line is unchanged.
- The starter catalog is kept and clearly labelled: *"Starter prices are
  examples, not recommendations"*, on the price book screen and again at the end
  of onboarding. Nothing claims they are market rates.

## 2. Team management and invitations

`/settings/team` invites people, changes roles, assigns trucks and deactivates
members.

- **No email is sent, and the screen says so** in a banner that cannot be
  missed. The invitation link is shown for the owner to send however they
  normally reach that person. `lastSentAt` and `sendCount` are recorded so the
  delivery layer has somewhere to plug in.
- Tokens are 32 random bytes, base64url; only the SHA-256 is stored. Re-sending
  issues a new token and revokes the old one.
- Role boundaries are enforced server-side and tested: nobody changes their own
  role or deactivates themselves, an admin cannot change or create an owner,
  and the last owner cannot be removed or demoted.

## 3. Schedule

`/schedule` has a day and a week view, drag-free rescheduling, and assignment.

- **The scope comes from the role, not the request.** A technician sees their
  own board; an owner, admin or office sees everyone's. Passing
  `?technicianId=` as a technician does not widen it — there is a test.
- Times are wall-clock times in the company's timezone, converted once at the
  boundary. A job at 19:00 Pacific groups under the 12th, not the 13th.
- Rescheduling a draft with a time turns it into a booking. A completed job
  cannot be rescheduled.

## 4. PDFs

Estimate and invoice PDFs at `/api/documents/{estimates,invoices}/[id]/pdf`,
rendered with `@react-pdf/renderer` (standard fonts only — no webfont fetch at
render time).

- **A signed estimate renders from the version its signature points at**, never
  from current rows. The test doubles the catalog price *and* corrupts the live
  option row to `totalCents: 1`; the PDF total does not move.
- The letterhead is frozen too. The document is a record of what the customer
  was shown, down to the company name on it.
- A never-sent estimate is marked as a draft on its face.
- The logo and signature image are embedded as data URIs read through the
  storage broker, so the PDF contains no URL that could be fetched later.

## 5. Customer-facing links

`/p/e/[token]` and `/p/i/[token]` serve one document to someone with no
account.

- **Opaque tokens.** 32 random bytes; only the hash is stored. No organization
  id, no document id, nothing sequential.
- Unknown, malformed, expired and revoked tokens all resolve to `null` by the
  same path, so a guesser learns nothing from the difference.
- Issuing a new link revokes the previous one in the same transaction.
- The customer payload is built with an explicit `select`; internal fields —
  cost, margin, ids — are not in it. There is a test.
- The customer can choose an option and sign. Signing through a link runs the
  same `signEstimate` code as the technician's phone, with `createdById: null`,
  because `TenantContext` was narrowed in Phase 1a specifically so this would
  not need a second implementation.
- Views are counted. The link is shown once and not again.

## 6. Company settings

`/settings` covers the company profile, logo, tax rate, payment terms,
estimate and invoice terms, the review destination, labor costing, and document
numbering.

- **A settings change applies to the next document, never an existing one.**
  Terms and tax are copied onto each estimate and invoice at creation. Tests
  change the rate and the terms after signing and assert the signed estimate,
  the finalized invoice, and both PDFs are untouched.
- Labor costing stays off by default, so nobody is pushed into inventing an
  hourly rate for themselves.
- **Numbering prefixes are deliberately not editable.** Doing it consistently
  requires storing the rendered number on each document, so a later prefix
  change cannot appear to renumber past invoices — a schema change worth making
  on its own. The next-number control ships; the column exists and is unused,
  and the screen says so.

## 7. Inventory management

Receive, adjust, transfer and set minimums, at `/inventory`.

- **Every quantity change goes through the ledger.** There is no "set the
  quantity to N" path anywhere in `src/server/inventory/management.ts`. A count
  that disagrees with the shelf is corrected by posting the difference with a
  reason. The only value set directly is the minimum, which is a policy.
- **Direction comes from the reason, not from a typed sign**, so "damaged 3"
  can never add three.
- A transfer is one row carrying both sides, so the two halves cannot diverge.
- Refused moves write nothing: a transfer larger than what is on hand leaves the
  ledger exactly as it was.

## 8. Photos

Deletion, captions, reordering, and an orphan sweep.

- Uploads are sniffed by **magic bytes** on completion, not by extension or
  declared `Content-Type`. SVG is refused outright as a script container. A
  file that fails the check is marked `FAILED` and the object is deleted.
- `src/server/media/cleanup.ts` documents the object lifecycle and why orphans
  are possible at all, and sweeps abandoned uploads — object first, then row,
  so a failure leaves a row pointing at nothing rather than an object nobody
  knows about.
- Reads stay brokered: the row is resolved through the tenant client and only
  then is storage asked for the key it found. No permanent public URL is ever
  issued.

## 9. Security hardening

- **Rate limiting in Postgres** (`src/lib/rate-limit.ts`), not memory, so a
  container restart does not hand out a fresh budget and two instances do not
  each grant the full one. One `INSERT … ON CONFLICT DO UPDATE RETURNING`, so a
  burst cannot all read a stale count. Login is limited by address *and* by
  email; signup, invitations, portal tokens, uploads and sensitive mutations
  each have their own scope.
- **A static authorization scan** (`tests/authorization.test.ts`) walks every
  server action and route handler and fails if one does not open with an
  authorization check. Deliberately public endpoints are listed individually
  with a stated reason, so adding one is a decision.
- **The tenant-model list is verified against the schema** by a test. It found
  three models that had drifted out of it.
- **The `Organization` row is now scoped by `id`**, closing a gap where a
  mis-scoped update could reach another company's profile.
- **Impersonation was not built.** See below.

## 10. Platform admin

`/admin` for platform staff: companies, subscription states, trials, and
complimentary access. Reads cross tenants deliberately and take an
already-authorized user rather than a session, since platform staff belong to
no company.

**No impersonation.** The brief said it would rather postpone impersonation
than introduce an unnecessary security risk, and that is the right call: doing
it safely needs an audited, time-boxed, consent-recorded mechanism, and doing
it unsafely is a single function that reads any company's data.

---

## Architectural changes

Phase 1b added four things to the foundation and changed one.

1. **`RateLimit`** — a new table, `@@id([key, windowStart])`, swept
   opportunistically.
2. **`src/lib/roles.ts` and `src/lib/price-book-categories.ts`** — client-safe
   constants split out of the server services. Client components importing
   labels from a service pulled Prisma and `node:crypto` into the browser
   bundle; this is the fix, and the services re-export from them so there is
   still one definition.
3. **`SELF_SCOPED_MODELS` in `src/lib/tenancy.ts`** — the `Organization` row is
   keyed by `id`, so it is scoped on that column instead of being skipped.
4. **Explicit timezone props on three client components.** They were formatting
   dates with `toLocaleDateString()`, which resolves differently on the server
   and in the browser; React was discarding the server-rendered markup
   (hydration error #418) on the team, estimate and invoice screens. They now
   format against the company's timezone on both sides.

Nothing else in the Phase 1a architecture moved.

---

## Postgres RLS

Evaluated and declined for this phase, with the reasoning and the conditions
that would change the answer written up in [RLS-EVALUATION.md](./RLS-EVALUATION.md).

---

## Still not production-ready

- **Nothing is delivered.** No email, no SMS. Invitations, customer links and
  review requests are all created and shown for a person to send by hand. This
  is the single largest gap.
- **No real payments.** Manual recording only.
- **No password reset.** The rate-limit scope exists; the flow does not.
- **No subscription enforcement.** Trials expire in the data; nothing locks an
  account when they do.
- **Numbering prefixes** are stored and unused, as described above.
- **No offline support.** A dropped connection mid-inspection loses a half-typed
  note.
- **Voice notes** remain modelled and unreachable.
- **Spring sizing is still refused**, by design. The calculator matches measured
  springs against real inventory and says so.
