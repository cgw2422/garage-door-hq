# Postgres Row-Level Security: evaluation and decision

**Decision: not adopting RLS in Phase 1b. Revisit before the first customer-run
SQL access, before any read replica used by a reporting tool, and before any
third party is given a database role.**

This document exists because "add RLS" is a reasonable thing to ask of a
multi-tenant product and deserves a real answer rather than a checkbox either
way.

## What protects tenant data today

Three layers, in order of how early they stop a mistake:

1. **The organization id never comes from the request.** It is resolved from
   the signed-in user's membership row on every request (`src/lib/session.ts`).
   No route, form field, or body can name a different company. This is the
   control that matters most, and RLS would not change it.

2. **A tenant-scoped Prisma client.** `tenantDb(organizationId)`
   (`src/lib/tenancy.ts`) is a Prisma extension that injects
   `organizationId` into the `where` of every read and write and into the
   `data` of every create, for every model that carries the column. The
   `Organization` row itself is keyed by `id` and is scoped on that column
   instead. A query that forgets to scope itself still cannot see another
   company's rows, and a forged `organizationId` in a create payload is
   overwritten rather than honoured.

3. **A test that keeps the list honest.** `tests/tenancy.test.ts` reads
   `prisma/schema.prisma`, finds every model carrying `organizationId`, and
   fails if any of them is missing from the scoped set. Writing the list by
   hand is the weak point of approach 2; this closes it. It found three models
   that had drifted (`ReviewDestination`, `InspectionRemedy`, `NumberSequence`)
   the first time it ran.

Child rows with no `organizationId` of their own — estimate items, inspection
items, springs, package lines — are reachable only through a scoped parent.
That is deliberate: a second denormalized tenant column on every child is a
second thing that can drift.

## What RLS would add

RLS moves enforcement into the database, so a query that reaches Postgres
without the filter returns nothing rather than everything. Its real value is
against classes of mistake the application layer cannot see:

- Raw SQL that bypasses Prisma.
- A future non-Next.js consumer — a worker, a reporting job, an admin script.
- A compromised application process, where the database is the last boundary.

## What it would cost here

- **Connection-level session state.** RLS needs `SET LOCAL app.organization_id`
  on the same connection as the query, inside the same transaction. Prisma's
  pooled connections do not give a reliable place to do this outside an
  interactive transaction, so every query would have to run inside
  `$transaction` with a preamble, or go through a `$queryRaw` wrapper. That
  changes the shape of nearly every data access in the app and adds a round
  trip to reads that are currently one statement.

- **It fights the parts of the design that intentionally cross tenants.**
  Signup, login, the platform admin console, and the customer portal token
  lookup all read across organizations by design, from a caller that has no
  organization. Each would need a `BYPASSRLS` role or a policy exception, and
  every exception is a place the policy can be got wrong quietly.

- **The portal has no user at all.** A customer opening a signed link is
  authenticated by an opaque token, not a session. The organization is derived
  *from* the token. An RLS policy keyed on a session GUC would have to be set
  from a value the request supplied — which is exactly the trust relationship
  RLS is supposed to remove.

- **Migrations become two artefacts.** Every new table needs a policy as well
  as a schema change, and a forgotten policy is a silent hole rather than a
  loud error. The schema-versus-scoping test above gives the same protection
  for the current design, in CI, with no production cost.

The brief said not to implement RLS just to check a box if it fights the
existing architecture. It does fight it, in the specific way that matters: the
application would keep every control it has today and gain a second mechanism
that is hard to verify and easy to get subtly wrong.

## What would change the answer

Any of these makes RLS worth the cost, and the first two are likely within a
year:

- **Direct SQL access for anyone** — a customer-facing query tool, a BI
  connector, an analyst with a read-only role. The application layer is not in
  the path at all, so it protects nothing.
- **A second service reading the same database** — a worker, a webhook
  consumer, an export job written outside this codebase.
- **A read replica pointed at a reporting product.**
- **Regulatory or contractual pressure** to show defence at the storage layer.

## What was done instead, this phase

- The tenant-model list is now verified against the schema by a test, so it
  cannot silently fall behind (this found three unscoped models).
- The `Organization` row is scoped by `id`, closing a gap where a mis-scoped
  `organization.update({ where: { id } })` could reach another company's
  profile. Creating an organization through a tenant client now throws.
- Every server action and route handler is checked by a static test
  (`tests/authorization.test.ts`) for an authorization gate, with deliberately
  public endpoints listed one by one with a stated reason.
- Rate limiting is enforced in Postgres rather than memory, so it survives a
  restart and is shared across instances.

None of that is a substitute for RLS in the scenarios listed above. It is a
better use of the same effort for the architecture as it stands.
