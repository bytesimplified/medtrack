import { db, type MedTrackDatabase } from '../database/db'
import type {
  DoseSchedule,
  DoseTiming,
  LocalDate,
  Medicine,
  MedicineUnit,
  PausePeriod,
  Recurrence,
  ReminderPreference,
  StockTransaction,
} from '../database/models'
import { parseQuantity } from '../database/quantity'
import { generateOccurrences } from '../scheduling/engine'

export interface DoseSlotInput {
  quantity: string
  timing: DoseTiming
}

export interface MedicineRegistrationInput {
  name: string
  strength: string
  description: string
  notes: string
  unit: MedicineUnit
  initialStock: string
  lowStockDays: number
  lowStockAlertsEnabled?: boolean
  recurrence: Recurrence
  startDate: LocalDate
  endDate: LocalDate | null
  timezone: string
  doses: DoseSlotInput[]
}

export type MedicineDetails = Pick<
  Medicine,
  | 'name'
  | 'strength'
  | 'description'
  | 'notes'
  | 'unit'
  | 'lowStockDays'
  | 'lowStockAlertsEnabled'
>

export interface ScheduleVersionInput {
  effectiveFrom: LocalDate
  endDate: LocalDate | null
  quantity: string
  recurrence: Recurrence
  timing: DoseTiming
}

export interface RegistrationResult {
  medicine: Medicine
  schedules: DoseSchedule[]
  initialStock: StockTransaction | null
  reminderPreferences: ReminderPreference[]
}

interface ServiceOptions {
  now?: string
  idFactory?: () => string
}

function optionalText(value: string, label: string, maxLength: number) {
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    throw new RangeError(
      label + ' must be ' + maxLength + ' characters or fewer.',
    )
  }
  return trimmed || null
}

function nonEmptyId(idFactory: () => string, allocatedIds: Set<string>) {
  const id = idFactory()
  if (!id.trim() || allocatedIds.has(id)) {
    throw new RangeError('ID generation must return unique non-empty values.')
  }
  allocatedIds.add(id)
  return id
}

function validateDetails(details: MedicineDetails): MedicineDetails {
  const name = details.name.trim()
  if (!name) throw new RangeError('Enter a medicine name.')
  if (name.length > 120) {
    throw new RangeError('Medicine name must be 120 characters or fewer.')
  }
  if (!['tablet', 'capsule', 'ml', 'other'].includes(details.unit)) {
    throw new RangeError('Choose a supported medicine unit.')
  }
  if (
    !Number.isSafeInteger(details.lowStockDays) ||
    details.lowStockDays < 0 ||
    details.lowStockDays > 3650
  ) {
    throw new RangeError(
      'Low-stock days must be a whole number from 0 to 3650.',
    )
  }
  if (
    details.lowStockAlertsEnabled !== undefined &&
    typeof details.lowStockAlertsEnabled !== 'boolean'
  ) {
    throw new RangeError(
      'Low-stock alert preference must be enabled or disabled.',
    )
  }
  return {
    name,
    strength: optionalText(details.strength ?? '', 'Strength', 120),
    description: optionalText(details.description ?? '', 'Description', 1000),
    notes: optionalText(details.notes ?? '', 'Notes', 1000),
    unit: details.unit,
    lowStockDays: details.lowStockDays,
    lowStockAlertsEnabled: details.lowStockAlertsEnabled ?? false,
  }
}

function ensureCalendarDate(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(label + ' must use YYYY-MM-DD.')
  }
  const [year, month, day] = value.split('-').map(Number)
  const ordinal = Date.UTC(year, month - 1, day)
  if (
    year < 1000 ||
    year > 9999 ||
    new Date(ordinal).toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError(label + ' must be a real calendar date.')
  }
  return ordinal
}

function previousCalendarDate(value: LocalDate): LocalDate {
  return new Date(ensureCalendarDate(value, 'Pause date') - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

export function localDateInTimeZone(
  instant = new Date(),
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): LocalDate {
  if (!Number.isFinite(instant.getTime())) {
    throw new RangeError('Date must be a valid instant.')
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''
  return part('year') + '-' + part('month') + '-' + part('day')
}

export async function registerMedicine(
  input: MedicineRegistrationInput,
  database: MedTrackDatabase = db,
  options: ServiceOptions = {},
): Promise<RegistrationResult> {
  const now = options.now ?? new Date().toISOString()
  if (!Number.isFinite(Date.parse(now))) {
    throw new RangeError('Creation time must be a valid timestamp.')
  }
  const details = validateDetails(input)
  const initialQuantity = parseQuantity(input.initialStock)
  if (initialQuantity < 0) {
    throw new RangeError('Starting stock cannot be negative.')
  }
  if (input.doses.length === 0) {
    throw new RangeError('Add at least one daily dose.')
  }
  ensureCalendarDate(input.startDate, 'Schedule start date')
  if (input.endDate !== null) {
    ensureCalendarDate(input.endDate, 'Schedule end date')
  }

  const idFactory = options.idFactory ?? (() => crypto.randomUUID())
  const allocatedIds = new Set<string>()
  const medicine: Medicine = {
    id: nonEmptyId(idFactory, allocatedIds),
    ...details,
    isArchived: false,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  const schedules: DoseSchedule[] = input.doses.map((dose) => {
    const quantityPerDose = parseQuantity(dose.quantity)
    if (quantityPerDose <= 0) {
      throw new RangeError('Dose quantity must be greater than zero.')
    }
    const schedule: DoseSchedule = {
      id: nonEmptyId(idFactory, allocatedIds),
      seriesId: nonEmptyId(idFactory, allocatedIds),
      version: 1,
      medicineId: medicine.id,
      quantityPerDose,
      recurrence: input.recurrence,
      timing: dose.timing,
      timezone: input.timezone,
      startDate: input.startDate,
      endDate: input.endDate,
      effectiveFrom: input.startDate,
      effectiveTo: null,
      pausePeriods: [],
      createdAt: now,
    }
    // Reuse the scheduling boundary's runtime validation before opening a
    // write transaction. A valid schedule can simply have no dose on day one.
    generateOccurrences(
      schedule,
      medicine,
      { startDate: input.startDate, endDate: input.startDate },
      now,
    )
    return schedule
  })

  const reminderPreferences: ReminderPreference[] = schedules.map(
    (schedule) => ({
      id: nonEmptyId(idFactory, allocatedIds),
      scheduleId: schedule.id,
      enabled: false,
      snoozeMinutes: 15,
      permissionStatus: 'prompt',
      updatedAt: now,
    }),
  )
  const initialStock: StockTransaction | null =
    initialQuantity === 0
      ? null
      : {
          id: nonEmptyId(idFactory, allocatedIds),
          operationId: nonEmptyId(idFactory, allocatedIds),
          medicineId: medicine.id,
          doseEventId: null,
          transactionType: 'initial',
          quantityDelta: initialQuantity,
          reversesTransactionId: null,
          note: null,
          createdAt: now,
        }

  await database.transaction(
    'rw',
    database.medicines,
    database.doseSchedules,
    database.stockTransactions,
    database.reminderPreferences,
    async () => {
      await database.medicines.add(medicine)
      await database.doseSchedules.bulkAdd(schedules)
      await database.reminderPreferences.bulkAdd(reminderPreferences)
      if (initialStock) await database.stockTransactions.add(initialStock)
    },
  )

  return { medicine, schedules, initialStock, reminderPreferences }
}

export async function updateMedicineDetails(
  medicineId: string,
  details: MedicineDetails,
  database: MedTrackDatabase = db,
  now = new Date().toISOString(),
): Promise<Medicine> {
  const validated = validateDetails(details)
  let updated: Medicine | undefined
  await database.transaction(
    'rw',
    database.medicines,
    database.doseSchedules,
    database.stockTransactions,
    async () => {
      const current = await database.medicines.get(medicineId)
      if (!current) throw new RangeError('Medicine was not found.')
      if (current.unit !== validated.unit) {
        const [hasSchedules, hasStockHistory] = await Promise.all([
          database.doseSchedules.where('medicineId').equals(medicineId).count(),
          database.stockTransactions
            .where('medicineId')
            .equals(medicineId)
            .count(),
        ])
        if (hasSchedules || hasStockHistory) {
          throw new RangeError(
            'Unit cannot change after a schedule or stock history exists.',
          )
        }
      }
      updated = {
        ...current,
        ...validated,
        lowStockAlertsEnabled:
          details.lowStockAlertsEnabled ??
          current.lowStockAlertsEnabled ??
          false,
        updatedAt: now,
      }
      await database.medicines.put(updated)
    },
  )
  return updated!
}

/**
 * Start a new schedule version while keeping the previous version and its
 * occurrence snapshots available for history. The original start date remains
 * the recurrence anchor across versions.
 */
export async function updateScheduleVersion(
  scheduleId: string,
  input: ScheduleVersionInput,
  database: MedTrackDatabase = db,
  options: ServiceOptions = {},
): Promise<DoseSchedule> {
  const now = options.now ?? new Date().toISOString()
  if (!Number.isFinite(Date.parse(now))) {
    throw new RangeError('Schedule update time must be a valid timestamp.')
  }
  ensureCalendarDate(input.effectiveFrom, 'Effective-from date')
  if (input.endDate !== null) {
    ensureCalendarDate(input.endDate, 'Schedule end date')
  }
  const quantityPerDose = parseQuantity(input.quantity)
  if (quantityPerDose <= 0) {
    throw new RangeError('Dose quantity must be greater than zero.')
  }

  const idFactory = options.idFactory ?? (() => crypto.randomUUID())
  let updated: DoseSchedule | undefined
  await database.transaction(
    'rw',
    database.medicines,
    database.doseSchedules,
    database.reminderPreferences,
    async () => {
      const current = await database.doseSchedules.get(scheduleId)
      if (!current) throw new RangeError('Schedule was not found.')
      if (current.effectiveTo !== null) {
        throw new RangeError('Only the active schedule version can be edited.')
      }
      const today = localDateInTimeZone(new Date(now), current.timezone)
      if (input.effectiveFrom < today) {
        throw new RangeError(
          'Schedule edits cannot start before the current local date.',
        )
      }
      if (input.effectiveFrom <= current.effectiveFrom) {
        throw new RangeError(
          'A new schedule version must start after the current version begins.',
        )
      }

      const medicine = await database.medicines.get(current.medicineId)
      if (!medicine) throw new RangeError('Medicine was not found.')
      const allocatedIds = new Set([current.id])
      const next: DoseSchedule = {
        ...current,
        id: nonEmptyId(idFactory, allocatedIds),
        version: current.version + 1,
        quantityPerDose,
        recurrence: input.recurrence,
        timing: input.timing,
        endDate: input.endDate,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
        createdAt: now,
      }
      if (!Number.isSafeInteger(next.version)) {
        throw new RangeError('Schedule version must be a positive integer.')
      }
      generateOccurrences(
        next,
        medicine,
        { startDate: input.effectiveFrom, endDate: input.effectiveFrom },
        now,
      )

      const currentPreference = await database.reminderPreferences
        .where('scheduleId')
        .equals(current.id)
        .first()
      const nextPreference: ReminderPreference = {
        id: nonEmptyId(idFactory, allocatedIds),
        scheduleId: next.id,
        enabled: currentPreference?.enabled ?? false,
        snoozeMinutes: currentPreference?.snoozeMinutes ?? 15,
        permissionStatus: currentPreference?.permissionStatus ?? 'prompt',
        updatedAt: now,
      }

      await database.doseSchedules.put({
        ...current,
        effectiveTo: input.effectiveFrom,
      })
      await database.doseSchedules.add(next)
      await database.reminderPreferences.add(nextPreference)
      updated = next
    },
  )
  return updated!
}

export async function setMedicineArchived(
  medicineId: string,
  archived: boolean,
  database: MedTrackDatabase = db,
  now = new Date().toISOString(),
): Promise<void> {
  await database.transaction('rw', database.medicines, async () => {
    const medicine = await database.medicines.get(medicineId)
    if (!medicine) throw new RangeError('Medicine was not found.')
    await database.medicines.put({
      ...medicine,
      isArchived: archived,
      archivedAt: archived ? now : null,
      updatedAt: now,
    })
  })
}

export async function setSchedulePaused(
  scheduleId: string,
  paused: boolean,
  today: LocalDate,
  database: MedTrackDatabase = db,
): Promise<DoseSchedule> {
  ensureCalendarDate(today, 'Pause date')
  let updated: DoseSchedule | undefined
  await database.transaction('rw', database.doseSchedules, async () => {
    const current = await database.doseSchedules.get(scheduleId)
    if (!current) throw new RangeError('Schedule was not found.')
    if (current.effectiveTo !== null) {
      throw new RangeError('Only the active schedule version can be changed.')
    }

    const pausePeriods: PausePeriod[] = [...current.pausePeriods]
    const openPauseIndex = pausePeriods.findLastIndex(
      (period) => period.endDate === null,
    )
    if (paused && openPauseIndex === -1) {
      pausePeriods.push({ startDate: today, endDate: null })
    } else if (!paused && openPauseIndex !== -1) {
      const openPause = pausePeriods[openPauseIndex]
      if (today <= openPause.startDate) {
        pausePeriods.splice(openPauseIndex, 1)
      } else {
        pausePeriods[openPauseIndex] = {
          ...openPause,
          endDate: previousCalendarDate(today),
        }
      }
    }

    updated = { ...current, pausePeriods }
    await database.doseSchedules.put(updated)
  })
  return updated!
}
