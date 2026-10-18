import type {
  DoseOccurrence,
  DoseSchedule,
  LocalDate,
  Medicine,
  Weekday,
} from '../database/models'
import type { Quantity } from '../database/quantity'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 366
const WEEKDAYS = new Set<number>([0, 1, 2, 3, 4, 5, 6])
const MEAL_WINDOWS = new Set([
  'before-breakfast',
  'after-breakfast',
  'before-lunch',
  'after-lunch',
  'before-dinner',
  'after-dinner',
  'bedtime',
])

export interface LocalDateRange {
  startDate: LocalDate
  endDate: LocalDate
}

function dateOrdinal(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(label + ' must use YYYY-MM-DD.')
  }

  const [year, month, day] = value.split('-').map(Number)
  if (year < 1000 || year > 9999) {
    throw new RangeError(label + ' must have a year from 1000 to 9999.')
  }
  const ordinal = Date.UTC(year, month - 1, day)
  if (new Date(ordinal).toISOString().slice(0, 10) !== value) {
    throw new RangeError(label + ' is not a real calendar date.')
  }
  return ordinal
}

function validateClockTime(value: string, label: string): void {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new RangeError(label + ' must use 24-hour HH:mm time.')
  }
}

function validateSchedule(schedule: DoseSchedule): {
  startDate: number
  endDate: number | null
  effectiveFrom: number
  effectiveTo: number | null
} {
  if (!schedule.id.trim() || !schedule.medicineId.trim()) {
    throw new RangeError('A schedule and medicine ID are required.')
  }
  if (!Number.isSafeInteger(schedule.version) || schedule.version < 1) {
    throw new RangeError('Schedule version must be a positive integer.')
  }
  if (
    !Number.isSafeInteger(schedule.quantityPerDose) ||
    schedule.quantityPerDose <= 0
  ) {
    throw new RangeError('Dose quantity must be positive safe milliunits.')
  }

  const startDate = dateOrdinal(schedule.startDate, 'Schedule start date')
  const endDate =
    schedule.endDate === null
      ? null
      : dateOrdinal(schedule.endDate, 'Schedule end date')
  const effectiveFrom = dateOrdinal(
    schedule.effectiveFrom,
    'Schedule effective-from date',
  )
  const effectiveTo =
    schedule.effectiveTo === null
      ? null
      : dateOrdinal(schedule.effectiveTo, 'Schedule effective-to date')

  if (endDate !== null && endDate < startDate) {
    throw new RangeError('Schedule end date cannot be before its start date.')
  }
  if (effectiveFrom < startDate) {
    throw new RangeError('A schedule version cannot precede its start date.')
  }
  if (endDate !== null && endDate < effectiveFrom) {
    throw new RangeError('A schedule version must start by its end date.')
  }
  if (effectiveTo !== null && effectiveTo <= effectiveFrom) {
    throw new RangeError('Effective-to must be after effective-from.')
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: schedule.timezone })
  } catch {
    throw new RangeError('Schedule timezone must be a valid IANA timezone.')
  }

  switch (schedule.recurrence.type) {
    case 'daily':
    case 'alternate':
      break
    case 'weekdays': {
      const days = schedule.recurrence.weekdays
      if (
        days.length === 0 ||
        days.some((day) => !WEEKDAYS.has(day)) ||
        new Set(days).size !== days.length
      ) {
        throw new RangeError(
          'Choose one or more unique weekdays from Sunday through Saturday.',
        )
      }
      break
    }
    case 'interval':
      if (
        !Number.isSafeInteger(schedule.recurrence.intervalDays) ||
        schedule.recurrence.intervalDays < 1
      ) {
        throw new RangeError(
          'Interval must be a positive whole number of days.',
        )
      }
      break
    default:
      throw new RangeError('Schedule recurrence is not supported.')
  }

  if (schedule.timing.type === 'meal') {
    if (!MEAL_WINDOWS.has(schedule.timing.window)) {
      throw new RangeError('Schedule meal window is not supported.')
    }
    if (schedule.timing.reminderTime !== null) {
      validateClockTime(schedule.timing.reminderTime, 'Reminder time')
    }
  } else if (schedule.timing.type === 'custom') {
    validateClockTime(schedule.timing.time, 'Custom time')
  } else {
    throw new RangeError('Schedule timing is not supported.')
  }

  if (!Array.isArray(schedule.pausePeriods)) {
    throw new RangeError('Schedule pause periods must be a list.')
  }
  for (const [index, pause] of schedule.pausePeriods.entries()) {
    const pauseStart = dateOrdinal(
      pause.startDate,
      'Pause ' + (index + 1) + ' start date',
    )
    if (pause.endDate !== null) {
      const pauseEnd = dateOrdinal(
        pause.endDate,
        'Pause ' + (index + 1) + ' end date',
      )
      if (pauseEnd < pauseStart) {
        throw new RangeError('Pause end date cannot be before its start date.')
      }
    }
  }

  return { startDate, endDate, effectiveFrom, effectiveTo }
}

function isPaused(schedule: DoseSchedule, date: LocalDate): boolean {
  return schedule.pausePeriods.some(
    (pause) =>
      date >= pause.startDate &&
      (pause.endDate === null || date <= pause.endDate),
  )
}

function occursOn(schedule: DoseSchedule, startDate: number, date: LocalDate) {
  switch (schedule.recurrence.type) {
    case 'daily':
      return true
    case 'alternate':
      return (
        ((dateOrdinal(date, 'Occurrence date') - startDate) / DAY_MS) % 2 === 0
      )
    case 'weekdays':
      return schedule.recurrence.weekdays.includes(
        new Date(dateOrdinal(date, 'Occurrence date')).getUTCDay() as Weekday,
      )
    case 'interval':
      return (
        ((dateOrdinal(date, 'Occurrence date') - startDate) / DAY_MS) %
          schedule.recurrence.intervalDays ===
        0
      )
  }
}

function validateRange(range: LocalDateRange): {
  start: number
  end: number
} {
  const start = dateOrdinal(range.startDate, 'Range start date')
  const end = dateOrdinal(range.endDate, 'Range end date')
  if (end < start) {
    throw new RangeError('Range end date cannot be before its start date.')
  }
  const dayCount = (end - start) / DAY_MS + 1
  if (dayCount > MAX_RANGE_DAYS) {
    throw new RangeError(
      'Generate at most ' + MAX_RANGE_DAYS + ' calendar days at a time.',
    )
  }
  return { start, end }
}

/**
 * Return deterministic local-date occurrences for one schedule version.
 * Meal windows remain labels; only custom times and optional reminder times
 * contain a clock time. No notification instant or database write is created.
 */
export function generateOccurrences(
  schedule: DoseSchedule,
  medicine: Medicine,
  range: LocalDateRange,
  generatedAt = new Date().toISOString(),
): DoseOccurrence[] {
  if (medicine.id !== schedule.medicineId || !medicine.name.trim()) {
    throw new RangeError('Schedule and medicine must refer to each other.')
  }
  if (!['tablet', 'capsule', 'ml', 'other'].includes(medicine.unit)) {
    throw new RangeError('Medicine unit is not supported.')
  }
  const { startDate, endDate, effectiveFrom, effectiveTo } =
    validateSchedule(schedule)
  const { start, end } = validateRange(range)
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new RangeError('Occurrence creation time must be a valid timestamp.')
  }

  const occurrences: DoseOccurrence[] = []
  const first = Math.max(start, startDate, effectiveFrom)
  const last = Math.min(
    end,
    endDate ?? end,
    (effectiveTo ?? end + DAY_MS) - DAY_MS,
  )
  for (let ordinal = first; ordinal <= last; ordinal += DAY_MS) {
    const scheduledDate = new Date(ordinal).toISOString().slice(0, 10)
    if (
      !occursOn(schedule, startDate, scheduledDate) ||
      isPaused(schedule, scheduledDate)
    ) {
      continue
    }

    occurrences.push({
      id: 'dose-' + encodeURIComponent(schedule.id) + '-' + scheduledDate,
      scheduleId: schedule.id,
      medicineId: medicine.id,
      scheduledDate,
      medicineName: medicine.name,
      unit: medicine.unit,
      scheduledQuantity: schedule.quantityPerDose as Quantity,
      timing: schedule.timing,
      timezone: schedule.timezone,
      status: 'pending',
      takenAt: null,
      quantityTaken: null,
      snoozedUntil: null,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    })
  }
  return occurrences
}
