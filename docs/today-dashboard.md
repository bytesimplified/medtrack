# Today dashboard

The Today screen creates the current local-date occurrence for each active
medicine schedule. The local date is calculated in the schedule's IANA timezone
so a device timezone change does not move a dose to another calendar day.
The scheduling engine remains pure; `ensureTodayOccurrences` owns the IndexedDB
write boundary.

Occurrence IDs are stable for a schedule and date. The service checks for an
existing ID inside a read/write transaction and inserts only missing rows.
Repeated screen loads therefore do not replace status, timestamps, or schedule
snapshots. Paused schedules and archived medicines do not create new occurrences.

The dashboard reads rows through the unique schedule/date index, groups meal
windows and custom clock times, and derives progress from the saved occurrence
statuses. It displays the current stock balance from the append-only ledger.
Taken and skipped doses count as complete; pending doses remain unconfirmed.
When no dose is due, the screen distinguishes an empty medicine list, a fully
paused routine, and an ordinary day without a scheduled dose.

## Verification

Tests cover timezone-local dates, duplicate-safe persistence, preservation of
existing status, paused and archived schedules, multiple daily doses, timing
group order, and progress totals. The pull request browser smoke also checks
that the Today screen shows the saved medicine and its timing groups.
