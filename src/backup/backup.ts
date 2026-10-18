import Dexie from 'dexie'
import { DATABASE_VERSION } from '../database/schema'
import { db, MedTrackDatabase } from '../database/db'
import type {
  DoseEvent,
  DoseOccurrence,
  DoseSchedule,
  Medicine,
  ReminderPreference,
  StockTransaction,
} from '../database/models'

export const BACKUP_FORMAT = 'medtrack-backup'
export const BACKUP_VERSION = 1
const MAX_BACKUP_CHARACTERS = 25_000_000

export interface BackupData {
  medicines: Medicine[]
  doseSchedules: DoseSchedule[]
  doseOccurrences: DoseOccurrence[]
  doseEvents: DoseEvent[]
  stockTransactions: StockTransaction[]
  reminderPreferences: ReminderPreference[]
}

export interface MedTrackBackup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  databaseVersion: number
  exportedAt: string
  data: BackupData
}

export interface RestoreCounts {
  medicines: number
  schedules: number
  occurrences: number
  events: number
  stockTransactions: number
  reminderPreferences: number
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupFormatError'
  }
}

function invalid(path: string): never {
  throw new BackupFormatError(`The backup contains invalid ${path}.`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(path)
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') invalid(path)
  return value
}

function nullableString(value: unknown, path: string): void {
  if (value !== null && typeof value !== 'string') invalid(path)
}

function bool(value: unknown, path: string): void {
  if (typeof value !== 'boolean') invalid(path)
}

function integer(value: unknown, path: string, min = 0): void {
  if (!Number.isSafeInteger(value) || (value as number) < min) invalid(path)
}

function timestamp(value: unknown, path: string, nullable = false): void {
  if (nullable && value === null) return
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    invalid(path)
  }
}

function localDate(value: unknown, path: string, nullable = false): void {
  if (nullable && value === null) return
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(path)
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    invalid(path)
  }
}

function oneOf(value: unknown, choices: readonly string[], path: string): void {
  if (typeof value !== 'string' || !choices.includes(value)) invalid(path)
}

function clock(value: unknown, path: string): void {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    invalid(path)
  }
}

function validateTiming(value: unknown, path: string): void {
  const timing = record(value, path)
  if (timing.type === 'custom') {
    clock(timing.time, `${path}.time`)
    return
  }
  if (timing.type !== 'meal') invalid(`${path}.type`)
  oneOf(
    timing.window,
    [
      'before-breakfast',
      'after-breakfast',
      'before-lunch',
      'after-lunch',
      'before-dinner',
      'after-dinner',
      'bedtime',
    ],
    `${path}.window`,
  )
  if (timing.reminderTime !== null)
    clock(timing.reminderTime, `${path}.reminderTime`)
}

function validateRecurrence(value: unknown, path: string): void {
  const recurrence = record(value, path)
  switch (recurrence.type) {
    case 'daily':
    case 'alternate':
      return
    case 'weekdays':
      if (!Array.isArray(recurrence.weekdays)) invalid(`${path}.weekdays`)
      for (const weekday of recurrence.weekdays) {
        integer(weekday, `${path}.weekdays`, 0)
        if ((weekday as number) > 6) invalid(`${path}.weekdays`)
      }
      return
    case 'interval':
      integer(recurrence.intervalDays, `${path}.intervalDays`, 1)
      return
    default:
      invalid(`${path}.type`)
  }
}

function validateRows<T>(
  rows: unknown,
  table: string,
  validate: (value: Record<string, unknown>, path: string) => void,
): T[] {
  if (!Array.isArray(rows)) invalid(table)
  const ids = new Set<string>()
  for (const [index, value] of rows.entries()) {
    const path = `${table}[${index}]`
    const item = record(value, path)
    const id = string(item.id, `${path}.id`)
    if (ids.has(id)) invalid(`${table} duplicate IDs`)
    ids.add(id)
    validate(item, path)
  }
  return rows as T[]
}

function validateMedicine(item: Record<string, unknown>, path: string): void {
  string(item.name, `${path}.name`)
  oneOf(item.unit, ['tablet', 'capsule', 'ml', 'other'], `${path}.unit`)
  integer(item.lowStockDays, `${path}.lowStockDays`, 0)
  if ((item.lowStockDays as number) > 3650) invalid(`${path}.lowStockDays`)
  bool(item.isArchived, `${path}.isArchived`)
  timestamp(item.createdAt, `${path}.createdAt`)
  timestamp(item.updatedAt, `${path}.updatedAt`)
  timestamp(item.archivedAt, `${path}.archivedAt`, true)
  for (const key of ['strength', 'description', 'notes']) {
    nullableString(item[key], `${path}.${key}`)
  }
  if (item.lowStockAlertsEnabled !== undefined) {
    bool(item.lowStockAlertsEnabled, `${path}.lowStockAlertsEnabled`)
  }
  if (item.lastLowStockAlertDate !== undefined) {
    localDate(item.lastLowStockAlertDate, `${path}.lastLowStockAlertDate`, true)
  }
}

function validateSchedule(item: Record<string, unknown>, path: string): void {
  string(item.medicineId, `${path}.medicineId`)
  string(item.seriesId, `${path}.seriesId`)
  integer(item.version, `${path}.version`, 1)
  integer(item.quantityPerDose, `${path}.quantityPerDose`, 1)
  validateRecurrence(item.recurrence, `${path}.recurrence`)
  validateTiming(item.timing, `${path}.timing`)
  string(item.timezone, `${path}.timezone`)
  localDate(item.startDate, `${path}.startDate`)
  localDate(item.effectiveFrom, `${path}.effectiveFrom`)
  localDate(item.endDate, `${path}.endDate`, true)
  localDate(item.effectiveTo, `${path}.effectiveTo`, true)
  timestamp(item.createdAt, `${path}.createdAt`)
  if (!Array.isArray(item.pausePeriods)) invalid(`${path}.pausePeriods`)
  for (const [index, value] of item.pausePeriods.entries()) {
    const pause = record(value, `${path}.pausePeriods[${index}]`)
    localDate(pause.startDate, `${path}.pausePeriods[${index}].startDate`)
    localDate(pause.endDate, `${path}.pausePeriods[${index}].endDate`, true)
  }
}

function validateOccurrence(item: Record<string, unknown>, path: string): void {
  string(item.scheduleId, `${path}.scheduleId`)
  string(item.medicineId, `${path}.medicineId`)
  string(item.medicineName, `${path}.medicineName`)
  oneOf(item.unit, ['tablet', 'capsule', 'ml', 'other'], `${path}.unit`)
  localDate(item.scheduledDate, `${path}.scheduledDate`)
  integer(item.scheduledQuantity, `${path}.scheduledQuantity`, 1)
  validateTiming(item.timing, `${path}.timing`)
  string(item.timezone, `${path}.timezone`)
  oneOf(item.status, ['pending', 'taken', 'skipped'], `${path}.status`)
  timestamp(item.takenAt, `${path}.takenAt`, true)
  if (item.quantityTaken !== null)
    integer(item.quantityTaken, `${path}.quantityTaken`, 1)
  timestamp(item.snoozedUntil, `${path}.snoozedUntil`, true)
  timestamp(item.createdAt, `${path}.createdAt`)
  timestamp(item.updatedAt, `${path}.updatedAt`)
}

function validateEvent(item: Record<string, unknown>, path: string): void {
  string(item.operationId, `${path}.operationId`)
  string(item.occurrenceId, `${path}.occurrenceId`)
  oneOf(
    item.action,
    ['taken', 'skipped', 'snoozed', 'undone', 'corrected'],
    `${path}.action`,
  )
  oneOf(
    item.previousStatus,
    ['pending', 'taken', 'skipped'],
    `${path}.previousStatus`,
  )
  oneOf(item.newStatus, ['pending', 'taken', 'skipped'], `${path}.newStatus`)
  for (const key of ['previousQuantityTaken', 'newQuantityTaken']) {
    if (item[key] !== null) integer(item[key], `${path}.${key}`, 1)
  }
  for (const key of [
    'previousTakenAt',
    'newTakenAt',
    'previousSnoozedUntil',
    'newSnoozedUntil',
  ]) {
    if (item[key] !== undefined) timestamp(item[key], `${path}.${key}`, true)
  }
  nullableString(item.reversesEventId, `${path}.reversesEventId`)
  timestamp(item.recordedAt, `${path}.recordedAt`)
  nullableString(item.note, `${path}.note`)
}

function validateStockTransaction(
  item: Record<string, unknown>,
  path: string,
): void {
  string(item.operationId, `${path}.operationId`)
  string(item.medicineId, `${path}.medicineId`)
  nullableString(item.doseEventId, `${path}.doseEventId`)
  oneOf(
    item.transactionType,
    ['initial', 'consumption', 'refill', 'adjustment', 'reversal'],
    `${path}.transactionType`,
  )
  if (!Number.isSafeInteger(item.quantityDelta) || item.quantityDelta === 0) {
    invalid(`${path}.quantityDelta`)
  }
  nullableString(item.reversesTransactionId, `${path}.reversesTransactionId`)
  nullableString(item.note, `${path}.note`)
  timestamp(item.createdAt, `${path}.createdAt`)
}

function validateReminder(item: Record<string, unknown>, path: string): void {
  string(item.scheduleId, `${path}.scheduleId`)
  bool(item.enabled, `${path}.enabled`)
  integer(item.snoozeMinutes, `${path}.snoozeMinutes`, 1)
  if ((item.snoozeMinutes as number) > 1440) invalid(`${path}.snoozeMinutes`)
  oneOf(
    item.permissionStatus,
    ['prompt', 'granted', 'denied', 'unsupported'],
    `${path}.permissionStatus`,
  )
  timestamp(item.updatedAt, `${path}.updatedAt`)
}

function ensureUnique<T>(
  values: T[],
  key: (value: T) => string | null,
  path: string,
): void {
  const seen = new Set<string>()
  for (const value of values) {
    const valueKey = key(value)
    if (valueKey === null) continue
    if (seen.has(valueKey)) invalid(`${path} duplicate values`)
    seen.add(valueKey)
  }
}

function validateBackup(value: unknown): MedTrackBackup {
  const backup = record(value, 'backup document')
  if (backup.format !== BACKUP_FORMAT) invalid('backup format')
  if (backup.version !== BACKUP_VERSION) {
    throw new BackupFormatError('This backup format version is not supported.')
  }
  integer(backup.databaseVersion, 'database version', 1)
  if ((backup.databaseVersion as number) > DATABASE_VERSION) {
    throw new BackupFormatError(
      'This backup was created by a newer MedTrack version. Update the app before restoring it.',
    )
  }
  timestamp(backup.exportedAt, 'export date')
  const source = record(backup.data, 'backup data')
  const data: BackupData = {
    medicines: validateRows(source.medicines, 'medicines', validateMedicine),
    doseSchedules: validateRows(
      source.doseSchedules,
      'doseSchedules',
      validateSchedule,
    ),
    doseOccurrences: validateRows(
      source.doseOccurrences,
      'doseOccurrences',
      validateOccurrence,
    ),
    doseEvents: validateRows(source.doseEvents, 'doseEvents', validateEvent),
    stockTransactions: validateRows(
      source.stockTransactions,
      'stockTransactions',
      validateStockTransaction,
    ),
    reminderPreferences: validateRows(
      source.reminderPreferences,
      'reminderPreferences',
      validateReminder,
    ),
  }

  ensureUnique(
    data.doseSchedules,
    (item) => `${item.seriesId}:${item.version}`,
    'schedules',
  )
  ensureUnique(
    data.doseOccurrences,
    (item) => `${item.scheduleId}:${item.scheduledDate}`,
    'occurrences',
  )
  ensureUnique(data.doseEvents, (item) => item.operationId, 'dose events')
  ensureUnique(
    data.stockTransactions,
    (item) => item.operationId,
    'stock transactions',
  )
  ensureUnique(
    data.stockTransactions,
    (item) => item.doseEventId,
    'dose event references',
  )
  ensureUnique(
    data.stockTransactions,
    (item) => item.reversesTransactionId,
    'reversal references',
  )
  ensureUnique(
    data.reminderPreferences,
    (item) => item.scheduleId,
    'reminder preferences',
  )

  const medicineIds = new Set(data.medicines.map((item) => item.id))
  const scheduleIds = new Set(data.doseSchedules.map((item) => item.id))
  const occurrenceIds = new Set(data.doseOccurrences.map((item) => item.id))
  const eventIds = new Set(data.doseEvents.map((item) => item.id))
  const transactionIds = new Set(data.stockTransactions.map((item) => item.id))
  for (const item of data.doseSchedules) {
    if (!medicineIds.has(item.medicineId))
      invalid('schedule medicine references')
  }
  for (const item of data.doseOccurrences) {
    if (
      !medicineIds.has(item.medicineId) ||
      !scheduleIds.has(item.scheduleId)
    ) {
      invalid('occurrence references')
    }
  }
  for (const item of data.doseEvents) {
    if (!occurrenceIds.has(item.occurrenceId)) invalid('dose event references')
    if (item.reversesEventId && !eventIds.has(item.reversesEventId)) {
      invalid('reversed dose event references')
    }
  }
  for (const item of data.stockTransactions) {
    if (!medicineIds.has(item.medicineId)) invalid('stock medicine references')
    if (item.doseEventId && !eventIds.has(item.doseEventId)) {
      invalid('stock dose event references')
    }
    if (
      item.reversesTransactionId &&
      !transactionIds.has(item.reversesTransactionId)
    ) {
      invalid('reversal transaction references')
    }
  }
  for (const item of data.reminderPreferences) {
    if (!scheduleIds.has(item.scheduleId))
      invalid('reminder schedule references')
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    databaseVersion: backup.databaseVersion as number,
    exportedAt: backup.exportedAt as string,
    data,
  }
}

export async function createBackup(
  database: MedTrackDatabase = db,
  exportedAt = new Date().toISOString(),
): Promise<MedTrackBackup> {
  timestamp(exportedAt, 'export date')
  return database.transaction(
    'r',
    [
      database.medicines,
      database.doseSchedules,
      database.doseOccurrences,
      database.doseEvents,
      database.stockTransactions,
      database.reminderPreferences,
    ],
    async () => ({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      databaseVersion: DATABASE_VERSION,
      exportedAt,
      data: {
        medicines: await database.medicines.toArray(),
        doseSchedules: await database.doseSchedules.toArray(),
        doseOccurrences: await database.doseOccurrences.toArray(),
        doseEvents: await database.doseEvents.toArray(),
        stockTransactions: await database.stockTransactions.toArray(),
        reminderPreferences: await database.reminderPreferences.toArray(),
      },
    }),
  )
}

export function serializeBackup(backup: MedTrackBackup): string {
  return JSON.stringify(backup, null, 2)
}

export async function restoreBackup(
  content: string,
  database: MedTrackDatabase = db,
): Promise<RestoreCounts> {
  if (content.length > MAX_BACKUP_CHARACTERS) {
    throw new BackupFormatError('This backup file is too large to restore.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new BackupFormatError('This file is not valid JSON.')
  }
  const backup = validateBackup(parsed)
  const { data } = backup
  await database.transaction(
    'rw',
    [
      database.medicines,
      database.doseSchedules,
      database.doseOccurrences,
      database.doseEvents,
      database.stockTransactions,
      database.reminderPreferences,
    ],
    async () => {
      if (database instanceof MedTrackDatabase) {
        const transaction = Dexie.currentTransaction
        if (!transaction)
          throw new Error('Restore transaction was not available.')
        database.authorizeHistoryRestore(transaction)
      }
      await database.doseEvents.clear()
      await database.stockTransactions.clear()
      await database.doseOccurrences.clear()
      await database.reminderPreferences.clear()
      await database.doseSchedules.clear()
      await database.medicines.clear()
      if (data.medicines.length)
        await database.medicines.bulkAdd(data.medicines)
      if (data.doseSchedules.length)
        await database.doseSchedules.bulkAdd(data.doseSchedules)
      if (data.doseOccurrences.length)
        await database.doseOccurrences.bulkAdd(data.doseOccurrences)
      if (data.doseEvents.length)
        await database.doseEvents.bulkAdd(data.doseEvents)
      if (data.stockTransactions.length)
        await database.stockTransactions.bulkAdd(data.stockTransactions)
      if (data.reminderPreferences.length)
        await database.reminderPreferences.bulkAdd(data.reminderPreferences)
    },
  )
  return {
    medicines: data.medicines.length,
    schedules: data.doseSchedules.length,
    occurrences: data.doseOccurrences.length,
    events: data.doseEvents.length,
    stockTransactions: data.stockTransactions.length,
    reminderPreferences: data.reminderPreferences.length,
  }
}
