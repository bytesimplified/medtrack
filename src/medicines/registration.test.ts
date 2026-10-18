import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { MedTrackDatabase } from '../database/db'
import type { LocalDate } from '../database/models'
import { formatQuantity, parseQuantity } from '../database/quantity'
import { generateOccurrences } from '../scheduling/engine'
import {
  localDateInTimeZone,
  registerMedicine,
  setMedicineArchived,
  setSchedulePaused,
  updateMedicineDetails,
  updateScheduleVersion,
} from './registration'
import type { MedicineRegistrationInput } from './registration'

const now = '2026-10-18T10:15:00.000Z'
const databases: MedTrackDatabase[] = []

function makeDatabase() {
  const instance = new MedTrackDatabase(
    'medtrack-registration-' + crypto.randomUUID(),
  )
  databases.push(instance)
  return instance
}

function input(
  overrides: Partial<MedicineRegistrationInput> = {},
): MedicineRegistrationInput {
  return {
    name: '  Vitamin D  ',
    strength: '1000 IU',
    description: '',
    notes: '',
    unit: 'tablet',
    initialStock: '30',
    lowStockDays: 5,
    recurrence: { type: 'daily' },
    startDate: '2026-10-18',
    endDate: null,
    timezone: 'Asia/Kolkata',
    doses: [
      {
        quantity: '1',
        timing: { type: 'meal', window: 'after-lunch', reminderTime: '14:30' },
      },
    ],
    ...overrides,
  }
}

function idFactory() {
  let next = 0
  return () => 'registration-id-' + ++next
}

afterEach(async () => {
  await Promise.all(
    databases.map(async (database) => {
      database.close()
      await database.delete()
    }),
  )
  databases.length = 0
})

describe('medicine registration', () => {
  it('atomically saves a medicine, multiple dose schedules, disabled reminders, and starting stock', async () => {
    const database = makeDatabase()
    const result = await registerMedicine(
      input({
        doses: [
          {
            quantity: '1',
            timing: {
              type: 'meal',
              window: 'after-lunch',
              reminderTime: '14:30',
            },
          },
          {
            quantity: '0.5',
            timing: { type: 'custom', time: '20:00' },
          },
        ],
      }),
      database,
      { now, idFactory: idFactory() },
    )

    expect(result.medicine).toMatchObject({
      id: 'registration-id-1',
      name: 'Vitamin D',
      strength: '1000 IU',
      unit: 'tablet',
      lowStockDays: 5,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    })
    expect(result.schedules).toHaveLength(2)
    expect(result.schedules[0]).toMatchObject({
      medicineId: result.medicine.id,
      recurrence: { type: 'daily' },
      startDate: '2026-10-18',
      effectiveFrom: '2026-10-18',
      timing: { type: 'meal', reminderTime: '14:30' },
    })
    expect(result.schedules[1].quantityPerDose).toBe(parseQuantity('0.5'))
    expect(result.reminderPreferences).toHaveLength(2)
    expect(
      result.reminderPreferences.every(
        ({ enabled, snoozeMinutes, permissionStatus }) =>
          !enabled && snoozeMinutes === 15 && permissionStatus === 'prompt',
      ),
    ).toBe(true)
    expect(formatQuantity(result.initialStock!.quantityDelta)).toBe('30')
    expect(await database.medicines.count()).toBe(1)
    expect(await database.doseSchedules.count()).toBe(2)
    expect(await database.reminderPreferences.count()).toBe(2)
    expect(await database.stockTransactions.count()).toBe(1)
  })

  it('omits a zero starting-stock ledger row while keeping the medicine and schedule', async () => {
    const database = makeDatabase()
    const result = await registerMedicine(
      input({ initialStock: '0' }),
      database,
      { now, idFactory: idFactory() },
    )

    expect(result.initialStock).toBeNull()
    expect(await database.medicines.count()).toBe(1)
    expect(await database.stockTransactions.count()).toBe(0)
  })

  it('keeps registered records across a database close and reopen', async () => {
    const database = makeDatabase()
    const result = await registerMedicine(input(), database, {
      now,
      idFactory: idFactory(),
    })
    database.close()
    const reopened = new MedTrackDatabase(database.name)
    databases.push(reopened)
    await reopened.open()

    expect(await reopened.medicines.get(result.medicine.id)).toEqual(
      result.medicine,
    )
    expect(await reopened.doseSchedules.toArray()).toEqual(result.schedules)
    expect(await reopened.reminderPreferences.toArray()).toEqual(
      result.reminderPreferences,
    )
    expect(await reopened.stockTransactions.toArray()).toEqual([
      result.initialStock,
    ])
    reopened.close()
  })

  it('rolls back all registration rows if the stock ledger write fails', async () => {
    const database = makeDatabase()
    database.stockTransactions.hook('creating', () => {
      throw new Error('simulated storage failure')
    })

    await expect(
      registerMedicine(input(), database, { now, idFactory: idFactory() }),
    ).rejects.toThrow('simulated storage failure')

    expect(await database.medicines.count()).toBe(0)
    expect(await database.doseSchedules.count()).toBe(0)
    expect(await database.reminderPreferences.count()).toBe(0)
    expect(await database.stockTransactions.count()).toBe(0)
  })

  it.each([
    ['blank name', { name: '   ' }],
    ['negative starting stock', { initialStock: '-1' }],
    ['unsupported stock precision', { initialStock: '1.0001' }],
    [
      'zero dose quantity',
      { doses: [{ quantity: '0', timing: { type: 'custom', time: '12:00' } }] },
    ],
    ['missing dose slot', { doses: [] }],
    ['invalid low-stock days', { lowStockDays: -1 }],
    ['invalid start date', { startDate: '2026-02-30' }],
  ] as const)(
    'rejects %s without writing records',
    async (_label, overrides) => {
      const database = makeDatabase()
      await expect(
        registerMedicine(
          input(overrides as Partial<MedicineRegistrationInput>),
          database,
          { now, idFactory: idFactory() },
        ),
      ).rejects.toThrow()
      expect(await database.medicines.count()).toBe(0)
      expect(await database.doseSchedules.count()).toBe(0)
      expect(await database.stockTransactions.count()).toBe(0)
    },
  )
})

describe('medicine maintenance', () => {
  it('updates descriptive details without changing historical quantity records', async () => {
    const database = makeDatabase()
    const { medicine } = await registerMedicine(input(), database, {
      now,
      idFactory: idFactory(),
    })
    const updated = await updateMedicineDetails(
      medicine.id,
      {
        name: 'Vitamin D3',
        strength: '2000 IU',
        description: 'Updated details',
        notes: '',
        unit: 'tablet',
        lowStockDays: 7,
      },
      database,
      '2026-10-19T08:00:00.000Z',
    )

    expect(updated.name).toBe('Vitamin D3')
    expect(updated.lowStockDays).toBe(7)
    expect(await database.stockTransactions.count()).toBe(1)
    expect((await database.doseSchedules.toArray())[0].quantityPerDose).toBe(
      parseQuantity('1'),
    )
  })

  it('rejects changing units after schedules or stock history exist', async () => {
    const database = makeDatabase()
    const { medicine } = await registerMedicine(input(), database, {
      now,
      idFactory: idFactory(),
    })
    await expect(
      updateMedicineDetails(
        medicine.id,
        {
          name: 'Vitamin D',
          strength: '1000 IU',
          description: '',
          notes: '',
          unit: 'ml',
          lowStockDays: 5,
        },
        database,
        now,
      ),
    ).rejects.toThrow(
      'Unit cannot change after a schedule or stock history exists.',
    )
  })

  it('versions schedule edits and preserves the old recurrence and occurrence snapshots', async () => {
    const database = makeDatabase()
    const { medicine, schedules } = await registerMedicine(input(), database, {
      now,
      idFactory: idFactory(),
    })
    const original = schedules[0]
    const next = await updateScheduleVersion(
      original.id,
      {
        effectiveFrom: '2026-10-19',
        endDate: null,
        quantity: '2',
        recurrence: { type: 'weekdays', weekdays: [1, 3, 5] },
        timing: { type: 'custom', time: '20:15' },
      },
      database,
      {
        now,
        idFactory: (() => {
          let id = 0
          return () => 'schedule-edit-id-' + ++id
        })(),
      },
    )

    expect(next).toMatchObject({
      medicineId: medicine.id,
      seriesId: original.seriesId,
      version: 2,
      startDate: original.startDate,
      effectiveFrom: '2026-10-19',
      effectiveTo: null,
      quantityPerDose: parseQuantity('2'),
      recurrence: { type: 'weekdays', weekdays: [1, 3, 5] },
      timing: { type: 'custom', time: '20:15' },
    })
    expect(await database.doseSchedules.get(original.id)).toMatchObject({
      ...original,
      effectiveTo: '2026-10-19',
    })
    expect(
      generateOccurrences(
        { ...original, effectiveTo: '2026-10-19' },
        medicine,
        { startDate: '2026-10-18', endDate: '2026-10-19' },
        now,
      ).map(({ scheduledDate, scheduledQuantity }) => ({
        scheduledDate,
        scheduledQuantity,
      })),
    ).toEqual([
      { scheduledDate: '2026-10-18', scheduledQuantity: parseQuantity('1') },
    ])
    expect(
      generateOccurrences(
        next,
        medicine,
        { startDate: '2026-10-19', endDate: '2026-10-19' },
        now,
      ),
    ).toHaveLength(1)
    expect(
      await database.reminderPreferences
        .where('scheduleId')
        .equals(next.id)
        .first(),
    ).toMatchObject({
      scheduleId: next.id,
      enabled: false,
      snoozeMinutes: 15,
      permissionStatus: 'prompt',
    })
    expect(await database.doseSchedules.count()).toBe(2)
    await expect(
      setSchedulePaused(original.id, true, '2026-10-19', database),
    ).rejects.toThrow('Only the active schedule version can be changed.')
  })

  it('rejects retroactive and overlapping schedule versions without changing history', async () => {
    const database = makeDatabase()
    const { schedules } = await registerMedicine(input(), database, {
      now,
      idFactory: idFactory(),
    })
    const original = schedules[0]
    const edit = {
      endDate: null,
      quantity: '1',
      recurrence: { type: 'daily' as const },
      timing: {
        type: 'meal' as const,
        window: 'after-lunch' as const,
        reminderTime: null,
      },
    }

    await expect(
      updateScheduleVersion(
        original.id,
        { ...edit, effectiveFrom: '2026-10-17' },
        database,
        { now, idFactory: idFactory() },
      ),
    ).rejects.toThrow('cannot start before the current local date')
    await expect(
      updateScheduleVersion(
        original.id,
        { ...edit, effectiveFrom: '2026-10-18' },
        database,
        { now, idFactory: idFactory() },
      ),
    ).rejects.toThrow('must start after the current version begins')
    expect(await database.doseSchedules.toArray()).toEqual([original])
    expect(await database.reminderPreferences.count()).toBe(1)
  })

  it('archives and restores without deleting schedule or stock history', async () => {
    const database = makeDatabase()
    const { medicine } = await registerMedicine(input(), database, {
      now,
      idFactory: idFactory(),
    })
    await setMedicineArchived(medicine.id, true, database, now)
    expect(await database.medicines.get(medicine.id)).toMatchObject({
      isArchived: true,
      archivedAt: now,
    })
    await setMedicineArchived(
      medicine.id,
      false,
      database,
      '2026-10-20T08:00:00.000Z',
    )
    expect(await database.medicines.get(medicine.id)).toMatchObject({
      isArchived: false,
      archivedAt: null,
    })
    expect(await database.doseSchedules.count()).toBe(1)
    expect(await database.stockTransactions.count()).toBe(1)
  })

  it('pauses from today and resumes before the resumed date', async () => {
    const database = makeDatabase()
    const { schedules } = await registerMedicine(input(), database, {
      now,
      idFactory: idFactory(),
    })
    await setSchedulePaused(schedules[0].id, true, '2026-10-19', database)
    expect(
      (await database.doseSchedules.get(schedules[0].id))?.pausePeriods,
    ).toEqual([{ startDate: '2026-10-19', endDate: null }])
    await setSchedulePaused(schedules[0].id, false, '2026-10-22', database)
    expect(
      (await database.doseSchedules.get(schedules[0].id))?.pausePeriods,
    ).toEqual([{ startDate: '2026-10-19', endDate: '2026-10-21' }])
  })

  it('removes a pause resumed on its start date and validates pause dates', async () => {
    const database = makeDatabase()
    const { schedules } = await registerMedicine(input(), database, {
      now,
      idFactory: idFactory(),
    })
    await setSchedulePaused(schedules[0].id, true, '2026-10-19', database)
    await setSchedulePaused(schedules[0].id, false, '2026-10-19', database)
    expect(
      (await database.doseSchedules.get(schedules[0].id))?.pausePeriods,
    ).toEqual([])
    await expect(
      setSchedulePaused(
        schedules[0].id,
        true,
        '2026-02-30' as LocalDate,
        database,
      ),
    ).rejects.toThrow('must be a real calendar date')
  })

  it('formats the selected timezone calendar date independently of UTC', () => {
    expect(
      localDateInTimeZone(
        new Date('2026-10-18T02:30:00.000Z'),
        'America/Los_Angeles',
      ),
    ).toBe('2026-10-17')
  })
})
