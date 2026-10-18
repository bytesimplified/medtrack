import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { MedTrackDatabase } from '../database/db'
import {
  event,
  initialStock,
  medicine,
  occurrence,
  schedule,
} from '../database/fixtures.test-support'
import type { ReminderPreference } from '../database/models'
import {
  BackupFormatError,
  createBackup,
  restoreBackup,
  serializeBackup,
} from './backup'

const databases: MedTrackDatabase[] = []

function database() {
  const value = new MedTrackDatabase(
    `medtrack-backup-test-${crypto.randomUUID()}`,
  )
  databases.push(value)
  return value
}

async function addCompleteData(value: MedTrackDatabase) {
  const reminder: ReminderPreference = {
    id: 'reminder-lunch',
    scheduleId: schedule().id,
    enabled: true,
    snoozeMinutes: 10,
    permissionStatus: 'granted',
    updatedAt: '2026-10-17T08:30:00.000Z',
  }
  await value.transaction(
    'rw',
    [
      value.medicines,
      value.doseSchedules,
      value.doseOccurrences,
      value.doseEvents,
      value.stockTransactions,
      value.reminderPreferences,
    ],
    async () => {
      await value.medicines.add(medicine())
      await value.doseSchedules.add(schedule())
      await value.doseOccurrences.add(occurrence())
      await value.doseEvents.add(event())
      await value.stockTransactions.add(initialStock())
      await value.reminderPreferences.add(reminder)
    },
  )
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

it('exports a consistent, versioned snapshot of every local table', async () => {
  const source = database()
  await addCompleteData(source)

  const backup = await createBackup(source, '2026-10-18T09:00:00.000Z')

  expect(backup).toMatchObject({
    format: 'medtrack-backup',
    version: 1,
    databaseVersion: 2,
    exportedAt: '2026-10-18T09:00:00.000Z',
  })
  expect(backup.data).toEqual({
    medicines: [medicine()],
    doseSchedules: [schedule()],
    doseOccurrences: [occurrence()],
    doseEvents: [event()],
    stockTransactions: [initialStock()],
    reminderPreferences: [
      {
        id: 'reminder-lunch',
        scheduleId: schedule().id,
        enabled: true,
        snoozeMinutes: 10,
        permissionStatus: 'granted',
        updatedAt: '2026-10-17T08:30:00.000Z',
      },
    ],
  })
  expect(JSON.parse(serializeBackup(backup))).toEqual(backup)
})

it('atomically replaces all tables and restores append-only history', async () => {
  const source = database()
  await addCompleteData(source)
  const backup = await createBackup(source, '2026-10-18T09:00:00.000Z')
  const target = database()
  await target.medicines.add({ ...medicine(), id: 'existing-local-medicine' })

  const counts = await restoreBackup(serializeBackup(backup), target)

  expect(counts).toEqual({
    medicines: 1,
    schedules: 1,
    occurrences: 1,
    events: 1,
    stockTransactions: 1,
    reminderPreferences: 1,
  })
  expect(await target.medicines.toArray()).toEqual([medicine()])
  expect(await target.doseSchedules.toArray()).toEqual([schedule()])
  expect(await target.doseOccurrences.toArray()).toEqual([occurrence()])
  expect(await target.doseEvents.toArray()).toEqual([event()])
  expect(await target.stockTransactions.toArray()).toEqual([initialStock()])
  expect(await target.reminderPreferences.count()).toBe(1)
})

it('keeps existing data when a write fails during transactional restore', async () => {
  const source = database()
  const backup = await createBackup(source, '2026-10-18T09:00:00.000Z')
  backup.data.medicines = [
    { ...medicine(), id: 'new-medicine' },
    { ...medicine(), id: 'reject-medicine' },
  ]
  const target = database()
  await target.medicines.add(medicine())
  const rejectCreate = (_key: string, item: { id: string }) => {
    if (item.id === 'reject-medicine')
      throw new Error('simulated write failure')
  }
  target.medicines.hook('creating', rejectCreate)

  await expect(restoreBackup(serializeBackup(backup), target)).rejects.toThrow(
    'simulated write failure',
  )
  expect(await target.medicines.toArray()).toEqual([medicine()])
})

it('rejects unsupported and malformed backups before changing local data', async () => {
  const target = database()
  await target.medicines.add(medicine())

  await expect(restoreBackup('{', target)).rejects.toBeInstanceOf(
    BackupFormatError,
  )
  await expect(
    restoreBackup(
      JSON.stringify({
        format: 'medtrack-backup',
        version: 99,
        databaseVersion: 2,
        exportedAt: '2026-10-18T09:00:00.000Z',
        data: {},
      }),
      target,
    ),
  ).rejects.toThrow('format version is not supported')
  expect(await target.medicines.toArray()).toEqual([medicine()])
})
