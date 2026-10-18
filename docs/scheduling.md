# Scheduling engine

`src/scheduling/engine.ts` is a pure local-date recurrence service. It creates
pending dose occurrences for one schedule version and a bounded date window;
it does not open the database, write records, or request notification
permissions.

## Date rules

The requested range includes both endpoints and is limited to 366 calendar
days per call. A schedule's original `startDate` anchors alternate-day and
every-X-days intervals. Daily, weekday, and interval rules are evaluated on
local calendar dates, not elapsed 24-hour periods. Weekdays use Sunday = 0.
Leap days and month/year boundaries are ordinary calendar days.

`endDate` and pause periods include their end dates. Schedule versions apply
from `effectiveFrom` (inclusive) until `effectiveTo` (exclusive). Paused dates
do not generate an occurrence. Input dates are validated as real Gregorian
dates, and each schedule timezone must be a supported IANA timezone.

The engine iterates dates with UTC calendar arithmetic so a daylight-saving
clock change cannot skip or duplicate a local date. It keeps the schedule's
timezone on each occurrence for later display and notification work.

## Timing and persistence

Meal windows such as “after lunch” are labels, not implied clock times. A meal
window can separately carry an optional reminder time. Custom timing carries
a clock time. This PR stores these values on each occurrence, but does not
compute a notification instant or schedule an alert.

IDs are deterministic for a schedule ID and local date, matching the database's
unique schedule/date constraint. Re-generating a range therefore produces the
same IDs; the persistence caller can use the unique key to avoid duplicate
slots. Creation and update timestamps are injectable for deterministic tests.
Existing completed occurrences must never be overwritten by regeneration.

## Verification

`npm test -- src/scheduling/engine.test.ts` covers daily, alternate-day,
selected-weekday and every-X-days recurrence; inclusive and exclusive
boundaries; pauses; multiple dose slots; leap day; DST; stable snapshots; and
invalid dates, times, recurrence values, quantities, timezones, and oversized
ranges.
