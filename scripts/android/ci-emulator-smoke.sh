#!/usr/bin/env bash
set -euo pipefail

apk_path="${1:?Usage: ci-emulator-smoke.sh <debug-apk> }"
package_id="com.bytesimplified.medtrack"
activity="${package_id}/.MainActivity"

aapt_path="${ANDROID_HOME:?ANDROID_HOME must be set}/build-tools/36.0.0/aapt"
permissions="$("$aapt_path" dump permissions "$apk_path")"
grep -Fq 'android.permission.POST_NOTIFICATIONS' <<<"$permissions"
if grep -Fq 'android.permission.INTERNET' <<<"$permissions"; then
  echo 'MedTrack must remain an offline-only Android app.' >&2
  exit 1
fi
if grep -Fq 'android.permission.SCHEDULE_EXACT_ALARM' <<<"$permissions"; then
  echo 'MedTrack schedules inexact reminders and must not request exact alarms.' >&2
  exit 1
fi

adb install -r "$apk_path"
adb shell pm grant "$package_id" android.permission.POST_NOTIFICATIONS
start_result="$(adb shell am start -W -n "$activity")"
printf '%s\n' "$start_result"
grep -Fq 'Status: ok' <<<"$start_result"

for attempt in {1..20}; do
  if adb shell pidof "$package_id" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo 'MedTrack did not stay running after the emulator launch.' >&2
adb logcat -d -t 300 | tail -n 120
exit 1
