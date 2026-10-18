# History and analytics

The Insights screen reads saved dose occurrences and the versioned schedules on
this device. It does not send health data to a server.

## Calendar and history

- The calendar follows the device's local calendar month. Occurrences retain
  the timezone saved on their schedule.
- Schedule versions, recurrence rules, end dates, and pause periods determine
  which doses were due on each date. Archived medicines remain available in
  history.
- If a due occurrence was never materialized while the app was open, the
  history report derives it from the saved schedule. This read-only projection
  keeps missed past doses visible without changing the database.
- Past pending doses are **unconfirmed**. A pending dose scheduled for today
  remains **pending today**. Future dates are excluded from dose counts and
  adherence.
- Dose events remain append-only and are displayed in recorded order so Undo
  and correction activity stays reviewable.

## Adherence

For a month or date, adherence is:

```text
taken / (taken + skipped) × 100
```

Unconfirmed past doses and pending doses from today are shown separately. They
do not enter the completed-dose denominator. If no dose has been confirmed or
skipped, adherence is not available yet.

The report can be filtered to one medicine, including archived medicines.
Changing the filter or recording a dose refreshes the report from IndexedDB.