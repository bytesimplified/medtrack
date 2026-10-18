# MedTrack — Medicine Tracker

A minimal app that answers three questions: **What should I take today? Have I taken it? How much stock is left?**

This README is the project's standing overview and progress tracker. Keep the overview, feature scope, PR sequence, and completed-work records stable. As work progresses, update only the relevant status, actual PR link, completion checklist, and validation result. Change scope or sequencing only when explicitly agreed.

## Project status

| Item                         | Status                                             |
| ---------------------------- | -------------------------------------------------- |
| Target                       | MedTrack v1.0 MVP                                  |
| Planned implementation PRs   | 13                                                 |
| Completed and merged         | 4 / 13 in main; 7 / 13 merged in the stack         |
| Current milestone            | PRs 05–07 merged in the stack; PRs 08–09 in review |
| Next planned work            | PR 10 — History and Analytics                      |
| Functional medicine tracking | Available in the feature stack                     |
| Android APK                  | Planned                                            |

**Status key:** Planned → In progress → Ready for review → Done (merged to `main`). **Merged to stack** means a PR was merged into its parent feature branch but is not in `main` yet. **Partial (review)** means foundational work is ready for review, with later planned work still outstanding.

## The app

| Screen    | Purpose                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Today     | Default home screen: today's doses grouped by meal window, progress, and Taken / Skip / Later actions |
| Medicines | Register medicines, manage schedules, inspect stock, refill, pause, and archive                       |
| Insights  | Calendar history, taken/skipped/unconfirmed counts, and weekly/monthly adherence                      |

**Example acceptance scenario:** Vitamin D, daily after lunch, 1 tablet per dose, starting stock 30. Taken changes stock to 29; a repeated confirmation keeps it at 29; Undo restores 30; Skip and Later do not deduct stock. “After lunch” does not assume a notification clock time.

## Feature checklist

| ID        | Feature                                                                               | Planned PR(s) | Status           |
| --------- | ------------------------------------------------------------------------------------- | ------------- | ---------------- |
| FR01      | Register medicine name, strength, description, dose quantity, unit, and initial stock | 03, 05        | Merged to stack  |
| FR02      | Daily, alternate-day, selected-weekday, and every-X-days schedules                    | 04, 05        | Merged to stack  |
| FR03      | Meal windows or custom times, multiple daily doses, and start/end dates               | 04, 05        | Merged to stack  |
| FR04      | Today's scheduled medicines, grouped by timing with progress and stock                | 06            | Merged to stack  |
| FR05      | Taken, Skipped, and Later actions; Later only snoozes reminders                       | 07, 09        | Partial (stack)  |
| FR06      | Deduct stock only on confirmed Taken, using atomic and idempotent updates             | 07            | Merged to stack  |
| FR07      | Stock refills, explicit adjustments, reconciliation, and refill history               | 08            | Ready for review |
| FR08      | Scheduled dose reminders, permission handling, snooze, and rescheduling               | 09, 12        | Partial (review) |
| FR09      | Low-stock alerts with duplicate-warning prevention                                    | 08, 09        | Partial (review) |
| FR10      | Daily dose history with exact timestamps and correction audit trail                   | 07, 10        | Planned          |
| FR11      | Calendar, weekly/monthly adherence, and medicine-specific history                     | 10            | Planned          |
| FR12      | Edit, pause, and archive medicines/schedules while preserving history                 | 04, 05        | Merged to stack  |
| FR13      | Undo incorrect dose entries and reverse the matching stock transaction                | 07            | Merged to stack  |
| FR14      | Estimate remaining supply and stock-out date using upcoming schedules                 | 08            | Ready for review |
| FR15      | Local persistence and offline access without a mandatory account                      | 03, 13        | Partial (review) |
| UX01      | Responsive Today / Medicines / Insights navigation and reusable controls              | 02            | Done (merged)    |
| UX02      | Light/dark themes and accessible layouts and tap targets                              | 02, 13        | Partial (review) |
| DATA01    | Export, backup, restore, and migration verification                                   | 13            | Planned          |
| QA01      | PC development, formatting, linting, startup test, and build CI                       | 01            | Done             |
| QA02      | Domain tests for schedules, stock, corrections, and analytics                         | 04–10         | Partial (stack)  |
| QA03      | Automated browser end-to-end tests on pull requests                                   | 08, 09, 11    | Partial (review) |
| ANDROID01 | Capacitor integration, emulator checks, and automated debug APK builds                | 12            | Planned          |
| RELEASE01 | Physical-device validation, signing documentation, and release readiness              | 12, 13        | Planned          |

## Planned PRs

The numbers below are roadmap identifiers. Actual GitHub PR links are added when each PR exists.

| Plan | PR / branch                                                                                                    | Deliverable                                                                              | Status           |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------- |
| 01   | [Project Setup](https://github.com/bytesimplified/medtrack/pull/1) · `feat/project-setup`                      | React/Vite/TypeScript, Tailwind/icons, ESLint/Prettier/Vitest, and CI                    | Done (merged)    |
| 02   | [App Layout and Navigation](https://github.com/bytesimplified/medtrack/pull/2) · `feat/app-shell`              | Responsive layout, three tabs, reusable UI, and light/dark themes                        | Done (merged)    |
| 03   | [Local Database and Models](https://github.com/bytesimplified/medtrack/pull/3) · `feat/database`               | Dexie persistence, versioned schema, medicine/schedule/occurrence/event/stock models     | Done (merged)    |
| 04   | [Scheduling Engine](https://github.com/bytesimplified/medtrack/pull/4) · `feat/scheduling-engine`              | Recurrence rules, meal windows, reminder times, and date/timezone tests                  | Done (merged)    |
| 05   | [Medicine Registration](https://github.com/bytesimplified/medtrack/pull/5) · `feat/medicine-management`        | Add/edit medicine, configure doses, pause/archive, and persistence validation            | Merged to stack  |
| 06   | [Today's Dashboard](https://github.com/bytesimplified/medtrack/pull/6) · `feat/today-dashboard`                | Generate occurrences, timing groups, progress, and empty/paused/multi-dose states        | Merged to stack  |
| 07   | [Dose Tracking and Stock Engine](https://github.com/bytesimplified/medtrack/pull/7) · `feat/dose-stock-engine` | Taken/Skip/Later, audit events, atomic ledger updates, Undo, and idempotency             | Merged to stack  |
| 08   | [Stock Management](https://github.com/bytesimplified/medtrack/pull/8) · `feat/stock-management`                | Refills, adjustments, supply forecasting, and low-stock threshold detection              | Ready for review |
| 09   | [Reminders and Notifications](https://github.com/bytesimplified/medtrack/pull/9) · `feat/notifications`        | Browser adapter, permission handling, dose snooze, and low-stock alert rules             | Ready for review |
| 10   | History and Analytics · `feat/analytics`                                                                       | Calendar, medicine history, taken/skipped/unconfirmed counts, and adherence              | Planned          |
| 11   | Automated End-to-End Tests · `test/e2e-coverage`                                                               | Expand Playwright journeys beyond stock and reminder flows                               | Planned          |
| 12   | Android Integration and APK CI · `feat/android-build`                                                          | Capacitor, app identity/permissions, emulator checks, debug APK workflow, signing guide  | Planned          |
| 13   | Backup, Polish and Release · `release/v1-polish`                                                               | Export/restore, offline/error handling, accessibility, migrations, and release checklist | Planned          |

**Milestone 1:** Functional browser MVP after PR 07 in the feature stack.  
**Milestone 2:** v1.0 release candidate after PR 13, subject to final device validation and signing.  
PR 09 implements browser notification scheduling; Android background notifications and device validation follow in PR 12.

## Work ready for review

- **PR 08:** Refill and adjustment ledger commands, supply forecasts, low-stock state, stock history, and isolated Playwright stock journeys. `npm run check` passes locally with 100 tests; browser journeys run in GitHub Actions.
- **PR 09:** Permission-aware browser dose reminders, Later rescheduling, opt-in low-stock alerts, and isolated Playwright journeys. Local unit/build checks and the GitHub browser run are the review gates; Android background delivery remains in PR 12.
- **Stack:** PRs 02–04 are merged into `main`. PRs 05–07 are closed as merged into their parent feature branches; their final CI checks passed. The feature stack is not in `main` yet.

## Completed work

### PR 01 — Project foundation

- [x] Initialize React, Vite, and strict TypeScript configuration.
- [x] Configure Tailwind CSS and Lucide icons.
- [x] Add a responsive starter landing screen, clearly labeled as coming soon.
- [x] Configure ESLint, Prettier, and editor formatting.
- [x] Configure Vitest, React Testing Library, DOM setup, and startup smoke test.
- [x] Add lockfile-based dependency installation and Node.js 24 configuration.
- [x] Add GitHub Actions formatting, lint, test, typecheck, and production-build checks.
- [x] Document PC setup, commands, source layout, and planned milestones.
- [x] Verify a clean install and all local checks.
- [x] Pass [GitHub CI](https://github.com/bytesimplified/medtrack/actions/runs/39052026928).
- [x] Merge PR 01 into `main`.

**Four implementation commits:**

1. `chore: initialize React Vite TypeScript project`
2. `chore: configure Tailwind CSS and icon library`
3. `chore: configure ESLint, Prettier and Vitest`
4. `ci: add GitHub Actions lint and unit test workflow`

**Verified:** clean `npm ci`, formatting, zero-warning lint, 1 startup test, TypeScript, production build, development-server startup, and `git diff --check`.

The initially empty repository received a README-only bootstrap commit to establish `main`. The starter screen does not yet store medicines or provide dose tracking, reminders, offline application loading, or an APK.

## Architecture and data rules

| Area           | Approach                                                        |
| -------------- | --------------------------------------------------------------- |
| Web app        | React + TypeScript + Vite                                       |
| Styling        | Tailwind CSS + Lucide icons                                     |
| Local database | IndexedDB with Dexie                                            |
| Android        | Planned: Capacitor + local notifications                        |
| Testing        | Vitest and browser journeys; emulator/device checks planned     |
| Delivery       | GitHub Actions quality checks now; automated APK builds planned |

- Keep scheduling, dose logging, stock calculation, analytics, and platform notifications separate from UI.
- Model Medicine, versioned DoseSchedule, DoseOccurrence, append-only DoseEvent, StockTransaction, and reminder preferences.
- Calculate stock from the transaction ledger; record initial stock, consumption, refills, adjustments, and reversals.
- Apply related dose/event/stock writes atomically and prevent duplicate deductions.
- Preserve historical schedule quantities and events when schedules change.
- Keep past pending doses **unconfirmed**, distinct from explicitly skipped doses.
- Never silently create negative stock; offer explicit refill or reconciliation.
- Calculate historical adherence from completed dates; exclude future doses.
- Snoozing changes reminder timing, not stock or the dose's final status.

## Run and check on a PC

```sh
git clone https://github.com/bytesimplified/medtrack.git
cd medtrack
npm ci
npm run dev
```

Use Node.js 24 LTS (24.13 or newer within version 24). Open the URL printed by Vite.

```sh
npm run check
```

This runs formatting, linting, tests, typechecking, and the production build. Browser development covers shared logic; emulator and physical-device checks will validate Android behavior.

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

CI runs on pull requests targeting any branch, pushes to `main`, and manual dispatch.
It installs the lockfile with `npm ci`, then checks formatting, lint, tests, and
the TypeScript/production build. Actions use pinned commit SHAs, read-only
repository permissions, and no project secrets. Branch protection is a separate
repository setting; configure it separately in repository settings.

## MVP boundaries

No AI medical advice, drug-interaction checking, prescription scanning, clinician messaging, family accounts, medicine ordering, or advanced health dashboards in v1. The app records the user's medication routine and does not prescribe treatment.

## Updating this tracker

When a planned PR progresses or is completed:

1. Update its status and actual PR link in the roadmap.
2. Update only the affected feature statuses and completed-work checklist.
3. Update the merged count, current milestone, next work, and validation evidence.
4. Preserve the existing overview, feature descriptions, PR sequence, and historical completed work unless a scope change is explicitly agreed.

“Ready for review” means implemented and verified; “Done” means merged. Keep future edits small and focused on progress.
