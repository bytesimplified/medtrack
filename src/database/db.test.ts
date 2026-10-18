import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { MedTrackDatabase } from './db'
import { DATABASE_VERSION } from './schema'
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
