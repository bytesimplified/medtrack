# MedTrack

A minimal medicine tracker for daily doses, stock, and history.

## Current milestone: PR #01 — Project foundation

The repository contains a runnable React + TypeScript app with Vite, Tailwind
CSS, Lucide icons, ESLint, Prettier, Vitest, and GitHub Actions CI. The initial
screen is a placeholder. Medicine registration, dose logging, persistence,
reminders, navigation, and Android packaging are planned for subsequent PRs.

## Run on your PC

Install Node.js 24 LTS (24.13 or newer within version 24) and npm. If you use nvm,
run `nvm install` and `nvm use`; `.nvmrc` selects the same major version as CI.

```sh
git clone https://github.com/bytesimplified/medtrack.git
cd medtrack
git switch feat/project-setup # Until PR #01 is merged; then use main.
npm ci
npm run dev
```

Open the local URL printed by Vite. Use your browser's responsive device mode to
inspect a mobile viewport. No account, API keys, or backend are required.

## Commands

| Command                | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `npm run dev`          | Start the local development server with hot reload            |
| `npm run build`        | Typecheck and create the production web bundle in `dist/`     |
| `npm run preview`      | Serve the built bundle locally after running build            |
| `npm run lint`         | Run ESLint with zero warnings allowed                         |
| `npm run typecheck`    | Check app and tool configuration TypeScript                   |
| `npm test`             | Run Vitest once, including the application startup smoke test |
| `npm run test:watch`   | Run tests in watch mode while developing                      |
| `npm run format`       | Apply Prettier formatting                                     |
| `npm run format:check` | Verify formatting without editing files                       |
| `npm run check`        | Run the same quality checks as CI                             |

Commit `package-lock.json` whenever dependencies change. Use `npm ci` for
reproducible installs. The starter test verifies React rendering, accessible
landmarks, and the initial unavailable-feature message; medicine business rules
will receive their own tests when implemented.

## Source layout

- `src/main.tsx`: React entry point and global styles.
- `src/App.tsx`: Initial application screen.
- `src/index.css`: Tailwind import and base styles.
- `src/App.test.tsx`: Application startup smoke test.
- `src/test/setup.ts`: Shared DOM test setup and cleanup.
- `vite.config.ts`: React, Tailwind, and Vitest configuration.
- `.github/workflows/ci.yml`: Formatting, lint, test, and production-build checks.

Future scheduling, dose/stock, database, and notification services will be kept
separate from the UI. Stock will be calculated from an append-only transaction
ledger, with atomic dose updates and idempotent confirmation. No medical or
sample user data is stored by this foundation.

## CI and review

CI runs on pull requests targeting `main`, pushes to `main`, and manual dispatch.
It installs the lockfile with `npm ci`, then checks formatting, lint, tests, and
the TypeScript/production build. Actions use pinned commit SHAs, read-only
repository permissions, and no project secrets. Branch protection is a separate
repository setting; this PR does not configure it.

## Next milestones

1. PR #02: Responsive app shell, Today/Medicines/Insights navigation, and themes.
2. PRs #03–#07: Local database, scheduling, registration, Today, and the dose/stock engine.
3. PRs #08–#10: Refills, forecasts, reminders, history, and basic insights.
4. PRs #11–#13: Browser E2E tests, Capacitor Android/APK CI, backup, and release polish.

PC browser tests will cover the shared application logic. Android emulator and
physical-device checks will cover native permissions and background reminders
once Capacitor is introduced. **This PR does not generate an APK or provide
offline application loading yet.**
