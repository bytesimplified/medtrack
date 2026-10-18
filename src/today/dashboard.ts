import { db, type MedTrackDatabase } from '../database/db'
import type { DoseOccurrence } from '../database/models'
import type { Quantity } from '../database/quantity'
import { getApplicableSchedules } from './occurrences'

const MEAL_WINDOWS = [
  'before-breakfast',
  'after-breakfast',
  'before-lunch',
  'after-lunch',
  'before-dinner',
  'after-dinner',
  'bedtime',
] as const

const MEAL_LABELS: Record<(typeof MEAL_WINDOWS)[number], string> = {
  'before-breakfast': 'Before breakfast',
  'after-breakfast': 'After breakfast',
  'before-lunch': 'Before lunch',
  'after-lunch': 'After lunch',
  'before-dinner': 'Before dinner',
  'after-dinner': 'After dinner',
  bedtime: 'Bedtime',
}

export interface TodaySection {
  key: string
  title: string
  occurrences: DoseOccurrence[]
}

export interface TodayProgress {
  taken: number
  skipped: number
  pending: number
  completed: number
  total: number
}

export interface TodayDashboard {
  occurrences: DoseOccurrence[]
  sections: TodaySection[]
  progress: TodayProgress
  stockBalances: Record<string, Quantity | null>
  activeMedicineCount: number
  applicableScheduleCount: number
  pausedScheduleCount: number
}

function sectionFor(occurrence: DoseOccurrence) {
  if (occurrence.timing.type === 'custom') {
    return {
      key: 'custom:' + occurrence.timing.time,
      title: occurrence.timing.time,
      order:
        MEAL_WINDOWS.length + Number(occurrence.timing.time.replace(':', '')),
    }
  }
  const order = MEAL_WINDOWS.indexOf(occurrence.timing.window)
  return {
    key: 'meal:' + occurrence.timing.window,
    title: MEAL_LABELS[occurrence.timing.window],
    order,
  }
}

function makeSections(occurrences: DoseOccurrence[]): TodaySection[] {
  const groups = new Map<string, TodaySection & { order: number }>()
  for (const occurrence of occurrences) {
    const info = sectionFor(occurrence)
    const section = groups.get(info.key) ?? {
      key: info.key,
      title: info.title,
      order: info.order,
      occurrences: [],
    }
    section.occurrences.push(occurrence)
    groups.set(info.key, section)
  }

  return [...groups.values()]
    .sort((left, right) => left.order - right.order)
    .map(({ key, title, occurrences: doses }) => ({
      key,
      title,
      occurrences: doses.sort((left, right) =>
        left.medicineName.localeCompare(right.medicineName),
      ),
    }))
}

/** Read the current dashboard using indexed schedule/date lookups. */
export async function getTodayDashboard(
  database: MedTrackDatabase = db,
  now = new Date(),
): Promise<TodayDashboard> {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError('Dashboard date must be a valid instant.')
  }
  const { medicines, schedules } = await getApplicableSchedules(database, now)
  const visibleSchedules = schedules.filter(({ paused }) => !paused)
  const occurrences = (
    await Promise.all(
      visibleSchedules.map(({ schedule, date }) =>
        database.doseOccurrences
          .where('[scheduleId+scheduledDate]')
          .equals([schedule.id, date])
          .first(),
      ),
    )
  )
    .filter((occurrence): occurrence is DoseOccurrence => !!occurrence)
    .sort((left, right) => {
      const leftSection = sectionFor(left)
      const rightSection = sectionFor(right)
      return (
        leftSection.order - rightSection.order ||
        left.medicineName.localeCompare(right.medicineName)
      )
    })

  const taken = occurrences.filter(({ status }) => status === 'taken').length
  const skipped = occurrences.filter(
    ({ status }) => status === 'skipped',
  ).length
  const pending = occurrences.filter(
    ({ status }) => status === 'pending',
  ).length
  const medicineIds = [
    ...new Set(occurrences.map(({ medicineId }) => medicineId)),
  ]
  const stockRows = await Promise.all(
    medicineIds.map(async (medicineId) => ({
      medicineId,
      transactions: await database.stockTransactions
        .where('medicineId')
        .equals(medicineId)
        .toArray(),
    })),
  )
  const stockBalances: Record<string, Quantity | null> = {}
  for (const { medicineId, transactions } of stockRows) {
    const balance = transactions.reduce(
      (total, transaction) => total + transaction.quantityDelta,
      0,
    )
    stockBalances[medicineId] = Number.isSafeInteger(balance)
      ? (balance as Quantity)
      : null
  }

  return {
    occurrences,
    sections: makeSections(occurrences),
    progress: {
      taken,
      skipped,
      pending,
      completed: taken + skipped,
      total: occurrences.length,
    },
    stockBalances,
    activeMedicineCount: medicines.length,
    applicableScheduleCount: schedules.length,
    pausedScheduleCount: schedules.filter(({ paused }) => paused).length,
  }
}
