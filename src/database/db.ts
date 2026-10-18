import Dexie, { type Table, type Transaction } from 'dexie'
import type {
  DoseEvent,
  DoseOccurrence,
  DoseSchedule,
  Medicine,
  ReminderPreference,
  StockTransaction,
} from './models'
import { DATABASE_NAME, DATABASE_VERSION, SCHEMA_V1, SCHEMA_V2 } from './schema'

function rejectHistoryMutation() {
  throw new Error(
    'History is append-only. Add a correction or reversal record instead.',
  )
}

function validateStockTransaction(transaction: StockTransaction) {
  const delta = transaction.quantityDelta
  if (!Number.isSafeInteger(delta) || delta === 0) {
    throw new RangeError(
      'Stock delta must be non-zero safe integer milliunits.',
    )
  }
  if (
    (transaction.transactionType === 'initial' ||
      transaction.transactionType === 'refill') &&
    delta < 0
  ) {
    throw new RangeError('Initial stock and refills must be positive.')
  }
  if (
    transaction.transactionType === 'consumption' &&
    (delta > 0 || !transaction.doseEventId)
  ) {
    throw new RangeError(
      'Consumption requires a negative delta and a dose event.',
    )
  }
  if (
    transaction.transactionType === 'reversal' &&
    !transaction.reversesTransactionId
  ) {
    throw new RangeError(
      'A reversal must reference the original stock transaction.',
    )
  }
}

/** Construct without opening or seeding; callers control errors and lifecycle. */
export class MedTrackDatabase extends Dexie {
  medicines!: Table<Medicine, string>
  doseSchedules!: Table<DoseSchedule, string>
  doseOccurrences!: Table<DoseOccurrence, string>
  doseEvents!: Table<DoseEvent, string>
  stockTransactions!: Table<StockTransaction, string>
  reminderPreferences!: Table<ReminderPreference, string>
  private readonly historyRestoreTransactions = new WeakSet<Transaction>()

  constructor(name = DATABASE_NAME) {
    super(name)
    this.version(1).stores(SCHEMA_V1)
    this.version(DATABASE_VERSION)
      .stores(SCHEMA_V2)
      .upgrade((transaction) =>
        transaction
          .table('medicines')
          .toCollection()
          .modify((medicine) => {
            medicine.lowStockAlertsEnabled ??= false
            medicine.lastLowStockAlertDate ??= null
          }),
      )
    // Dexie encodes schema versions as native IndexedDB version * 10.
    // Its compatibility fallback can open a newer DB; refuse writes by old code.
    this.on(
      'ready',
      () => {
        if (this.backendDB().version > DATABASE_VERSION * 10) {
          throw new Error(
            'This database was created by a newer MedTrack version. Update the app before opening it.',
          )
        }
      },
      true,
    )
    this.doseEvents.hook('updating', rejectHistoryMutation)
    this.doseEvents.hook('deleting', (_key, _event, transaction) => {
      this.rejectHistoryDeletionUnlessRestoring(transaction)
    })
    this.stockTransactions.hook('updating', rejectHistoryMutation)
    this.stockTransactions.hook('deleting', (_key, _entry, transaction) => {
      this.rejectHistoryDeletionUnlessRestoring(transaction)
    })
    this.stockTransactions.hook('creating', (_key, transaction) =>
      validateStockTransaction(transaction),
    )
  }

  /** Only the explicit, atomic backup-restore transaction may clear audit rows. */
  authorizeHistoryRestore(transaction: Transaction): void {
    if (transaction.db !== this) {
      throw new Error('History restore requires this database transaction.')
    }
    this.historyRestoreTransactions.add(transaction)
  }

  private rejectHistoryDeletionUnlessRestoring(transaction: Transaction): void {
    if (this.historyRestoreTransactions.has(transaction)) return
    rejectHistoryMutation()
  }
}

export const db = new MedTrackDatabase()
