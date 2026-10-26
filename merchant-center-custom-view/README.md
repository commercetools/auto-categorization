# `merchant-center-custom-view`

The same rules as a panel on the category details page, as a Merchant Center
[Custom View](https://docs.commercetools.com/merchant-center-customizations/custom-views).
A merchandiser reads and edits the rules on the category they are already
looking at.

It talks to the `rules-api` application, whose URL arrives as
`RULES_API_URL`. Registration, configuration and install are in the
[root README](../README.md).

```bash
npm install
npm start          # the dev server, hosted in a category details page
npm run typecheck
npm run build
```

`custom-view-config.mjs` carries an `${env:...}` placeholder for every
deploy-time value. The two literals — `initialProjectKey` and the
`hostUriPath` that puts the panel on a category page — are for `npm start`
alone.
