import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import {
  medicine,
  schedule,
  occurrence,
  event,
  initialStock,
} from './fixtures.test-support'
import type { StockTransaction } from './models'
import { parseQuantity, type Quantity } from './quantity'
import { afterEach, expect, it } from 'vitest'
import { MedTrackDatabase } from './db'
import { DATABASE_VERSION, SCHEMA_V1, SCHEMA_V2 } from './schema'
const databases: MedTrackDatabase[] = []
function database() {
  const db = new MedTrackDatabase(`medtrack-test-${crypto.randomUUID()}`)
  databases.push(db)
  return db
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
it('opens an empty versioned database without seeding personal data', async () => {
  const db = database()
  await db.open()
  expect(db.verno).toBe(DATABASE_VERSION)
  expect(db.tables.map((t) => t.name).sort()).toEqual([
    'doseEvents',
    'doseOccurrences',
    'doseSchedules',
    'medicines',
    'reminderPreferences',
    'stockTransactions',
  ])
  for (const table of db.tables) expect(await table.count()).toBe(0)
})

it('persists typed medicines, schedules, and initial stock across close/reopen', async () => {
  const db = database()
  await db.transaction(
    'rw',
    db.medicines,
    db.doseSchedules,
    db.stockTransactions,
    async () => {
      await db.medicines.add(medicine())
      await db.doseSchedules.add(schedule())
      await db.stockTransactions.add(initialStock())
    },
  )
  db.close()
  const reopened = new MedTrackDatabase(db.name)
  try {
    await reopened.open()
    expect(await reopened.medicines.get(medicine().id)).toEqual(medicine())
    expect(await reopened.doseSchedules.get(schedule().id)).toEqual(schedule())
    expect(await reopened.stockTransactions.toArray()).toEqual([initialStock()])
  } finally {
    reopened.close()
  }
})

it('enforces one occurrence per schedule/date but allows another daily slot', async () => {
  const db = database()
  await db.doseOccurrences.add(occurrence())
  await expect(
    db.doseOccurrences.add({ ...occurrence(), id: 'duplicate' }),
  ).rejects.toMatchObject({ name: 'ConstraintError' })
  await db.doseOccurrences.add({
    ...occurrence(),
    id: 'evening',
    scheduleId: 'evening-slot',
  })
  expect(await db.doseOccurrences.count()).toBe(2)
})

it('enforces schedule version uniqueness without overwriting earlier versions', async () => {
  const db = database()
  await db.doseSchedules.add(schedule())
  await expect(
    db.doseSchedules.add({ ...schedule(), id: 'duplicate-version' }),
  ).rejects.toMatchObject({ name: 'ConstraintError' })
  await db.doseSchedules.add({
    ...schedule(),
    id: 'version-2',
    version: 2,
    effectiveFrom: '2026-10-18',
  })
  expect(await db.doseSchedules.get(schedule().id)).toEqual(schedule())
})

it('rejects duplicate retry tokens and duplicate consumption for one dose event', async () => {
  const db = database()
  await db.doseEvents.add(event())
  await expect(
    db.doseEvents.add({ ...event(), id: 'duplicate' }),
  ).rejects.toMatchObject({ name: 'ConstraintError' })
  const consumption: StockTransaction = {
    ...initialStock(),
    id: 'consumption',
    operationId: 'consume',
    transactionType: 'consumption',
    doseEventId: event().id,
    quantityDelta: parseQuantity('-1'),
  }
  await db.stockTransactions.add(consumption)
  await expect(
    db.stockTransactions.add({
      ...consumption,
      id: 'duplicate',
      operationId: 'retry-other-token',
    }),
  ).rejects.toMatchObject({ name: 'ConstraintError' })
  await expect(
    db.stockTransactions.add({
      ...initialStock(),
      id: 'another',
      operationId: 'consume',
    }),
  ).rejects.toMatchObject({ name: 'ConstraintError' })
})

it('permits unrelated refills with null event references and rejects repeated reversal', async () => {
  const db = database()
  await db.stockTransactions.add(initialStock())
  await db.stockTransactions.add({
    ...initialStock(),
    id: 'refill',
    operationId: 'refill',
    transactionType: 'refill',
    quantityDelta: parseQuantity('10'),
  })
  const reversal: StockTransaction = {
    ...initialStock(),
    id: 'reversal',
    operationId: 'reverse',
    transactionType: 'reversal',
    quantityDelta: parseQuantity('-10'),
    reversesTransactionId: 'refill',
  }
  await db.stockTransactions.add(reversal)
  await expect(
    db.stockTransactions.add({
      ...reversal,
      id: 'duplicate',
      operationId: 'reverse-again',
    }),
  ).rejects.toMatchObject({ name: 'ConstraintError' })
})

it('rolls back occurrence, audit event, and stock writes together on failure', async () => {
  const db = database()
  await db.doseOccurrences.add(occurrence())
  await db.stockTransactions.add(initialStock())
  await expect(
    db.transaction(
      'rw',
      db.doseOccurrences,
      db.doseEvents,
      db.stockTransactions,
      async () => {
        await db.doseOccurrences.update(occurrence().id, {
          status: 'taken',
          quantityTaken: parseQuantity('1'),
        })
        await db.doseEvents.add(event())
        // The reused operation token fails only after the preceding writes.
        await db.stockTransactions.add({
          ...initialStock(),
          id: 'duplicate-operation',
        })
      },
    ),
  ).rejects.toMatchObject({ name: 'ConstraintError' })
  expect((await db.doseOccurrences.get(occurrence().id))?.status).toBe(
    'pending',
  )
  expect(await db.doseEvents.count()).toBe(0)
  expect(await db.stockTransactions.toArray()).toEqual([initialStock()])
})

it('keeps occurrence snapshots and audit history after medicine edits', async () => {
  const db = database()
  await db.medicines.add(medicine())
  await db.doseOccurrences.add(occurrence())
  await db.doseEvents.add(event())
  await db.medicines.update(medicine().id, {
    name: 'Updated label',
    isArchived: true,
  })
  expect((await db.doseOccurrences.get(occurrence().id))?.medicineName).toBe(
    'Vitamin D',
  )
  expect(await db.doseEvents.toArray()).toEqual([event()])
})

it('prevents changes and deletes to audit and stock history', async () => {
  const db = database()
  await db.doseEvents.add(event())
  await db.stockTransactions.add(initialStock())
  await expect(
    db.doseEvents.update(event().id, { note: 'edited' }),
  ).rejects.toThrow('append-only')
  await expect(db.doseEvents.delete(event().id)).rejects.toThrow('append-only')
  await expect(
    db.stockTransactions.put({
      ...initialStock(),
      quantityDelta: parseQuantity('5'),
    }),
  ).rejects.toThrow('append-only')
  await expect(db.stockTransactions.clear()).rejects.toThrow('append-only')
  expect(await db.doseEvents.toArray()).toEqual([event()])
  expect(await db.stockTransactions.toArray()).toEqual([initialStock()])
})

it('rejects invalid stock deltas at the persistence boundary', async () => {
  const db = database()
  for (const delta of [
    0,
    0.1,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    -1000,
  ]) {
    await expect(
      db.stockTransactions.add({
        ...initialStock(),
        quantityDelta: delta as Quantity,
      }),
    ).rejects.toThrow()
  }
  await expect(
    db.stockTransactions.add({
      ...initialStock(),
      transactionType: 'consumption',
      quantityDelta: parseQuantity('-1'),
    }),
  ).rejects.toThrow('dose event')
  await expect(
    db.stockTransactions.add({
      ...initialStock(),
      transactionType: 'reversal',
    }),
  ).rejects.toThrow('reference')
  expect(await db.stockTransactions.count()).toBe(0)
})

it('migrates a v1 database and backfills newer optional medicine fields', async () => {
  const db = database()
  const legacy = new Dexie(db.name)
  legacy.version(1).stores(SCHEMA_V1)
  const oldMedicine = medicine()
  delete oldMedicine.lowStockAlertsEnabled
  delete oldMedicine.lastLowStockAlertDate
  try {
    await legacy.open()
    await legacy.table('medicines').add(oldMedicine)
    await legacy.table('stockTransactions').add(initialStock())
  } finally {
    legacy.close()
  }

  await db.open()
  expect(db.verno).toBe(DATABASE_VERSION)
  expect(await db.medicines.get(oldMedicine.id)).toEqual({
    ...oldMedicine,
    lowStockAlertsEnabled: false,
    lastLowStockAlertDate: null,
  })
  expect(
    await db.medicines.where('updatedAt').equals(oldMedicine.updatedAt).count(),
  ).toBe(1)
  expect(await db.stockTransactions.toArray()).toEqual([initialStock()])
})

it('refuses a newer database without clearing user data', async () => {
  const db = database()
  await db.open()
  await db.medicines.add(medicine())
  await db.stockTransactions.add(initialStock())
  db.close()
  const newerSchema = {
    ...SCHEMA_V2,
    medicines: `${SCHEMA_V2.medicines}, futureIndex`,
  }
  const future = new Dexie(db.name)
  future.version(1).stores(SCHEMA_V1)
  future.version(2).stores(SCHEMA_V2)
  future.version(3).stores(newerSchema)
  try {
    await future.open()
  } finally {
    future.close()
  }
  await expect(db.open().then(() => 'opened')).rejects.toThrow(
    'newer MedTrack version',
  )
  const preserved = new Dexie(db.name)
  preserved.version(3).stores(newerSchema)
  try {
    await preserved.open()
    expect(await preserved.table('medicines').toArray()).toEqual([medicine()])
    expect(await preserved.table('stockTransactions').toArray()).toEqual([
      initialStock(),
    ])
  } finally {
    preserved.close()
  }
})
