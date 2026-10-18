import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { MedTrackDatabase } from '../../src/database/db'
import {
  event as fixtureEvent,
  medicine as fixtureMedicine,
  schedule as fixtureSchedule,
} from '../database/fixtures.test-support'
import type {
  DoseEvent,
  DoseOccurrence,
  Medicine,
} from '../../src/database/models'
import { parseQuantity } from '../../src/database/quantity'
import { generateOccurrences } from '../../src/scheduling/engine'
import { getAnalyticsMonth } from '../../src/analytics/service'

const databases: MedTrackDatabase[] = []
const now = new Date('2026-10-17T12:00:00.000Z')

function database() {
  const result = new MedTrackDatabase(
    `medtrack-analytics-${crypto.randomUUID()}`,
  )
  databases.push(result)
  return result
}

function createOccurrence(
  medicine: Medicine,
  schedule = fixtureSchedule(),
  date: string,
): DoseOccurrence {
  return generateOccurrences(
    schedule,
    medicine,
    { startDate: date, endDate: date },
    now.toISOString(),
  )[0]
}

function doseEvent(
  occurrenceId: string,
  id: string,
  action: DoseEvent['action'],
  recordedAt: string,
): DoseEvent {
  return {
    ...fixtureEvent(),
    id,
    operationId: `operation-${id}`,
    occurrenceId,
    action,
    previousStatus:
      action === 'undone' || action === 'corrected' ? 'taken' : 'pending',
    newStatus: action === 'undone' ? 'pending' : 'taken',
    previousQuantityTaken:
      action === 'undone' || action === 'corrected' ? parseQuantity('1') : null,
    newQuantityTaken: action === 'undone' ? null : parseQuantity('1'),
    previousTakenAt:
      action === 'undone' || action === 'corrected' ? recordedAt : null,
    newTakenAt: action === 'undone' ? null : recordedAt,
    reversesEventId: action === 'undone' ? 'event-original' : null,
    recordedAt,
  }
}

afterEach(async () => {
  await Promise.all(
    databases.map(async (db) => {
      db.close()
      await db.delete()
    }),
  )
  databases.length = 0
})

it('counts taken, skipped, past unconfirmed, and today-pending doses separately', async () => {
  const db = database()
  const medicine = fixtureMedicine()
  const lunch = {
    ...fixtureSchedule(),
    startDate: '2026-10-15',
    effectiveFrom: '2026-10-15',
  }
  const evening = {
    ...lunch,
    id: 'schedule-evening-v1',
    seriesId: 'schedule-evening',
    startDate: '2026-10-17',
    effectiveFrom: '2026-10-17',
    timing: { type: 'custom' as const, time: '20:00' },
  }
  const missed = {
    ...lunch,
    id: 'schedule-missed-v1',
    seriesId: 'schedule-missed',
    startDate: '2026-10-16',
    effectiveFrom: '2026-10-16',
    recurrence: { type: 'weekdays' as const, weekdays: [5 as const] },
  }
  const yesterday = {
    ...createOccurrence(medicine, lunch, '2026-10-15'),
    status: 'taken' as const,
    takenAt: '2026-10-15T12:15:00.000Z',
    quantityTaken: parseQuantity('1'),
  }
  const skipped = {
    ...createOccurrence(medicine, lunch, '2026-10-16'),
    status: 'skipped' as const,
  }
  const today = createOccurrence(medicine, lunch, '2026-10-17')
  const todayEvening = createOccurrence(medicine, evening, '2026-10-17')
  const future = {
    ...createOccurrence(medicine, lunch, '2026-10-18'),
    status: 'taken' as const,
    takenAt: '2026-10-18T09:00:00.000Z',
    quantityTaken: parseQuantity('1'),
  }

  await db.medicines.add(medicine)
  await db.doseSchedules.bulkAdd([lunch, evening, missed])
  await db.doseOccurrences.bulkAdd([
    yesterday,
    skipped,
    today,
    todayEvening,
    future,
  ])
  await db.doseEvents.bulkAdd([
    doseEvent(yesterday.id, 'event-original', 'taken', '2026-10-15T12:15:00Z'),
    doseEvent(
      yesterday.id,
      'event-corrected',
      'corrected',
      '2026-10-15T12:20:00Z',
    ),
  ])

  const report = await getAnalyticsMonth({ month: '2026-10', now }, db)

  expect(report.totals).toMatchObject({
    taken: 1,
    skipped: 1,
    unconfirmed: 1,
    pending: 2,
    total: 5,
    adherence: 50,
  })
  expect(report.days[14]).toMatchObject({ date: '2026-10-15', taken: 1 })
  expect(report.days[15]).toMatchObject({
    date: '2026-10-16',
    skipped: 1,
    unconfirmed: 1,
  })
  expect(report.days[17]).toMatchObject({ date: '2026-10-18', isFuture: true })
  expect(report.doses.map(({ occurrence }) => occurrence.id)).not.toContain(
    future.id,
  )
  expect(
    report.doses.find(({ occurrence }) => occurrence.id === today.id)?.status,
  ).toBe('pending')
  expect(
    report.doses
      .find(({ occurrence }) => occurrence.id === yesterday.id)
      ?.events.map(({ action }) => action),
  ).toEqual(['taken', 'corrected'])
})

it('generates missing past occurrences from saved schedule versions and pauses', async () => {
  const db = database()
  const medicine = { ...fixtureMedicine(), isArchived: true }
  const firstVersion = {
    ...fixtureSchedule(),
    startDate: '2026-10-10',
    effectiveFrom: '2026-10-10',
    effectiveTo: '2026-10-14',
    pausePeriods: [{ startDate: '2026-10-12', endDate: '2026-10-13' }],
  }
  const secondVersion = {
    ...firstVersion,
    id: 'schedule-lunch-v2',
    version: 2,
    effectiveFrom: '2026-10-14',
    effectiveTo: null,
    quantityPerDose: parseQuantity('2'),
  }
  await db.medicines.add(medicine)
  await db.doseSchedules.bulkAdd([firstVersion, secondVersion])

  const report = await getAnalyticsMonth(
    { month: '2026-10', now, medicineId: medicine.id },
    db,
  )

  expect(report.medicines).toEqual([
    { id: medicine.id, name: medicine.name, isArchived: true },
  ])
  expect(
    report.doses.map(({ occurrence }) => occurrence.scheduledDate),
  ).toEqual([
    '2026-10-10',
    '2026-10-11',
    '2026-10-14',
    '2026-10-15',
    '2026-10-16',
    '2026-10-17',
  ])
  expect(
    report.doses.find(
      ({ occurrence }) => occurrence.scheduledDate === '2026-10-14',
    )?.occurrence.scheduledQuantity,
  ).toBe(parseQuantity('2'))
  expect(report.totals).toMatchObject({
    unconfirmed: 5,
    pending: 1,
    total: 6,
    adherence: null,
  })
})

it('filters the calendar and history to one medicine', async () => {
  const db = database()
  const vitamin = fixtureMedicine()
  const iron = { ...vitamin, id: 'medicine-iron', name: 'Iron' }
  const vitaminSchedule = {
    ...fixtureSchedule(),
    startDate: '2026-10-17',
    effectiveFrom: '2026-10-17',
  }
  const ironSchedule = {
    ...vitaminSchedule,
    id: 'schedule-iron-v1',
    seriesId: 'schedule-iron',
    medicineId: iron.id,
  }
  await db.medicines.bulkAdd([vitamin, iron])
  await db.doseSchedules.bulkAdd([vitaminSchedule, ironSchedule])
  await db.doseOccurrences.bulkAdd([
    createOccurrence(vitamin, vitaminSchedule, '2026-10-17'),
    createOccurrence(iron, ironSchedule, '2026-10-17'),
  ])

  const report = await getAnalyticsMonth(
    { month: '2026-10', medicineId: iron.id, now },
    db,
  )

  expect(report.totals.total).toBe(1)
  expect(report.days[16].total).toBe(1)
  expect(report.doses).toHaveLength(1)
  expect(report.doses[0].occurrence.medicineName).toBe('Iron')
})

it('rejects invalid months and missing medicine filters', async () => {
  const db = database()
  await expect(
    getAnalyticsMonth({ month: '2026-13', now }, db),
  ).rejects.toThrow('YYYY-MM')
  await expect(
    getAnalyticsMonth({ month: '2026-10', medicineId: 'missing', now }, db),
  ).rejects.toThrow('Selected medicine was not found')
})
