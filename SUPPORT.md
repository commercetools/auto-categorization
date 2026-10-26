# Support

Thanks for taking a look at Auto-categorization. It is commercetools-labs reference code: shared
in the hope that it is useful, and **unsupported**.

In practice that means:

- It is freely available under the MIT license ([LICENSE](LICENSE)) and is provided as-is, without
  warranty.
- It isn't covered by commercetools Support, your account team or any service-level agreement, so
  we can't promise replies, fixes or new releases.
- Issues and pull requests are welcome, and we'll take a look when we can.

## Before you install this in a production Project

Running in a production Project is what it is built for, and these are the things worth knowing
before you do:

- **A rule takes categories away as well as giving them.** A rule with
  `removeWhenNoLongerMatching` on (the default) removes its category from every product that
  stops matching, including a product a merchandiser put there by hand. That is what computed
  membership means, and it is also how a hand-curated assortment empties out. Turn the flag off
  for a rule that should only ever add.
- **It installs a Product API Extension, which runs inside every product write in the Project.**
  That is every client's writes, not only the Merchant Center's: importers, storefronts and
  scripts too. The endpoint fails open: any error returns no actions and lets the write through,
  because an Extension that errors fails the API call it was extending, and that would stop every
  product save in the Project. [When something is down](README.md#when-something-is-down) sets
  out that trade, so you can decide whether it is the one you want.
- **Try a rule before you save it.** The rule builder previews what a rule would claim and
  release, against the live catalog, without writing anything. A rule whose preview surprises you
  would have surprised you in the catalog.
- **A rule is reversed by deleting it and running a pass.** That removes the category again; it
  does not restore what was there before, because nothing snapshots the catalog first and there
  is no undo. Products a rule never matched are untouched, and categories no rule names are never
  read or written.
- **The API client is generated at install with seven scopes**, listed in
  [Scopes](README.md#scopes). `manage_products` is among them, because assigning a category is a
  product write. No part of it needs an admin client.
- **`EXTENSION_AUTH_SECRET` is the one thing protecting the Extension endpoint.** Generate at
  least 24 random characters per installation. It is stored in `securedConfiguration` and is not
  displayed again.
- **Register the Custom Application with the entry point path `auto-categorization`.** The
  defaults agree on that path and no other: it is where the Custom Application's permission
  names, the Custom View's permission group and the API's `VIEW_PERMISSION` /
  `MANAGE_PERMISSION` all meet. With a different path and nothing else moved, every Merchant
  Center request is refused with 403, and the path cannot be changed afterwards.
  [Permission names](README.md#permission-names) has the whole rule.
- **`tools/` drives a real Project.** Those scripts read credentials from a `.env` you point them
  at and write to the catalog. Nothing in `connect.yaml` references the folder, so it is never
  deployed, but running it is a real run against your Project rather than a dry run.

## If you need help

- **Questions and bugs:** open a GitHub issue. Another reader or a maintainer may well have an
  answer, though we can't commit to one.
- **Using it in production:** feel free to fork it and adapt it to your needs. Once it's in
  production it's yours, so review the code, test it against your Project and keep your copy up
  to date.
- **commercetools products:** for questions about Composable Commerce, the Merchant Center or
  Connect themselves, the [commercetools documentation](https://docs.commercetools.com), the
  community and commercetools Support are the right place, as usual.

### Writing a useful issue

A useful report names which of the six applications it came from, what the rule was, and what you
expected the product's categories to be. Two things reproduce most problems without a deployment
in the way: the rule builder's preview, and `npm run preflight` for anything that looks like a
build or dependency failure.

The connector logs a correlation key on every pass (`category:<id>:<version>` for a
notification, the rule key for a run), and the last pass per rule is in the
`auto-categorization-runs` Custom Object container, visible in the Merchant Center under
Settings. Both say more in an issue than a description of the symptom.

Please leave real credentials, project keys you'd rather keep private, and customer data out of
issues.
