# FEATURES

What this repo implements, derived from the code.

## The six applications

| Application | Type | Entry point | What it does |
|---|---|---|---|
| `product-extension` | `service` | `/product-extension` | A Product API Extension. Returns `addToCategory` / `removeFromCategory` inside every product create and update. |
| `rules-api` | `service` | `/rules-api` | The Merchant Center's backend: rule CRUD, the field catalog, dry-run preview, and the resumable Process now pass. |
| `category-event` | `event` | `/category-event` | A Change Subscription on categories. Touching a category with rules enqueues a pass for it. |
| `sweep-job` | `job` | `/sweep-job`, `*/5 * * * *` | Drains the sweep queue, and reconciles the whole catalog on `FULL_RECONCILE_MINUTES`. |
| `merchant-center-custom-application` | Custom Application | — | The rule builder: two screens, a list and one rule. |
| `merchant-center-custom-view` | Custom View, `CustomPanel` | `categories.category_details.general` | The same rules as a panel on the category details page. |

Declared in `connect.yaml`. `post-deploy` on `product-extension` and
`category-event` registers the Extension and the Subscription;
`pre-undeploy` removes them.

## The rule model

`common-connect/src/types.ts`.

| Field | Meaning |
|---|---|
| `key` | Custom Object key, and the rule's identity in the API and the UI |
| `name` | What a merchandiser calls it |
| `categoryId` | The category this rule fills |
| `enabled` | A disabled rule is skipped by the engine and the planner |
| `match` | `all` or `any` across the rule's conditions |
| `conditions` | `{ field, operator, value }` |
| `removeWhenNoLongerMatching` | Take the category away again when a product stops matching. Default on. |
| `createdAt` / `updatedAt` | Set by `toRule`, never by the caller |

## Fields a rule can read

Built in — `BUILT_IN` in `common-connect/src/fields.ts`:

| Field | Group | Value kind |
|---|---|---|
| Product name, Slug, Description | Product | `text`, localized |
| Product key | Product | `text` |
| SKU (any variant) | Product | `text`, one value per variant |
| Product type | Product | `text`, matched on key, offered as a picker of the Project's own types |
| Price | Commercial | `number`, major units |
| Created, Last modified | Lifecycle | `date` |
| Category membership | Lifecycle | `category` |

Plus **every attribute in the Project's own Product Types**, read at runtime
by `buildFieldCatalog`, so a new attribute appears in the rule builder
without a redeploy. An attribute name is unique per Project, so the first
definition seen wins. Its value kind follows its type — `valueKindOf`:

| Attribute type | Compares as |
|---|---|
| `number`, `money` | `number` |
| `boolean` | `boolean` |
| `date`, `datetime`, `time` | `date` |
| `set` | whatever its `elementType` is, each member contributing a value |
| `text`, `ltext`, `enum`, `lenum`, `reference`, `nested` | `text` |

`enum` and `lenum` carry their values as fixed choices, matched on either key
or label.

## Operators

`OPERATORS_BY_VALUE_KIND` — the value kind decides what a merchandiser is
offered.

| Value kind | Operators |
|---|---|
| `text` | `equals`, `notEquals`, `startsWith`, `endsWith`, `contains`, `notContains`, `matchesRegex`, `isEmpty`, `isNotEmpty` |
| `number` | `equals`, `notEquals`, `greaterThan`, `greaterOrEqual`, `lessThan`, `lessOrEqual` |
| `boolean` | `isTrue`, `isFalse` |
| `date` | `withinLastHours`, `withinLastDays`, `before`, `after` |
| `category` | `inCategory`, `notInCategory` |

`isEmpty`, `isNotEmpty`, `isTrue` and `isFalse` take no value.
`notEquals`, `notContains` and `notInCategory` are evaluated as the positive
form against every value the field yields and then inverted — so "SKU does
not contain X" means no variant's SKU contains it.

## The matching engine

`common-connect/src/engine.ts` — pure and synchronous. It reads a Product
Projection already in hand and makes no requests, which is what lets the same
code decide one product's fate inside an Extension's budget and the whole
catalog's inside a sweep.

- `readField` returns **every** value a field yields for one product: a
  localized field yields each locale unless the condition names one, a SKU
  field yields one per variant, a set attribute yields each member.
- A condition holds when any of those values satisfies the operator.
- `evaluateRule` combines conditions by `match`.
- Prices compare in major units, converted with the Project's fraction digits
  per currency; a price condition that names no currency uses the Project's
  first.
- `matchesRegex` keeps the case it was written in, and a malformed pattern
  fails the condition rather than throwing.

## What gets written

`common-connect/src/reconcile.ts`.

- `planProduct` computes the plan from the product's **live** category list,
  so it is idempotent: a redelivered notification, an overlapping sweep and a
  Process now that collides with the scheduled job all produce an empty plan.
- **Only categories named by the rules in hand are touched.** Every other
  category on the product, however it got there, is left exactly as it is.
- Several rules may fill one category; the product belongs if **any** of them
  matches. The category is removed only when no matching rule remains and at
  least one of that category's rules has `removeWhenNoLongerMatching`.
- `isNoop` short-circuits a plan with nothing in it, so no version is bumped.

Which projection — `stagedFlagFor`:

| Product state | Written to |
|---|---|
| Published, no staged changes | current and staged together |
| Published, staged changes pending | staged only |
| Not published | staged only |

A rule always *reads* the staged projection, so a product that has never been
published is still reachable.

## How a product gets categorized

**Synchronously, on save.** `product-extension` runs inside the create or
update and returns its actions alongside the caller's, so there is one
version bump and no window in which the product is in the wrong place. It
applies to every client that writes a product, the Merchant Center included.

**As a catalog pass, when a rule changes.** Three things start one:

| Trigger | Path |
|---|---|
| **Process now**, in either Merchant Center surface | `POST /rules/:key/run`, `/categories/:id/run` or `/run` — paged, resumable, stoppable |
| Saving or deleting a rule | enqueues its category |
| Touching a category that has rules | the Change Subscription enqueues it |

`sweep-job` drains the queue every five minutes and runs a full reconcile on
`FULL_RECONCILE_MINUTES`, which is the backstop for a rule written straight
through the API where nothing signalled the change.

## The rules API

`rules-api/src/routes/rules.route.ts`. Every route is behind a Merchant
Center session plus a permission check.

| Route | Permission |
|---|---|
| `GET /meta` | view |
| `GET /rules`, `GET /rules/:key` | view |
| `PUT /rules/:key`, `POST /rules/:key` | manage |
| `DELETE /rules/:key` | manage |
| `POST /rules/:key/run`, `POST /categories/:id/run`, `POST /run` | manage |
| `GET /runs/:scope/:target` | view |

- An upsert answers to both `PUT` and `POST`, because the Merchant Center
  gateway's `forwardTo` helpers cover `GET`, `POST`, `HEAD` and `DELETE` but
  not `PUT`.
- A dry run writes nothing but still walks the catalog, so it needs `manage`
  like any other run.
- `permission.middleware.ts` refuses a request that carries no permissions
  claim rather than waving it through — a missing claim is indistinguishable
  from a caller hoping it is not checked. A user who may manage may also
  view.
- The browser never reaches the API directly: both surfaces call through the
  Merchant Center API Gateway's `/proxy/forward-to`, which authenticates the
  user, confirms their access to the Project, and addresses the token to this
  application's origin.

## Where the data lives

Custom Objects, so rules survive an undeploy and are visible in the Merchant
Center under Settings — `common-connect/src/store.ts`:

| Container | Holds |
|---|---|
| `auto-categorization-rules` | One object per rule, keyed by rule key |
| `auto-categorization-runs` | The last pass per rule, per category and overall, with its cursor if unfinished |
| `auto-categorization-system` | `sweep-queue`, `job-lock`, `last-full-reconcile` |

- `listRules` pages by keyset on `id`, which is stable while rules are being
  edited and never meets the offset ceiling.
- Every write carries the document's version, so two editors racing produce a
  409 rather than a silent overwrite.
- `acquireJobLock` / `releaseJobLock` give a run a lease of
  `JOB_LOCK_TTL_MINUTES`, longer than the platform's 30-minute application
  timeout, so a killed run's lease expires on its own rather than wedging the
  schedule.

## Validation

`common-connect/src/validate.ts` — one validator, used by the API and by the
Merchant Center, so the rule builder cannot offer something the API will
reject. It checks the key's shape, a target category, at least one condition,
that each condition's operator belongs to its field's value kind, that a
value is present unless the operator is nullary, and that an `attribute`
field names an attribute.

## Failure behaviour

- **The Extension fails open.** Any error returns no actions and lets the
  product write through, because an Extension that errors fails the API call
  it was extending — and that would stop every product save in the Project.
  The hourly reconcile picks up what a skipped call missed.
- **`category-event` fails closed.** A transient failure returns 503 and the
  notification is redelivered; a permanently unprocessable one is
  acknowledged with 200 and logged with its correlation key
  (`category:<id>:<version>`), because redelivery cannot help and the broker
  would otherwise retry for seven days.
- **A run that stops mid-catalog leaves a cursor** in
  `auto-categorization-runs`; the next pass resumes there.

## The Merchant Center surfaces

Both are React, built with `mc-scripts`, talking to `rules-api` through the
gateway. Every deploy-time value in their config is an `${env:...}`
placeholder filled from `connect.yaml`.

- **Custom Application** — a rules list and a rule editor
  (`routes.tsx`), with a category picker, a product-type picker, a condition
  row per condition, and a run panel reporting a pass as it goes. The field
  catalog is loaded once and handed to both screens, so they cannot disagree
  about what a field is called.
- **Custom View** — `CustomPanel`, `LARGE`, located on
  `categories.category_details.general`: the rules for the category in front
  of you, plus the same run panel. It declares a named permission group
  rather than using the default one, so a rules API that checks
  `canManageAutoCategorization` is not satisfied by any other
  customization's `canManage`.

## Scopes

Generated by the platform at install — `inheritAs.apiClient` in
`connect.yaml`:

`manage_products` · `view_categories` · `view_product_types` ·
`view_project_settings` · `manage_key_value_documents` ·
`manage_extensions` · `manage_subscriptions`

No admin client anywhere. `view_project_settings` is the one every
application degrades gracefully without.

## Shared code

`common-connect/src` is **vendored** into each backend application under
`src/shared` by `tools/sync-shared.mjs` (`npm run sync:shared`). The copies
are committed and `npm run check:shared` fails on drift. Vendored rather than
a `file:` dependency because Connect builds an application from its own
folder, where `../common-connect` does not exist.

## Checks

| Command | What it runs |
|---|---|
| `npm run install:all` | Every package |
| `npm run predeploy` | Build, `check:shared`, unit tests, lint |
| `npm run preflight` | `predeploy`, `npm audit --omit=dev` per application, and an isolated build of each |
| `npm run simulate:connect` | Builds each application from its own folder with nothing above it, which is how Connect builds |
| `npm run build:mc` | The two Merchant Center bundles. Needs the deploy-time env vars Connect supplies — see the README. |

No CI. `predeploy` is the gate.

`tools/` also holds scripts that drive a real Project — a live rule pass, a
dry run of many rule shapes at once, an extension probe, a rule-shape matrix
and a deployment verifier. Nothing in `connect.yaml` references the folder,
so it is never deployed.
