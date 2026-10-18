# MedTrack release checklist

Use this checklist before sharing a release candidate or publishing an Android
build. Record the app version, Android version code, build commit, device model,
and tester with each completed run.

## Build and package

- [ ] Confirm the web CI, Android APK build, and emulator launch checks pass for
      the release commit.
- [ ] Confirm the debug APK can install and launch on a physical Android phone.
- [ ] Verify the app ID is `com.bytesimplified.medtrack` and the version name and
      version code are appropriate for the release.
- [ ] Review the merged Android manifest. Keep only permissions needed by the
      app; MedTrack should not request internet or exact-alarm access.
- [ ] Check app name, launcher icon, splash screen, theme, and layout on the
      smallest supported screen and a larger screen.

## Data, backup, and upgrades

- [ ] Create a JSON backup and confirm it contains the expected medicines,
      schedules, dose history, stock ledger, and reminder preferences.
- [ ] Restore that backup on a test install and confirm the data matches.
- [ ] Try an invalid or newer-format backup and confirm MedTrack keeps the
      existing data.
- [ ] Upgrade a test database from every supported prior schema version and
      verify records and history remain intact.
- [ ] Launch the app in airplane mode, navigate between screens, and confirm
      saved data remains available.

## Reminder and accessibility checks

- [ ] Grant and deny notification permission; verify both states are explained
      and can be changed in Android settings.
- [ ] Schedule, snooze, and cancel a reminder; verify delivery can be delayed by
      Android battery controls because reminders use inexact alarms.
- [ ] Check key flows with TalkBack, keyboard navigation, large text, and dark
      theme. Confirm focus and status messages remain visible and understandable.
- [ ] Verify destructive restore requires confirmation and presents a clear
      success or failure message.

## Signing and distribution

- [ ] Create or select the production signing key outside the repository and
      store it in an approved password manager with a separate secure backup.
- [ ] Record the signing certificate fingerprint and protect the alias and
      passwords. Never commit a keystore, `key.properties`, or signing secret.
- [ ] Build a signed release APK or app bundle using the protected release
      process. Do not distribute the debug APK as a production release.
- [ ] Review the final package and release notes before sharing it with testers
      or submitting it to a store.
- [ ] Keep a copy of the exact release artifact and its source commit.
