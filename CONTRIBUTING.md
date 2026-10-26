# Contributing

This is a commercetools-labs project, provided as-is and unsupported (see [SUPPORT.md](SUPPORT.md)).
Contributions are welcome and reviewed on a best-effort basis. A small, self-contained change is
the easiest kind to review and land.

Only contribute code you have the right to license under MIT, and never commit credentials or
personal data.

## Before you open a PR

```bash
npm run install:all
npm run predeploy     # build, shared-code drift check, unit tests, lint
```

`predeploy` is the gate for every change. The repository has no CI, so a green `predeploy` is what
keeps the next clone building.

Before a change that will be staged as a connector tag, run the whole pre-flight:

```bash
npm run preflight     # predeploy, plus npm audit --omit=dev, plus an isolated build of each application
```

That is the three things Connect's own validation pipeline checks, in about two minutes rather
than the ten each round trip through the platform costs. `npm run simulate:connect` is the part
worth knowing about: it builds each application from its own folder with nothing above it on
disk, which is the condition Connect builds under and the one that catches a cross-package
import.

## Shared code is vendored, not linked

The rule model, the matching engine, the rule store and the catalog sweep live in
`common-connect/src` and are copied into each backend application under `src/shared` by
`npm run sync:shared`. The copies are committed.

**Edit `common-connect/src`, then run `npm run sync:shared`.** A change made directly in a
`src/shared` copy does not survive: `npm run check:shared` fails on drift, and the next sync
overwrites it.

It is vendored rather than a `file:` dependency because Connect builds an application from its
own folder: `../common-connect` is not reachable there at install time or at build time, so the
dependency cannot resolve and `npm ci` fails.

## What the tests expect

- **The engine is pure.** `common-connect/src/engine.ts` takes a product, a rule and a context
  object and returns a decision; it makes no requests. A new field or operator is testable
  without a Project, and should come with a test that does not need one.
- **New fields are declared, not special-cased.** `fields.ts` describes what a rule can read and
  which operators follow from each kind. Adding a field there puts it in the rule builder, the
  validator and the engine at once.
- **A pass stays idempotent.** A plan is computed from the product's live category list, so a
  redelivered notification, an overlapping sweep and a Process now that collides with the
  scheduled job all recompute an empty plan and write nothing. A change that makes a second run
  do work is a bug.
- **Categories no rule names are never touched.** Any change to the write path should keep that
  true, and say in a test that it does.

## Adding a dependency

Connect runs a dependency scan and fails the connector on any high-severity advisory, so every
application keeps a clean production tree. Three things in here exist to hold that line, and are
worth knowing before you add something:

- Logging is thirty lines of `JSON.stringify` rather than a logging library, because the obvious
  one pulls in winston and lodash.
- `rules-api` pins Express through an override scoped to `@commercetools-backend/express`. The
  override is deliberately *not* global: the other applications run Express 5, and a global pin
  hands their router a `path-to-regexp` that cannot parse their routes.
- The Merchant Center packages keep their test and lint tooling in `devDependencies`, where the
  starter puts some of it under `dependencies`.

`npm run audit` is the check.

## Style

Prettier and ESLint are configured per package; `npm run lint` is in `predeploy`. Comments should
explain why something is the way it is, especially where the platform forced it. Those are the
notes that save the next person an afternoon.

By contributing you agree your contribution is licensed under the [MIT License](LICENSE).
