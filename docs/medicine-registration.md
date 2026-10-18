# Medicine registration

The Medicines screen reads medicines, schedules, and the stock ledger from
Dexie with `liveQuery`, so updates appear in the list as soon as a transaction
commits. Storage errors are shown on the screen; the app does not replace
failed persistence with temporary in-memory data.

## Registration

`registerMedicine` validates medicine details, non-negative starting stock,
positive dose quantities, recurrence, date ranges, meal/custom timing, and the
schedule timezone before opening a write transaction. It then saves the
medicine, one schedule per dose time, one disabled reminder preference per
schedule, and an initial stock transaction when the amount is greater than
zero. Zero stock is represented by no ledger entry.

Every related row is written in a single Dexie transaction. Any failure rolls
back all of the medicine, schedule, reminder, and stock rows. Quantities use
the database's fixed integer milliunit representation. A schedule version and
series ID are created per dose slot so two doses on one date remain distinct.

The schedule form supports daily, alternate-day, selected-weekday, and
every-X-days recurrence; multiple daily dose slots; meal windows or custom
clock times; optional reminder-time preferences; and start/end dates. “After
lunch” stays a meal label. The saved reminder preference is disabled, and the
user enables reminders separately after saving and granting notification permission.

## Maintenance

Medicine name, strength, description, notes, and the low-stock estimate
threshold can be edited. A unit stays fixed after a schedule or stock history
exists, which keeps historical quantities interpretable. Medicines can be
archived and restored without deleting schedule or stock records.

Editing a dose schedule creates a new version in the same schedule series.
The earlier version ends on the selected effective-from date, while the new
version keeps the original start date as its recurrence anchor. The medicine,
date, timing, and quantity snapshots already stored on past occurrences remain
unchanged. Schedule edits cannot be backdated; the selected effective date must
be on or after the current local date and after the current version began.

Pausing appends an open-ended dated pause period to a schedule. Resuming closes
the period the day before the resumed date; resuming on the start date removes
the empty pause. Past pause dates remain available for scheduling and history.
The list computes recorded stock from the transaction ledger. Dose consumption,
refills, and stock forecasting are introduced in later PRs.

## Verification

Tests cover atomic rollback, starting stock, multiple daily dose slots,
recurrence/timing snapshots, disabled reminder preferences, date and quantity
validation, close/reopen persistence, medicine edits, versioned schedule edits,
unit protection, archive/restore, pause/resume, and the browser registration
and schedule-edit flows.
