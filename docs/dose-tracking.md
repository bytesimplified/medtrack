# Dose tracking and stock ledger

Today actions run through `src/doses/service.ts`; UI components do not update
occurrence status or stock directly. Each command receives an operation ID.
Retrying the same operation returns its existing audit event and transaction,
while reusing that ID for a different occurrence or action is rejected.

## Take and Skip

Take requires enough ledger balance for the occurrence's scheduled quantity.
The service appends a `taken` event, updates the occurrence snapshot, and adds
one negative `consumption` transaction in the same IndexedDB transaction. It
never partially consumes stock. Skip appends a `skipped` event and updates the
occurrence, without changing stock. A finalized occurrence cannot be confirmed
again until it is undone.

## Later and Undo

Later reads the schedule's saved snooze duration (15 minutes when no preference
exists), records a `snoozed` event, and updates only `snoozedUntil`; status stays
pending and stock stays unchanged. This records the requested snooze time for
the later reminder integration; it does not schedule a platform notification.

Undo appends an `undone` event that references the taken or skipped event. For
a taken dose, it also appends a positive `reversal` transaction pointing to
the exact consumption transaction. For a skipped dose, it only returns the
occurrence to pending. Neither audit history nor the stock ledger is edited or
deleted.

## Verification

Tests cover sufficient and insufficient stock, atomic rollback, idempotent
Take/Skip/Later/Undo operations, operation-ID conflicts, skipped-dose Undo,
stock reversal, and unchanged stock for Skip and Later. The browser smoke flow
checks Take, stock deduction, Undo, Later, and Skip on the Today screen.
