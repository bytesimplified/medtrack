# MedTrack

MedTrack is a local-first medicine tracker for Android and the browser. It helps you manage medicine schedules, record doses, track stock, and review your history—without creating an account.

## Features

- **Medicines and schedules:** register medicines, set recurring doses and meal windows, and edit, pause, or archive routines.
- **Daily tracking:** mark doses Taken, Skipped, or Later; undo mistakes while preserving a correction history.
- **Stock:** automatic deductions for taken doses, refills, adjustments, low-stock alerts, and supply forecasts.
- **Reminders:** browser and Android notifications with permission controls and snoozing.
- **History and analytics:** calendar history, medicine filters, and weekly/monthly adherence.
- **Offline and backup:** on-device storage, offline access, and JSON export/restore.

See the [functional requirements and development stages](docs/development-plan.md) for the complete scope.

## Install on Android

1. Open [Android APK builds](https://github.com/bytesimplified/medtrack/actions/workflows/android.yml?query=branch%3Amain) and select the latest successful run for **main**.
2. In **Artifacts**, download **medtrack-debug-apk**. GitHub may ask you to sign in.
3. Extract the ZIP and transfer **app-debug.apk** to your phone.
4. Open the APK and allow installation from your browser or file manager when Android asks, then tap **Install**.
5. Open **MedTrack**, add a medicine and schedule, and enable notifications in the app if you want reminders.

The downloadable APK is a debug build for testing. Physical-phone validation and release signing are still pending. For local builds, USB installation, and signing, see the [Android guide](docs/android-build.md).

## Development status

All 13 development stages are implemented and merged: foundation, app navigation, local database, scheduling, medicine management, daily dashboard, dose tracking, stock management, reminders, analytics, E2E coverage, Android integration, and backup/offline support.

The [development plan](docs/development-plan.md) maps these stages to functional requirements. The [release checklist](docs/release-checklist.md) tracks the remaining device and release checks.

## Repository layout

| Folder               | Contents                                                                              |
| -------------------- | ------------------------------------------------------------------------------------- |
| `src/`               | Application code, grouped by feature and shared UI                                    |
| `test/`              | Unit and component tests mirroring the source folders, plus shared setup and fixtures |
| `test/e2e/`          | Browser journeys, responsive app smoke tests, and Android emulator checks             |
| `config/`            | Vite/Vitest, ESLint, and TypeScript project configuration                             |
| `android/`           | Native Capacitor Android project                                                      |
| `docs/`              | Feature design, functional requirements, testing, and release guides                  |
| `.github/workflows/` | Quality, browser E2E, and APK automation                                              |

README is the only documentation file at the root. Package manifests, the web entry point, and configuration files required for standard tool discovery remain there.

## Run locally

Use Node.js 24 (24.13 or newer within version 24):

```sh
git clone https://github.com/bytesimplified/medtrack.git
cd medtrack
npm ci
npm run dev
```

| Command                       | Purpose                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `npm run check`               | Formatting, lint, unit/component tests, typecheck, and production build             |
| `npm run test:watch`          | Watch unit/component tests during development                                       |
| `npm run test:e2e`            | Browser smoke and isolated journeys after [browser test setup](docs/e2e-testing.md) |
| `npm run android:build:debug` | Build an installable Android debug APK                                              |

Pull requests run quality checks, browser journeys, and an Android build with emulator installation/launch. See [browser testing](docs/e2e-testing.md) and [Android testing](docs/android-build.md) for setup and coverage.

MedTrack records your routine; it does not prescribe treatment or provide medical advice.
