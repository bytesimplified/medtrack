import { db, type MedTrackDatabase } from '../database/db'
import type { DoseSchedule, LocalDate, Medicine } from '../database/models'
import { localDateInTimeZone } from '../medicines/registration'
import { generateOccurrences } from '../scheduling/engine'

export interface ApplicableSchedule {
  schedule: DoseSchedule
  medicine: Medicine
  date: LocalDate
  paused: boolean
}

function dateIsInScheduleVersion(schedule: DoseSchedule, date: LocalDate) {
  return (
    date >= schedule.startDate &&
    (schedule.endDate === null || date <= schedule.endDate) &&
    date >= schedule.effectiveFrom &&
    (schedule.effectiveTo === null || date < schedule.effectiveTo)
  )
}

function scheduleIsPaused(schedule: DoseSchedule, date: LocalDate) {
  return schedule.pausePeriods.some(
    (period) =>
      period.startDate <= date &&
      (period.endDate === null || date <= period.endDate),
  )
}

export async function getApplicableSchedules(
  database: MedTrackDatabase,
  now: Date,
): Promise<{ medicines: Medicine[]; schedules: ApplicableSchedule[] }> {
  const [allMedicines, allSchedules] = await Promise.all([
    database.medicines.toArray(),
    database.doseSchedules.toArray(),
  ])
  const medicines = allMedicines.filter((medicine) => !medicine.isArchived)
  const medicineById = new Map(
    medicines.map((medicine) => [medicine.id, medicine]),
  )
  const schedules: ApplicableSchedule[] = []

  for (const schedule of allSchedules) {
    const medicine = medicineById.get(schedule.medicineId)
    if (!medicine) continue
    const date = localDateInTimeZone(now, schedule.timezone)
    if (!dateIsInScheduleVersion(schedule, date)) continue
    schedules.push({
      schedule,
      medicine,
      date,
      paused: scheduleIsPaused(schedule, date),
    })
  }

  return { medicines, schedules }
}

/**
 * Create today's missing occurrences once. Existing rows are left untouched,
 * so a repeated dashboard load cannot reset a dose status or its snapshots.
 */
export async function ensureTodayOccurrences(
  database: MedTrackDatabase = db,
  now = new Date(),
): Promise<void> {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError('Dashboard date must be a valid instant.')
  }
  const generatedAt = now.toISOString()

  await database.transaction(
    'rw',
    database.medicines,
    database.doseSchedules,
    database.doseOccurrences,
    async () => {
      const { schedules } = await getApplicableSchedules(database, now)
      const generated = schedules.flatMap(({ schedule, medicine, date }) =>
        generateOccurrences(
          schedule,
          medicine,
          { startDate: date, endDate: date },
          generatedAt,
        ),
      )
      if (generated.length === 0) return

      const existing = await database.doseOccurrences.bulkGet(
        generated.map((occurrence) => occurrence.id),
      )
      const missing = generated.filter((_, index) => !existing[index])
      if (missing.length > 0) await database.doseOccurrences.bulkAdd(missing)
    },
  )
}
