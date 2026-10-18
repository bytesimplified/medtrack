# Android build and device testing

MedTrack uses Capacitor to package the existing web app as an Android app. The
application ID is `com.bytesimplified.medtrack`; the web bundle is copied from
`dist/` into the Android project by `cap sync`.

## Requirements

- Node.js 24 (24.13 or newer within major version 24).
- JDK 21 and Android Studio with Android SDK Platform 36 and Build Tools 36.
- Android SDK Platform Tools for installing to an emulator or USB-connected phone.

Capacitor's current Android setup requirements are documented in the
[official environment setup guide](https://capacitorjs.com/docs/getting-started/environment-setup).

## Build and install a debug APK

From the repository root:

```sh
npm ci
npm run android:build:debug
```

The APK is written to
`android/app/build/outputs/apk/debug/app-debug.apk`. To install it, enable USB
debugging on an Android device, connect it, and run:

```sh
npm run android:install:debug
```

The GitHub Actions workflow also uploads a `medtrack-debug-apk` artifact for
each Android workflow run. Download that artifact from the run's **Artifacts**
section, transfer the APK to the phone, and allow installation from that file
source when Android asks.

This is a debug build signed with a temporary debug key. It is for development
and phone testing, not Play Store distribution. The CI emulator check verifies
the merged permission set, installs the APK, grants notification permission,
and launches the app. It does not replace testing on physical Android devices.

## Notifications and permissions

Android notifications use Capacitor Local Notifications. Android 13 and later
require the user to grant notification permission; MedTrack asks when a user
enables notifications. Reminder scheduling uses inexact alarms, so Android may
deliver them later than the selected time, especially in battery-saving modes.
MedTrack does not request exact-alarm access.

The Android manifest disables automatic cloud backup and contains no internet
permission. Medicine data stays on the device; manual JSON backups are added in
roadmap PR 13.

## Release signing

Keep release signing keys outside the repository. Do not commit a `.jks`,
`.keystore`, signing password, or generated `key.properties` file. For a local
release candidate, use Android Studio's **Build → Generate Signed Bundle / APK**
and select **APK**. Store the keystore and passwords in a secure password
manager, make a separate offline backup, and record the alias and certificate
fingerprint for future updates.

Automated release signing and publishing are out of scope for PR 12. Before a
Play Store release, add a protected release workflow that reads signing values
from repository or environment secrets, limits access to trusted release
events, and uploads the signed artifact for review. Complete the device and
release checklist in PR 13 first.
