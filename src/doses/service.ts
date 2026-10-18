import { db, type MedTrackDatabase } from '../database/db'
import type {
  DoseEvent,
  DoseOccurrence,
  DoseStatus,
  StockTransaction,
} from '../database/models'
import type { Quantity } from '../database/quantity'

export interface DoseActionOptions {
  now?: string
  /** Reuse this ID when retrying the same user action. */
  operationId?: string
  idFactory?: () => string
}

export interface DoseActionResult {
  occurrence: DoseOccurrence
  event: DoseEvent
  stockTransaction: StockTransaction | null
  replayed: boolean
}

interface CommandContext {
  now: string
  operationId: string
  allocateId: () => string
}

function commandContext(options: DoseActionOptions): CommandContext {
  const now = options.now ?? new Date().toISOString()
  if (!Number.isFinite(Date.parse(now))) {
    throw new RangeError('Dose action time must be a valid timestamp.')
  }
  const idFactory = options.idFactory ?? (() => crypto.randomUUID())
  const operationId = options.operationId ?? idFactory()
  if (!operationId.trim()) {
    throw new RangeError('A non-empty operation ID is required.')
  }
  const allocated = new Set([operationId])
  return {
    now,
    operationId,
    allocateId() {
      const id = idFactory()
      if (!id.trim() || allocated.has(id)) {
        throw new RangeError(
          'ID generation must return unique non-empty values.',
        )
      }
      allocated.add(id)
      return id
    },
  }
}

async function replayIfExists(
  database: MedTrackDatabase,
  occurrenceId: string,
  operationId: string,
  expectedAction: DoseEvent['action'],
): Promise<DoseActionResult | null> {
  const [event, stockTransaction] = await Promise.all([
    database.doseEvents.where('operationId').equals(operationId).first(),
    database.stockTransactions.where('operationId').equals(operationId).first(),
  ])
  if (!event) {
    if (stockTransaction) {
      throw new RangeError(
        'Operation ID is already used by a stock transaction.',
      )
    }
    return null
  }
  if (event.occurrenceId !== occurrenceId || event.action !== expectedAction) {
    throw new RangeError(
      'Operation ID is already used for another dose action.',
    )
  }
  const occurrence = await database.doseOccurrences.get(occurrenceId)
  if (!occurrence) throw new RangeError('Dose occurrence was not found.')
  return {
    occurrence,
    event,
    stockTransaction: stockTransaction ?? null,
    replayed: true,
  }
}

function pendingOccurrence(
  occurrence: DoseOccurrence | undefined,
): DoseOccurrence {
  if (!occurrence) throw new RangeError('Dose occurrence was not found.')
  if (occurrence.status !== 'pending') {
    throw new RangeError(
      'This dose is already finalized. Undo it before changing the status.',
    )
  }
  return occurrence
}

async function stockBalance(
  database: MedTrackDatabase,
  medicineId: string,
): Promise<number> {
  const entries = await database.stockTransactions
    .where('medicineId')
    .equals(medicineId)
    .toArray()
  const balance = entries.reduce(
    (total, transaction) => total + transaction.quantityDelta,
    0,
  )
  if (!Number.isSafeInteger(balance)) {
    throw new RangeError(
      'Recorded stock balance is outside the supported range.',
    )
  }
  return balance
}

function makeEvent(
  id: string,
  operationId: string,
  occurrence: DoseOccurrence,
  action: DoseEvent['action'],
  newStatus: DoseStatus,
  now: string,
  values: {
    newQuantityTaken: Quantity | null
    newTakenAt: string | null
    newSnoozedUntil: string | null
    reversesEventId?: string | null
    note?: string | null
  },
): DoseEvent {
  return {
    id,
    operationId,
    occurrenceId: occurrence.id,
    action,
    previousStatus: occurrence.status,
    newStatus,
    previousQuantityTaken: occurrence.quantityTaken,
    newQuantityTaken: values.newQuantityTaken,
    previousTakenAt: occurrence.takenAt,
    newTakenAt: values.newTakenAt,
    previousSnoozedUntil: occurrence.snoozedUntil,
    newSnoozedUntil: values.newSnoozedUntil,
    reversesEventId: values.reversesEventId ?? null,
    recordedAt: now,
    note: values.note ?? null,
  }
}

export async function markDoseTaken(
  occurrenceId: string,
  database: MedTrackDatabase = db,
  options: DoseActionOptions = {},
): Promise<DoseActionResult> {
  const context = commandContext(options)
  return database.transaction(
    'rw',
    database.doseOccurrences,
    database.doseEvents,
    database.stockTransactions,
    async () => {
      const replay = await replayIfExists(
        database,
        occurrenceId,
        context.operationId,
        'taken',
      )
      if (replay) return replay
      const occurrence = pendingOccurrence(
        await database.doseOccurrences.get(occurrenceId),
      )
      const balance = await stockBalance(database, occurrence.medicineId)
      if (balance < occurrence.scheduledQuantity) {
        throw new RangeError(
          'Not enough stock to record this dose. Add stock before marking it taken.',
        )
      }

      const event = makeEvent(
        context.allocateId(),
        context.operationId,
        occurrence,
        'taken',
        'taken',
        context.now,
        {
          newQuantityTaken: occurrence.scheduledQuantity,
          newTakenAt: context.now,
          newSnoozedUntil: null,
        },
      )
      const updated: DoseOccurrence = {
        ...occurrence,
        status: 'taken',
        takenAt: context.now,
        quantityTaken: occurrence.scheduledQuantity,
        snoozedUntil: null,
        updatedAt: context.now,
      }
      const stockTransaction: StockTransaction = {
        id: context.allocateId(),
        operationId: context.operationId,
        medicineId: occurrence.medicineId,
        doseEventId: event.id,
        transactionType: 'consumption',
        quantityDelta: -occurrence.scheduledQuantity as Quantity,
        reversesTransactionId: null,
        note: null,
        createdAt: context.now,
      }

      await database.doseOccurrences.put(updated)
      await database.doseEvents.add(event)
      await database.stockTransactions.add(stockTransaction)
      return { occurrence: updated, event, stockTransaction, replayed: false }
    },
  )
}

export async function markDoseSkipped(
  occurrenceId: string,
  database: MedTrackDatabase = db,
  options: DoseActionOptions = {},
): Promise<DoseActionResult> {
  const context = commandContext(options)
  return database.transaction(
    'rw',
    database.doseOccurrences,
    database.doseEvents,
    database.stockTransactions,
    async () => {
      const replay = await replayIfExists(
        database,
        occurrenceId,
        context.operationId,
        'skipped',
      )
      if (replay) return replay
      const occurrence = pendingOccurrence(
        await database.doseOccurrences.get(occurrenceId),
      )
      const event = makeEvent(
        context.allocateId(),
        context.operationId,
        occurrence,
        'skipped',
        'skipped',
        context.now,
        {
          newQuantityTaken: null,
          newTakenAt: null,
          newSnoozedUntil: null,
        },
      )
      const updated: DoseOccurrence = {
        ...occurrence,
        status: 'skipped',
        takenAt: null,
        quantityTaken: null,
        snoozedUntil: null,
        updatedAt: context.now,
      }
      await database.doseOccurrences.put(updated)
      await database.doseEvents.add(event)
      return {
        occurrence: updated,
        event,
        stockTransaction: null,
        replayed: false,
      }
    },
  )
}

export async function snoozeDoseLater(
  occurrenceId: string,
  database: MedTrackDatabase = db,
  options: DoseActionOptions = {},
): Promise<DoseActionResult> {
  const context = commandContext(options)
  return database.transaction(
    'rw',
    database.doseOccurrences,
    database.doseEvents,
    database.stockTransactions,
    database.reminderPreferences,
    async () => {
      const replay = await replayIfExists(
        database,
        occurrenceId,
        context.operationId,
        'snoozed',
      )
      if (replay) return replay
      const occurrence = pendingOccurrence(
        await database.doseOccurrences.get(occurrenceId),
      )
      const preference = await database.reminderPreferences
        .where('scheduleId')
        .equals(occurrence.scheduleId)
        .first()
      const snoozeMinutes = preference?.snoozeMinutes ?? 15
      if (
        !Number.isSafeInteger(snoozeMinutes) ||
        snoozeMinutes < 1 ||
        snoozeMinutes > 24 * 60
      ) {
        throw new RangeError('Snooze duration must be from 1 to 1440 minutes.')
      }
      const snoozedUntil = new Date(
        Date.parse(context.now) + snoozeMinutes * 60_000,
      ).toISOString()
      const event = makeEvent(
        context.allocateId(),
        context.operationId,
        occurrence,
        'snoozed',
        'pending',
        context.now,
        {
          newQuantityTaken: occurrence.quantityTaken,
          newTakenAt: occurrence.takenAt,
          newSnoozedUntil: snoozedUntil,
          note: 'Later',
        },
      )
      const updated: DoseOccurrence = {
        ...occurrence,
        snoozedUntil,
        updatedAt: context.now,
      }
      await database.doseOccurrences.put(updated)
      await database.doseEvents.add(event)
      return {
        occurrence: updated,
        event,
        stockTransaction: null,
        replayed: false,
      }
    },
  )
}

export async function undoDose(
  occurrenceId: string,
  database: MedTrackDatabase = db,
  options: DoseActionOptions = {},
): Promise<DoseActionResult> {
  const context = commandContext(options)
  return database.transaction(
    'rw',
    database.doseOccurrences,
    database.doseEvents,
    database.stockTransactions,
    async () => {
      const replay = await replayIfExists(
        database,
        occurrenceId,
        context.operationId,
        'undone',
      )
      if (replay) return replay
      const occurrence = await database.doseOccurrences.get(occurrenceId)
      if (!occurrence) throw new RangeError('Dose occurrence was not found.')
      if (occurrence.status === 'pending') {
        throw new RangeError('This dose has no completed action to undo.')
      }
      const events = await database.doseEvents
        .where('occurrenceId')
        .equals(occurrenceId)
        .toArray()
      const reversedEventIds = new Set(
        events
          .filter((event) => event.action === 'undone' && event.reversesEventId)
          .map((event) => event.reversesEventId!),
      )
      const originalAction = occurrence.status
      const originals = events.filter(
        (event) =>
          event.action === originalAction &&
          event.newStatus === originalAction &&
          !reversedEventIds.has(event.id),
      )
      if (originals.length !== 1) {
        throw new RangeError(
          'Dose history does not contain one active action to undo.',
        )
      }
      const originalEvent = originals[0]

      let originalStock: StockTransaction | undefined
      if (originalAction === 'taken') {
        originalStock = await database.stockTransactions
          .where('doseEventId')
          .equals(originalEvent.id)
          .first()
        if (
          !originalStock ||
          originalStock.transactionType !== 'consumption' ||
          originalStock.medicineId !== occurrence.medicineId ||
          originalStock.quantityDelta !== -occurrence.quantityTaken!
        ) {
          throw new RangeError(
            'Dose history is missing its matching stock deduction.',
          )
        }
      }

      const event = makeEvent(
        context.allocateId(),
        context.operationId,
        occurrence,
        'undone',
        'pending',
        context.now,
        {
          newQuantityTaken: null,
          newTakenAt: null,
          newSnoozedUntil: null,
          reversesEventId: originalEvent.id,
        },
      )
      const updated: DoseOccurrence = {
        ...occurrence,
        status: 'pending',
        takenAt: null,
        quantityTaken: null,
        snoozedUntil: null,
        updatedAt: context.now,
      }
      const stockTransaction: StockTransaction | null = originalStock
        ? {
            id: context.allocateId(),
            operationId: context.operationId,
            medicineId: occurrence.medicineId,
            doseEventId: event.id,
            transactionType: 'reversal',
            quantityDelta: -originalStock.quantityDelta as Quantity,
            reversesTransactionId: originalStock.id,
            note: null,
            createdAt: context.now,
          }
        : null

      await database.doseOccurrences.put(updated)
      await database.doseEvents.add(event)
      if (stockTransaction) {
        await database.stockTransactions.add(stockTransaction)
      }
      return { occurrence: updated, event, stockTransaction, replayed: false }
    },
  )
}
