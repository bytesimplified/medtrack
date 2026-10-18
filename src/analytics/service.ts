import { db, type MedTrackDatabase } from '../database/db'
import type {
  DoseEvent,
  DoseOccurrence,
  DoseSchedule,
  LocalDate,
  Medicine,
} from '../database/models'
import { generateOccurrences } from '../scheduling/engine'

export interface AnalyticsMonthOptions {
  /** A calendar month in YYYY-MM form, interpreted in the device timezone. */
  month: string
  medicineId?: string | null
  now?: Date
}

export interface DoseCounts {
  taken: number
  skipped: number
  unconfirmed: number
  pending: number
  total: number
  /** Taken / (taken + skipped); unresolved doses are shown separately. */
  adherence: number | null
}

export interface CalendarDay extends DoseCounts {
  date: LocalDate
  isFuture: boolean
}

export interface HistoryDose {
  occurrence: DoseOccurrence
  status: 'taken' | 'skipped' | 'unconfirmed' | 'pending'
  events: DoseEvent[]
  archived: boolean
}

export interface AnalyticsReport {
  month: string
  today: LocalDate
  days: CalendarDay[]
  totals: DoseCounts
  medicines: Array<Pick<Medicine, 'id' | 'name' | 'isArchived'>>
  doses: HistoryDose[]
}

function deviceLocalDate(date: Date): LocalDate {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function monthRange(month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month)
  if (!match) throw new RangeError('Month must use YYYY-MM format.')
  const year = Number(match[1])
  const monthNumber = Number(match[2])
  if (year < 1000 || year > 9999) {
    throw new RangeError('Month year must be between 1000 and 9999.')
  }
  const firstDate = `${match[1]}-${match[2]}-01`
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return {
    firstDate,
    lastDate: `${match[1]}-${match[2]}-${String(daysInMonth).padStart(2, '0')}`,
    daysInMonth,
  }
}

function emptyCounts(): DoseCounts {
  return {
    taken: 0,
    skipped: 0,
    unconfirmed: 0,
    pending: 0,
    total: 0,
    adherence: null,
  }
}

function finishCounts(counts: DoseCounts): DoseCounts {
  const completed = counts.taken + counts.skipped
  return {
    ...counts,
    adherence:
      completed === 0 ? null : Math.round((counts.taken / completed) * 100),
  }
}

function applicableToMedicine(
  schedule: DoseSchedule,
  medicine: Medicine,
): boolean {
  return schedule.medicineId === medicine.id
}

function asHistoryDose(
  occurrence: DoseOccurrence,
  events: DoseEvent[],
  medicine: Medicine,
  today: LocalDate,
): HistoryDose {
  return {
    occurrence,
    status:
      occurrence.status === 'taken'
        ? 'taken'
        : occurrence.status === 'skipped'
          ? 'skipped'
          : occurrence.scheduledDate < today
            ? 'unconfirmed'
            : 'pending',
    events: events
      .filter((event) => event.occurrenceId === occurrence.id)
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt)),
    archived: medicine.isArchived,
  }
}

/**
 * Build a read-only history report for one month. Missing occurrence rows are
 * generated from the saved schedule versions so past doses remain visible as
 * unconfirmed even when MedTrack was not open on their scheduled dates.
 */
export async function getAnalyticsMonth(
  options: AnalyticsMonthOptions,
  database: MedTrackDatabase = db,
): Promise<AnalyticsReport> {
  const { firstDate, lastDate, daysInMonth } = monthRange(options.month)
  const now = options.now ?? new Date()
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError('Analytics date must be a valid instant.')
  }
  const today = deviceLocalDate(now)
  const visibleEnd = lastDate < today ? lastDate : today
  const hasVisibleDates = firstDate <= visibleEnd

  const [medicines, schedules, savedOccurrences] = await Promise.all([
    database.medicines.toArray(),
    database.doseSchedules.toArray(),
    hasVisibleDates
      ? database.doseOccurrences
          .where('scheduledDate')
          .between(firstDate, visibleEnd, true, true)
          .toArray()
      : Promise.resolve([] as DoseOccurrence[]),
  ])
  const medicineById = new Map(
    medicines.map((medicine) => [medicine.id, medicine]),
  )
  const medicineOptions = medicines
    .map(({ id, name, isArchived }) => ({ id, name, isArchived }))
    .sort((left, right) => left.name.localeCompare(right.name))
  const allowedMedicineIds = new Set(medicineOptions.map(({ id }) => id))
  const selectedMedicineId = options.medicineId ?? null
  if (selectedMedicineId && !allowedMedicineIds.has(selectedMedicineId)) {
    throw new RangeError('Selected medicine was not found.')
  }

  const occurrenceById = new Map(
    savedOccurrences
      .filter(
        (occurrence) =>
          !selectedMedicineId || occurrence.medicineId === selectedMedicineId,
      )
      .map((occurrence) => [occurrence.id, occurrence]),
  )

  if (hasVisibleDates) {
    for (const schedule of schedules) {
      const medicine = medicineById.get(schedule.medicineId)
      if (
        !medicine ||
        !applicableToMedicine(schedule, medicine) ||
        (selectedMedicineId && medicine.id !== selectedMedicineId)
      ) {
        continue
      }
      const generated = generateOccurrences(
        schedule,
        medicine,
        { startDate: firstDate, endDate: visibleEnd },
        now.toISOString(),
      )
      for (const occurrence of generated) {
        if (!occurrenceById.has(occurrence.id)) {
          occurrenceById.set(occurrence.id, occurrence)
        }
      }
    }
  }

  const occurrences = [...occurrenceById.values()].sort(
    (left, right) =>
      left.scheduledDate.localeCompare(right.scheduledDate) ||
      left.medicineName.localeCompare(right.medicineName) ||
      left.id.localeCompare(right.id),
  )
  const occurrenceIds = occurrences.map(({ id }) => id)
  const events =
    occurrenceIds.length === 0
      ? []
      : await database.doseEvents
          .where('occurrenceId')
          .anyOf(occurrenceIds)
          .toArray()
  const eventsByOccurrence = new Map<string, DoseEvent[]>()
  for (const event of events) {
    const forOccurrence = eventsByOccurrence.get(event.occurrenceId) ?? []
    forOccurrence.push(event)
    eventsByOccurrence.set(event.occurrenceId, forOccurrence)
  }

  const countsByDate = new Map<LocalDate, DoseCounts>()
  for (const occurrence of occurrences) {
    const counts = countsByDate.get(occurrence.scheduledDate) ?? emptyCounts()
    counts.total += 1
    if (occurrence.status === 'taken') counts.taken += 1
    else if (occurrence.status === 'skipped') counts.skipped += 1
    else if (occurrence.scheduledDate < today) counts.unconfirmed += 1
    else counts.pending += 1
    countsByDate.set(occurrence.scheduledDate, counts)
  }

  const days: CalendarDay[] = Array.from(
    { length: daysInMonth },
    (_, index) => {
      const date = `${options.month}-${String(index + 1).padStart(2, '0')}`
      const counts = countsByDate.get(date) ?? emptyCounts()
      return {
        date,
        ...finishCounts(counts),
        isFuture: date > today,
      }
    },
  )
  const totals = finishCounts(
    [...countsByDate.values()].reduce<DoseCounts>(
      (total, counts) => ({
        taken: total.taken + counts.taken,
        skipped: total.skipped + counts.skipped,
        unconfirmed: total.unconfirmed + counts.unconfirmed,
        pending: total.pending + counts.pending,
        total: total.total + counts.total,
        adherence: null,
      }),
      emptyCounts(),
    ),
  )
  const historyDoses = occurrences.flatMap((occurrence) => {
    const medicine = medicineById.get(occurrence.medicineId)
    return medicine
      ? [
          asHistoryDose(
            occurrence,
            eventsByOccurrence.get(occurrence.id) ?? [],
            medicine,
            today,
          ),
        ]
      : []
  })

  return {
    month: options.month,
    today,
    days,
    totals,
    medicines: medicineOptions,
    doses: historyDoses,
  }
}