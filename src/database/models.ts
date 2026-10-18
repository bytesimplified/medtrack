import type { Quantity } from './quantity'

/** Local dates/times have no UTC offset; timestamps are UTC ISO-8601 strings. */
export type LocalDate = string // YYYY-MM-DD; validate in the scheduling boundary.
export type LocalTime = string // HH:mm
export type Timestamp = string // ISO-8601 UTC instant
export type Id = string // UUID, generated before entering an atomic write.
export type MedicineUnit = 'tablet' | 'capsule' | 'ml' | 'other'
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // Sunday = 0
export type MealWindow =
  | 'before-breakfast'
  | 'after-breakfast'
  | 'before-lunch'
  | 'after-lunch'
  | 'before-dinner'
  | 'after-dinner'
  | 'bedtime'

export interface Medicine {
  id: Id
  name: string
  strength: string | null
  description: string | null
  notes: string | null
  unit: MedicineUnit
  lowStockDays: number
  isArchived: boolean
  archivedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
  // No mutable stock field: balance comes from StockTransaction quantities.
}

export type Recurrence =
  | { type: 'daily' }
  | { type: 'alternate' }
  | { type: 'weekdays'; weekdays: Weekday[] }
  | { type: 'interval'; intervalDays: number }

export type DoseTiming =
  | { type: 'meal'; window: MealWindow; reminderTime: LocalTime | null }
  | { type: 'custom'; time: LocalTime }

/** Inclusive local-date period; null end means still paused. */
export interface PausePeriod {
  startDate: LocalDate
  endDate: LocalDate | null
}

export interface DoseSchedule {
  id: Id
  medicineId: Id
  /** Stable identity across effective versions; one series = one daily dose slot. */
  seriesId: Id
  version: number
  quantityPerDose: Quantity
  recurrence: Recurrence
  timing: DoseTiming
  timezone: string // IANA name, e.g. Asia/Kolkata
  startDate: LocalDate // Original recurrence anchor; preserve across edits.
  endDate: LocalDate | null
  effectiveFrom: LocalDate // Inclusive applicability of this version.
  effectiveTo: LocalDate | null // Exclusive; null is ongoing.
  pausePeriods: PausePeriod[] // Preserve pause history, rather than a mutable flag.
  createdAt: Timestamp
}

export interface ReminderPreference {
  id: Id
  scheduleId: Id
  enabled: boolean
  snoozeMinutes: number
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unsupported'
  updatedAt: Timestamp
  // Clock time is owned by DoseSchedule.timing; permission is last observed only.
}

export type DoseStatus = 'pending' | 'taken' | 'skipped'

export interface DoseOccurrence {
  id: Id
  scheduleId: Id // Version-specific; unique together with scheduledDate.
  medicineId: Id
  scheduledDate: LocalDate
  /** Snapshot fields preserve history after medicine and schedule edits. */
  medicineName: string
  unit: MedicineUnit
  scheduledQuantity: Quantity
  timing: DoseTiming
  timezone: string
  status: DoseStatus
  takenAt: Timestamp | null
  quantityTaken: Quantity | null
  snoozedUntil: Timestamp | null // Does not change pending/taken/skipped.
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Append-only record. Undo/correction appends a new event, never edits one. */
export interface DoseEvent {
  readonly id: Id
  readonly operationId: Id // Unique retry token for a logical command.
  readonly occurrenceId: Id
  readonly action: 'taken' | 'skipped' | 'undone' | 'corrected'
  readonly previousStatus: DoseStatus
  readonly newStatus: DoseStatus
  readonly previousQuantityTaken: Quantity | null
  readonly newQuantityTaken: Quantity | null
  readonly previousTakenAt: Timestamp | null
  readonly newTakenAt: Timestamp | null
  readonly reversesEventId: Id | null
  readonly recordedAt: Timestamp
  readonly note: string | null
}

/** Signed milliunits; stock balance is the sum of this append-only ledger. */
export interface StockTransaction {
  readonly id: Id
  readonly operationId: Id
  readonly medicineId: Id
  readonly doseEventId: Id | null
  readonly transactionType:
    'initial' | 'consumption' | 'refill' | 'adjustment' | 'reversal'
  readonly quantityDelta: Quantity
  readonly reversesTransactionId: Id | null
  readonly note: string | null
  readonly createdAt: Timestamp
}
