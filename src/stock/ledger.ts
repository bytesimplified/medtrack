import { db, type MedTrackDatabase } from '../database/db'
import type { StockTransaction } from '../database/models'
import { parseQuantity, type Quantity } from '../database/quantity'

export interface StockCommandOptions {
  now?: string
  idFactory?: () => string
  /** Supply the same ID again to safely retry a command after an uncertain result. */
  operationId?: string
}

export interface StockCommandResult {
  transaction: StockTransaction
  replayed: boolean
}

function validTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new RangeError(label + ' must be a valid timestamp.')
  }
}

function cleanNote(note: string, required: boolean): string | null {
  const value = note.trim()
  if (required && !value) throw new RangeError('Enter an adjustment reason.')
  if (value.length > 240) {
    throw new RangeError('Stock notes must be 240 characters or fewer.')
  }
  return value || null
}

function stockBalance(rows: StockTransaction[]): Quantity | null {
  const total = rows.reduce((sum, row) => sum + row.quantityDelta, 0)
  return Number.isSafeInteger(total) ? (total as Quantity) : null
}

function commandId(options: StockCommandOptions): string {
  const id = options.operationId ?? options.idFactory?.() ?? crypto.randomUUID()
  if (!id.trim()) throw new RangeError('Operation ID must not be empty.')
  return id
}

function transactionId(options: StockCommandOptions): string {
  const id = options.idFactory?.() ?? crypto.randomUUID()
  if (!id.trim()) throw new RangeError('Transaction ID must not be empty.')
  return id
}

async function recordStockChange(
  medicineId: string,
  type: 'refill' | 'adjustment',
  quantityDelta: Quantity,
  note: string | null,
  database: MedTrackDatabase,
  options: StockCommandOptions,
): Promise<StockCommandResult> {
  const now = options.now ?? new Date().toISOString()
  validTimestamp(now, 'Stock change time')
  const operationId = commandId(options)
  let result: StockCommandResult | undefined

  await database.transaction(
    'rw',
    database.medicines,
    database.stockTransactions,
    async () => {
      const existing = await database.stockTransactions
        .where('operationId')
        .equals(operationId)
        .first()
      if (existing) {
        if (
          existing.medicineId !== medicineId ||
          existing.transactionType !== type ||
          existing.quantityDelta !== quantityDelta ||
          existing.note !== note
        ) {
          throw new RangeError(
            'This operation ID was already used for a different stock change.',
          )
        }
        result = { transaction: existing, replayed: true }
        return
      }

      const medicine = await database.medicines.get(medicineId)
      if (!medicine) throw new RangeError('Medicine was not found.')
      if (medicine.isArchived) {
        throw new RangeError('Restore this medicine before changing its stock.')
      }

      const rows = await database.stockTransactions
        .where('medicineId')
        .equals(medicineId)
        .toArray()
      const balance = stockBalance(rows)
      if (balance === null) {
        throw new RangeError('Current stock cannot be safely calculated.')
      }
      const nextBalance = balance + quantityDelta
      if (!Number.isSafeInteger(nextBalance)) {
        throw new RangeError('This change exceeds the supported stock range.')
      }
      if (type === 'adjustment' && nextBalance < 0) {
        throw new RangeError('An adjustment cannot make stock negative.')
      }

      const transaction: StockTransaction = {
        id: transactionId(options),
        operationId,
        medicineId,
        doseEventId: null,
        transactionType: type,
        quantityDelta,
        reversesTransactionId: null,
        note,
        createdAt: now,
      }
      await database.stockTransactions.add(transaction)
      result = { transaction, replayed: false }
    },
  )

  return result!
}

export async function refillStock(
  medicineId: string,
  quantity: string,
  note = '',
  database: MedTrackDatabase = db,
  options: StockCommandOptions = {},
): Promise<StockCommandResult> {
  const quantityDelta = parseQuantity(quantity)
  if (quantityDelta <= 0) {
    throw new RangeError('Refill quantity must be greater than zero.')
  }
  return recordStockChange(
    medicineId,
    'refill',
    quantityDelta,
    cleanNote(note, false),
    database,
    options,
  )
}

export async function adjustStock(
  medicineId: string,
  quantityDeltaText: string,
  reason: string,
  database: MedTrackDatabase = db,
  options: StockCommandOptions = {},
): Promise<StockCommandResult> {
  const quantityDelta = parseQuantity(quantityDeltaText)
  if (quantityDelta === 0) {
    throw new RangeError('Adjustment quantity cannot be zero.')
  }
  return recordStockChange(
    medicineId,
    'adjustment',
    quantityDelta,
    cleanNote(reason, true),
    database,
    options,
  )
}

export function listStockHistory(rows: StockTransaction[]): StockTransaction[] {
  return [...rows].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  )
}
