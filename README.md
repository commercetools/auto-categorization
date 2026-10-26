# Auto-categorization

Categories that fill themselves. A merchandiser writes a rule — *title
starts with XYZ*, *SKU starts with ABC*, *created in the last 30 days* —
and the products that match belong in the category, now and as the catalog
changes.

> **commercetools-labs reference code.** Freely available under the MIT license, shared as-is
> and not supported by commercetools. See [SUPPORT.md](SUPPORT.md) and [LICENSE](LICENSE).
> Before you put a rule on a category a merchandiser filled by hand, take a look at what the rule
> does to it in [SUPPORT.md](SUPPORT.md#before-you-install-this-in-a-production-project).

A commercetools [Connect](https://docs.commercetools.com/connect/overview)
connector. Six applications in one repository:

| Application | Type | What it does |
|---|---|---|
| `product-extension` | `service` | A [Product API Extension](https://docs.commercetools.com/api/projects/api-extensions). commercetools calls it inside every product create and update, and applies the categories it returns to that same write. |
| `rules-api` | `service` | The Merchant Center's backend: rule CRUD, the field catalog, dry-run preview, and the Process now pass. |
| `category-event` | `event` | A Change Subscription on categories. Touching a category with rules queues a catalog pass for it. |
| `sweep-job` | `job` | Drains the sweep queue every five minutes, and reconciles the whole catalog hourly. |
| `merchant-center-custom-application` | Custom Application | The rule builder: every rule in the Project, on its own page. |
| `merchant-center-custom-view` | Custom View | The same rules as a panel on the category details page. |

Shared code — the rule model, the matching engine, the rule store and the
catalog sweep — lives in `common-connect/src` and is **vendored** into each
backend application under `src/shared` by `npm run sync:shared`. The copies
are committed, and `npm run check:shared` fails if they drift.

Vendored rather than linked as a `file:` dependency, because Connect builds
an application from its own folder: `../common-connect` is not reachable
there at install time or at build time, so the dependency cannot resolve and
`npm ci` fails. `npm run simulate:connect` reproduces those conditions
locally in about a minute.

## The one thing to understand

**A category with rules has computed membership.** Products that match
belong in it; products that stop matching leave it. That is what makes the
result predictable — read a rule and you know what the category contains.

Two consequences worth stating out loud:

- A rule with `removeWhenNoLongerMatching` on (the default) will take its
  category away from a product that no longer qualifies, including a
  product somebody put there by hand. Turn it off for a rule that should
  only ever add.
- Categories no rule names are never touched. A product can sit in ten
  categories, one of them rule-driven, and the other nine are left exactly
  as they are.

## How a product gets categorized

**When it is saved — synchronously.** The Product API Extension runs inside
the create or update, after the caller's own actions and before anything is
persisted, and returns `addToCategory` / `removeFromCategory` alongside
them. One version bump, and the product is never briefly in the wrong
place. This covers the Merchant Center, the storefront, an importer, and
anything else that writes a product, because an Extension applies to every
client.

**When a rule changes — as a catalog pass.** Nothing about writing a rule
touches the products it will claim, so they have to be walked. Three things
start that pass:

- **Process now**, in either Merchant Center surface. Runs immediately,
  reports what it changed as it goes, and can be stopped.
- **Saving or deleting a rule**, which queues its category automatically.
- **Touching a category that has rules**, which the Change Subscription
  picks up and queues.

The queue is drained by `sweep-job` on its schedule. It also reconciles the
whole catalog hourly, which is the backstop for a rule written straight
through the API where nothing signalled the change.

### Which projection gets written

A rule reads the **staged** projection, so a product that has never been
published is still reachable — "everything added this week" has to mean
everything. What gets written follows what the merchandiser was already
doing:

| Product state | Written to |
|---|---|
| Published, no staged changes | current and staged together |
| Published, staged changes pending | staged only |
| Not published | staged only |

So the storefront sees a rule's assignment without the connector publishing
anything, and a half-finished edit is never published early.

## What a rule can read

Built in: product name, slug, description, key, SKU (any variant), product
type, price, created, last modified, and category membership.

Plus **every attribute in the Project's own Product Types**, discovered at
runtime. Adding an attribute in the Merchant Center puts it in the rule
builder without a redeploy. Sets contribute each member, enums match on
either key or label, and money attributes compare in major units.

Operators follow the field: text gets *starts with*, *contains*, *matches
the pattern* and the rest; numbers get comparisons; dates get *is within
the last N days* and *is before / after*; booleans get *is yes / is no*.
A rule combines its conditions with **all** or **any**.

## Configuration

Secrets are in `securedConfiguration` and never echoed back. Everything
else is `standardConfiguration` with a default that works.

### `product-extension`

| Key | Required | Default | Notes |
|---|---|---|---|
| `CTP_REGION` | yes | `us-central1.gcp` | |
| `EXTENSION_AUTH_SECRET` | yes (secured) | — | A random string of at least 24 characters. The Extension is registered to present it; the endpoint refuses anything that does not. |
| `RULE_CACHE_SECONDS` | no | `10` | How long a read of the rules is reused. Keeps a bulk import from turning one Custom Object query per product into the thing that blows the time budget. `0` reads every time. |
| `EXTENSION_TIMEOUT_MS` | no | `2000` | What commercetools waits before giving up. 2000 is the platform default, 10000 the self-service maximum. |

### `rules-api`

| Key | Required | Default | Notes |
|---|---|---|---|
| `CTP_REGION` | yes | `us-central1.gcp` | |
| `CLOUD_IDENTIFIER` | yes | `gcp-us` | Merchant Center API region; the issuer of the session token this API verifies. |
| `PUBLIC_API_URL` | no | `CONNECT_SERVICE_URL` | Only for reaching the API somewhere other than its Connect URL, such as a tunnel. |
| `VIEW_PERMISSION` / `MANAGE_PERMISSION` | no | `canViewAutoCategorization` / `canManageAutoCategorization` | The permission names this API checks a Merchant Center session against. The defaults match the entry point path `auto-categorization` and the Custom View's permission group; change them only together with both — see [Permission names](#permission-names). |
| `SWEEP_PAGE_SIZE` | no | `100` | |
| `SWEEP_MAX_PAGES` / `SWEEP_BUDGET_SECONDS` | no | `10` / `20` | How much catalog one Process now request walks before handing a cursor back to the browser. |

### `sweep-job`

| Key | Required | Default | Notes |
|---|---|---|---|
| `CTP_REGION` | yes | `us-central1.gcp` | |
| `SWEEP_PAGE_SIZE` | no | `100` | |
| `SWEEP_BUDGET_MINUTES` | no | `25` | The application is stopped at 30, so this leaves room to checkpoint. |
| `FULL_RECONCILE_MINUTES` | no | `60` | `0` switches the periodic full pass off. |
| `JOB_LOCK_TTL_MINUTES` | no | `35` | Longer than the 30-minute timeout, so a killed run's lease expires rather than wedging the schedule. |

### Merchant Center surfaces

`CUSTOM_APPLICATION_ID` / `CUSTOM_VIEW_ID` and `ENTRY_POINT_URI_PATH` come
from registration. `CLOUD_IDENTIFIER` must match the Project's region.
`RULES_API_URL` is the `rules-api` application's URL in the same
deployment — Connect assigns it, so it is set with a redeploy after the
first deploy. `APPLICATION_URL` is supplied by Connect; do not declare it.

### Permission names

`rules-api` compares the permissions the gateway forwards against
`VIEW_PERMISSION` and `MANAGE_PERMISSION`, exactly. Both surfaces have to
produce those same two names, and they get them from different places:

| Surface | Names come from | Yields |
|---|---|---|
| Custom Application | its entry point path | `canViewAutoCategorization` / `canManageAutoCategorization` |
| Custom View | the named permission group in `custom-view-config.mjs` | `canViewAutoCategorization` / `canManageAutoCategorization` |

So **the entry point path is `auto-categorization`** — the path whose
permission names match the Custom View's group and the API's defaults, which
is what lets one check on the API cover both surfaces. Register it with that
path; `ENTRY_POINT_URI_PATH` already defaults to it, and the path cannot be
changed after registration.

Change it and three things move together: the registered path,
`ENTRY_POINT_URI_PATH`, and the two permission keys on `rules-api` — strip
the dashes from the path, upper-case each word, and prefix `canView` and
`canManage`. Leave any one of them behind and every Merchant Center request
is refused with 403. The Custom View's group name has to follow too, or the
panel breaks while the application works.

### Scopes

The platform generates an API client at install with exactly these:

`manage_products` · `view_categories` · `view_product_types` ·
`view_project_settings` · `manage_key_value_documents` ·
`manage_extensions` · `manage_subscriptions`

No admin client, anywhere.

## When something is down

**The Product Extension fails open.** Any error — the rules unreadable,
commercetools slow, a bug — returns no actions and lets the product write
through. An Extension that errors fails the API call it was extending, so a
fault here would stop every product save in the Project, the Merchant
Center's included. A rule that does not fire leaves a product in the wrong
category until the next sweep, which the hourly reconcile will fix. That is
recoverable; a catalog nobody can edit is not.

**The `category-event` handler fails closed, deliberately.** A transient
failure returns 503 and the notification is redelivered. A permanently
unprocessable one is acknowledged with 200 and logged, because redelivery
cannot help and the broker would otherwise retry it for seven days.

**Everything is idempotent by construction.** A plan is computed from the
product's live category list, so a redelivered message, an overlapping
sweep, or a Process now that collides with the scheduled job all recompute
an empty plan and write nothing.

## Where the data lives

Custom Objects, so rules survive an undeploy and are visible in the
Merchant Center under Settings:

| Container | Holds |
|---|---|
| `auto-categorization-rules` | One object per rule, keyed by rule key. |
| `auto-categorization-runs` | The last pass per rule, per category and overall, including its cursor if unfinished. |
| `auto-categorization-system` | `sweep-queue`, `job-lock`, `last-full-reconcile`. |

## Install

1. **Register the Custom Application and the Custom View** in
   Organizations → Custom Applications / Custom Views, with a placeholder
   URL, and note the IDs. Give the Custom Application the entry point path
   `auto-categorization` — it cannot be changed after registration, and it
   is the path whose permission names both surfaces and the API agree on.
   See [Permission names](#permission-names) before choosing another.
2. **Stage, publish and deploy** in the Project's region:
   ```bash
   commercetools connect connectorstaged create --repository-url <url> --repository-tag <tag> --creator-email <email> --name auto-categorization
   commercetools connect connectorstaged publish --key <connector-key>
   commercetools connect deployment create --connector-key <connector-key> --region <region> --type preview
   ```
   Supply `EXTENSION_AUTH_SECRET`, `CLOUD_IDENTIFIER`, the two Merchant
   Center IDs, and a placeholder `RULES_API_URL`.
3. **Read the deployment's application URLs**, then redeploy with the real
   one:
   ```bash
   commercetools connect deployment describe --key <deployment-key>
   commercetools connect deployment redeploy --key <deployment-key> --configuration RULES_API_URL=<rules-api url>
   ```
4. **Update the Merchant Center registrations** with the deployed URLs,
   replacing the placeholders.
5. **Confirm the Extension and the Subscription really registered.** A
   failing post-deploy script does not reliably fail the deployment, so
   query for them:
   ```bash
   commercetools connect deployment logs --key <deployment-key> --application product-extension
   ```
   and check `GET /{projectKey}/extensions` for
   `auto-categorization-product-extension` and
   `GET /{projectKey}/subscriptions` for
   `auto-categorization-category-changes`.

Undeploy removes both. Rules and run history stay, so reinstalling picks up
where it left off.

## Running the checks

```bash
npm run install:all
npm run predeploy
```

Build, then the shared-code drift check, then 183 tests across the five
backend packages, then lint. `npm run typecheck` additionally covers the two
Merchant Center packages.

Their bundles build separately, and `mc-scripts` resolves the
`${env:...}` placeholders in their config at build time — Connect supplies
these from `connect.yaml`, so building by hand means supplying them yourself:

```bash
ENTRY_POINT_URI_PATH=auto-categorization CLOUD_IDENTIFIER=gcp-us \
CUSTOM_APPLICATION_ID=… CUSTOM_VIEW_ID=… \
APPLICATION_URL=https://example.com RULES_API_URL=https://example.com \
npm run build:mc
```

There is no CI workflow. `predeploy` is the gate.

Before staging a new tag, run the whole pre-flight — it is the three
things Connect's validation pipeline checks, in about two minutes rather
than the ten each round trip through the platform costs:

```bash
npm run preflight
```

That is `predeploy`, plus `npm audit --omit=dev` on every application, plus
a build of each application in isolation. Connect's own report gives step
titles only (`Build connector failed`); the log text behind it is reachable
only through the Merchant Center's Connect UI, under Manage connectors →
the connector → Preview Report → View more details.

Connect runs a dependency scan and fails on any high-severity advisory, so
every application keeps a clean production tree.

Three things keep it that way, and are worth knowing before adding a
dependency. Logging is thirty lines of `JSON.stringify` rather than a
logging library, because the obvious one pulls in winston and lodash.
`rules-api` pins Express through an override scoped to
`@commercetools-backend/express`, which would otherwise bring an older
Express along with it — the override is deliberately *not* global, because
the other applications run Express 5 and a global pin would hand their
router a `path-to-regexp` that cannot parse their routes. And the Merchant
Center packages keep their test and lint tooling in `devDependencies`,
where the starter puts some of it under `dependencies`.

`tools/` holds two scripts for driving a real Project — a live rule pass
and a dry run of many rule shapes at once. Nothing in `connect.yaml`
references that folder, so it is never deployed.

```bash
tools/run-live-check.sh <path-to-.env> TARGET_CATEGORY_KEY=new-arrivals RULE_DAYS=30
SCRIPT=rule-shapes.mjs tools/run-live-check.sh <path-to-.env> SCRIPT=rule-shapes.mjs
```

## Poison messages and replay

A category notification that cannot be processed is acknowledged and
logged with its correlation key (`category:<id>:<version>`); it is not
retried, because the same notification will fail the same way. Nothing is
lost: the hourly full reconcile re-applies every rule across the catalog,
so a dropped notification costs at most one interval.

To replay by hand, touch the category (any update) or press **Process now**
on the category panel. To replay everything, delete
`auto-categorization-system/last-full-reconcile` and the next scheduled run
does a full pass.

A run that keeps failing mid-catalog leaves its cursor in
`auto-categorization-runs`; delete that object to make the next pass start
from the beginning.

## Limits worth knowing

- **An Extension has a 2-second budget by default**, 10 seconds
  self-service. The hot path is one Custom Object query plus pure
  evaluation, and the query is cached for `RULE_CACHE_SECONDS`.
- **An Extension may return at most 100 update actions.** A product would
  have to be moving in and out of more than 100 rule-driven categories in
  one write to reach that.
- **A Project allows 25 Extensions and 50 Subscriptions.** This uses one of
  each.
- **Process now walks the catalog.** It is paged and resumable, and for a
  catalog in the millions the scheduled job is the better route — it has a
  30-minute budget per run and resumes across runs.
- **The category picker reads the first 500 categories** and says so when
  there are more.
