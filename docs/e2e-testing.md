# Browser end-to-end coverage

MedTrack's Playwright journeys exercise the built app in Chromium with a fresh
browser context for each scenario. Each context gets isolated IndexedDB and
notification state; tests do not use personal or shared browser data.

## Covered journeys

| Area              | Checks                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------ |
| App shell         | Navigation, theme persistence, responsive layouts, tap targets, reload, and runtime errors |
| Medicine setup    | Registration, multiple schedules, schedule edits, saved data, and mobile navigation        |
| Dose actions      | Take, Skip, Later, Undo, stock safety, progress, and append-only correction history        |
| History           | Calendar totals, adherence, medicine filtering, audit events, archive, and reload          |
| Stock             | Refill, adjustment validation, ledger history, and reload                                  |
| Browser reminders | Permission, low-stock deduplication, persistence, and Later rescheduling                   |

The suite checks visible user behavior and persistent state across routes and
reloads. Domain edge cases remain covered by Vitest unit tests.

## Run locally

Use Node.js 24 and install the app dependencies first:

```sh
npm ci
npm run build
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
npm run test:e2e:smoke
npm run test:e2e:journeys
```

The CI workflow installs Playwright without adding it to the application
dependencies, installs Chromium, then runs the smoke check and every isolated
journey on pull requests.
