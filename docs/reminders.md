# Reminders

MedTrack keeps notification scheduling behind the `NotificationAdapter` port.
The browser implementation uses the Web Notifications API for delivery and
in-memory timers for future clock times.

## Permission and schedules

- Reminder preferences start disabled. Enabling one asks the browser for
  notification permission when permission has not already been granted.
- A schedule needs a clock time: a custom dose time or an optional meal reminder
  time. Meal labels alone, such as “after lunch”, do not identify a notification
  time.
- Enabled schedules are synchronized from the saved schedule versions,
  recurrence rules, pauses, end dates, and pending dose occurrences. A Later
  action keeps the dose pending and reschedules its reminder from the saved
  `snoozedUntil` timestamp.
- Schedule times use the schedule's IANA timezone. A nonexistent clock time in a
  daylight-saving gap moves to the first valid minute; an overlapping time uses
  the earlier instant.
- Low-stock alerts are separately opt-in per medicine and are claimed once per
  medicine-local day, so database updates do not show duplicate alerts.

## Platform boundary

Browser timers only live in the open MedTrack page. Closing the tab or browser
ends those timers; this implementation does not promise background delivery.
The adapter interface leaves room for Android local notifications. Capacitor
integration, Android permissions, and background scheduling belong to PR 12.
