# MedTrack

A minimal medicine tracker for daily doses, stock, and history.

## Development

Use Node.js 24 LTS (see `.nvmrc`) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates the production web
bundle in `dist/`; `npm run preview` serves it locally.

This initial foundation does not yet store medicines, schedule doses, or produce
an Android APK. Those features will be introduced in subsequent PRs.
