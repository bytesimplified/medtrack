import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { MedTrackDatabase } from '../database/db'
import {
  initialStock,
  medicine,
  schedule,
} from '../database/fixtures.test-support'
import type { DoseSchedule } from '../database/models'
import { getTodayDashboard } from './dashboard'
import { ensureTodayOccurrences } from './occurrences'

const instant = new Date('2026-10-17T08:30:00.000Z')
const databases: MedTrackDatabase[] = []

function database() {
  const value = new MedTrackDatabase(`medtrack-today-${crypto.randomUUID()}`)
  databases.push(value)
  return value
}

function withSchedule(overrides: Partial<DoseSchedule> = {}): DoseSchedule {
  return { ...schedule(), ...overrides }
}

afterEach(async () => {
  await Promise.all(
    databases.map(async (value) => {
      value.close()
      await value.delete()
    }),
  )
  databases.length = 0
})

describe('today dashboard', () => {
  it('creates one timezone-local occurrence per due schedule and preserves saved status', async () => {
    const value = database()
    const breakfast = withSchedule({
      id: 'schedule-breakfast-v1',
      seriesId: 'schedule-breakfast',
      timing: { type: 'meal', window: 'before-breakfast', reminderTime: null },
    })
    await value.medicines.add(medicine())
    await value.doseSchedules.bulkAdd([schedule(), breakfast])

    await ensureTodayOccurrences(value, instant)
    expect(await value.doseOccurrences.count()).toBe(2)
    const saved = (await value.doseOccurrences.toArray()).find(
      ({ scheduleId }) => scheduleId === schedule().id,
    )!
    expect(saved.scheduledDate).toBe('2026-10-17')
    await value.doseOccurrences.update(saved.id, {
      status: 'taken',
      takenAt: instant.toISOString(),
    })

    await ensureTodayOccurrences(value, instant)

    expect(await value.doseOccurrences.count()).toBe(2)
    expect(await value.doseOccurrences.get(saved.id)).toMatchObject({
      status: 'taken',
      takenAt: instant.toISOString(),
    })
  })

  it('uses the schedule timezone to choose the local calendar date', async () => {
    const value = database()
    await value.medicines.add(medicine())
    await value.doseSchedules.add(schedule())

    await ensureTodayOccurrences(value, new Date('2026-10-17T18:30:00.000Z'))

    expect(await value.doseOccurrences.toArray()).toMatchObject([
      { scheduledDate: '2026-10-18', timezone: 'Asia/Kolkata' },
    ])
  })

  it('does not generate paused or archived medicine occurrences', async () => {
    const value = database()
    const pausedSchedule = withSchedule({
      pausePeriods: [{ startDate: '2026-10-17', endDate: null }],
    })
    await value.medicines.add(medicine())
    await value.doseSchedules.add(pausedSchedule)

    await ensureTodayOccurrences(value, instant)

    expect(await value.doseOccurrences.count()).toBe(0)
    expect(await getTodayDashboard(value, instant)).toMatchObject({
      activeMedicineCount: 1,
      applicableScheduleCount: 1,
      pausedScheduleCount: 1,
      progress: { total: 0 },
    })

    await value.medicines.update(medicine().id, { isArchived: true })
    expect(await getTodayDashboard(value, instant)).toMatchObject({
      activeMedicineCount: 0,
      applicableScheduleCount: 0,
      pausedScheduleCount: 0,
    })
  })

  it('groups multiple daily doses by timing and calculates taken, skipped, and pending progress', async () => {
    const value = database()
    const breakfast = withSchedule({
      id: 'schedule-breakfast-v1',
      seriesId: 'schedule-breakfast',
      timing: { type: 'meal', window: 'before-breakfast', reminderTime: null },
    })
    const evening = withSchedule({
      id: 'schedule-evening-v1',
      seriesId: 'schedule-evening',
      timing: { type: 'custom', time: '20:00' },
    })
    await value.medicines.add(medicine())
    await value.doseSchedules.bulkAdd([breakfast, schedule(), evening])
    await value.stockTransactions.add(initialStock())
    await ensureTodayOccurrences(value, instant)

    const occurrences = await value.doseOccurrences.toArray()
    await value.doseOccurrences.update(occurrences[0].id, { status: 'taken' })
    await value.doseOccurrences.update(occurrences[1].id, { status: 'skipped' })
    const dashboard = await getTodayDashboard(value, instant)

    expect(dashboard.sections.map(({ title }) => title)).toEqual([
      'Before breakfast',
      'After lunch',
      '20:00',
    ])
    expect(
      dashboard.sections.map(({ occurrences: doses }) => doses),
    ).toHaveLength(3)
    expect(dashboard.progress).toEqual({
      taken: 1,
      skipped: 1,
      pending: 1,
      completed: 2,
      total: 3,
    })
    expect(dashboard.stockBalances[medicine().id]).toBe(30_000)
  })
})
