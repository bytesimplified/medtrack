# Local database contract

`src/database/db.ts` exports a lazy `db` instance and `MedTrackDatabase` class.
Nothing opens or seeds a database during module import. A feature may explicitly
`await db.open()` and surface errors; table operations also use Dexie's lazy open.
UI integration starts in the medicine-registration PR. No example medicines are
added to a real user's database by this PR.

## Tables and indexes

| Table                 | Purpose                                                                           | Integrity constraints                                                             |
| --------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `medicines`           | Medicine metadata; no mutable stock field                                         | UUID primary key                                                                  |
| `doseSchedules`       | One dose slot, with effective versions                                            | Unique series ID + version                                                        |
| `doseOccurrences`     | Planned dose plus historical label, quantity, timing, unit and timezone snapshots | Unique schedule version ID + scheduled local date                                 |
| `doseEvents`          | Append-only status, quantity and timestamp changes                                | Unique operation ID for retry detection                                           |
| `stockTransactions`   | Append-only signed stock ledger                                                   | Unique operation ID, non-null dose event ID, and non-null reversed transaction ID |
| `reminderPreferences` | Per-schedule enablement and snooze preference                                     | Unique schedule ID                                                                |

Secondary indexes support per-medicine schedules, date/status queries, and
chronological event/stock history. Boolean archive/pause flags are not indexed:
IndexedDB does not accept boolean index keys. Null event/reversal references
are not indexed, allowing multiple independent initial/refill entries.

The database enforces uniqueness, append-only event/stock updates and deletes,
and basic stock-delta validity. `put`, `update`, `delete`, and `clear` on history
tables cannot rewrite existing history. Corrections append new records.

IndexedDB does **not** provide foreign keys or complete application validation.
Service-layer commands validate referenced IDs, recurrence values,
non-overlapping schedule effective periods, timestamp/status consistency,
non-negative resulting balances, and exact matching reversals. The database
constraint is backed by dose-service operation checks: retries return the
recorded result rather than exposing a duplicate-key error.

## Quantities and time

All dose and stock quantities use safe integer **milliunits**. One tablet,
capsule, ml, or other unit is 1,000 milliunits. For example:

- `parseQuantity('30')` = 30,000 (initial stock of 30 tablets).
- `parseQuantity('0.5')` = 500 (half a tablet).
- `parseQuantity('-1')` = -1,000 (one consumed tablet).
- `formatQuantity(...)` converts stored quantities to display text.

The parser accepts decimal text with up to three decimal places, rejects
unsupported precision and unsafe ranges, and avoids binary-decimal arithmetic.
Dose registration must require a positive quantity; stock deltas are signed and
nonzero. Ledger aggregation must also check safe-integer bounds. Never display
raw milliunits or pass them directly to a user-facing dose input.

Local dates use `YYYY-MM-DD`, local clock times use `HH:mm`, and timestamps use
UTC ISO-8601 strings. Each schedule stores an IANA timezone. Date/time strings,
weekdays, intervals, and positive doses are validated by scheduling and medicine services.
Meal windows have optional reminder times; they do not imply a clock time.

A schedule's `startDate` remains the recurrence anchor. `effectiveFrom` is
inclusive and `effectiveTo` exclusive for a particular version. Pauses are
inclusive dated periods (null end = ongoing), preserving past paused days for
analytics. A new effective version must not rewrite existing occurrences.
Pending past occurrences remain unconfirmed; snoozing is stored separately.

## Atomic writes

Use a single Dexie read/write transaction for each related operation:

```ts
await db.transaction(
  'rw',
  db.doseOccurrences,
  db.doseEvents,
  db.stockTransactions,
  async () => {
    // Validate, update occurrence, append event, append stock effect.
    // Let failures reject the transaction so every write rolls back.
  },
)
```

Generate UUIDs and collect user input before starting transactions. Avoid
unrelated network, timers, or UI work inside an IndexedDB transaction. Refill,
undo, and dose services follow this transaction boundary.

## Schema upgrades and data safety

Version 1 is the first released schema; there is no older app schema to migrate.
Keep `SCHEMA_V1` immutable after release. To evolve it, append a version with
`.stores(...)` and an explicit `.upgrade(...)` only when record transformation
is required. Preserve IDs, quantities, timestamps, and historical ledger data.
Do not delete/recreate databases to handle upgrade failures.

A test upgrades a populated v1 database with an additional index and verifies
that metadata and stock survive. The production database refuses to open a
newer schema version, including Dexie's forward-compatibility fallback. Users
must update their app; their existing records are preserved. `ready` validation
is sticky across reopen attempts. Dexie maps its schema version to native
IndexedDB version multiplied by ten, which the compatibility guard checks.

A storage failure must be surfaced instead of silently falling back to temporary
memory or resetting data. Persistence survives normal close/reopen, but browser
site-data clearing or eviction can remove IndexedDB. The app includes JSON
backup/restore, offline loading, storage-status reporting, and error recovery.

## Tests

`npm test` uses `fake-indexeddb` only in database tests. Coverage includes empty
creation, persistence on reopen, unique dose/version/operation constraints,
nullable indexes, atomic rollback, immutable history, snapshot preservation,
stock input validation, fixed precision, non-destructive upgrades, and refusal
to use a newer schema. Android CI checks installation and launch; physical-device
storage lifecycle checks remain on the release checklist.
