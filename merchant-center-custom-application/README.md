# `merchant-center-custom-application`

The rule builder, as a Merchant Center
[Custom Application](https://docs.commercetools.com/merchant-center-customizations/custom-applications):
every rule in the Project, each on its own page.

It talks to the `rules-api` application, whose URL arrives as
`RULES_API_URL`. Registration, configuration and install are in the
[root README](../README.md).

```bash
npm install
npm start          # the dev server, signed in to initialProjectKey
npm run typecheck
npm run build
```

`custom-application-config.mjs` carries an `${env:...}` placeholder for every
deploy-time value, so this directory installs into any Project without an
edit. Only `env.development.initialProjectKey` is a literal, and it is for
`npm start` alone.
