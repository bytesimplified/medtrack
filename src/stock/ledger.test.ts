import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { MedTrackDatabase } from '../database/db'
import {
  initialStock,
  medicine as fixtureMedicine,
  schedule as fixtureSchedule,
} from '../database/fixtures.test-support'
import { parseQuantity } from '../database/quantity'
import { adjustStock, refillStock } from './ledger'

const now = new Date('2026-10-17T08:30:00.000Z')
const databases: MedTrackDatabase[] = []

function database() {
  const value = new MedTrackDatabase(`medtrack-stock-${crypto.randomUUID()}`)
  databases.push(value)
  return value
}

async function seed(value: MedTrackDatabase) {
  await value.transaction(
    'rw',
    value.medicines,
    value.doseSchedules,
    value.stockTransactions,
    async () => {
      await value.medicines.add(fixtureMedicine())
      await value.doseSchedules.add(fixtureSchedule())
      await value.stockTransactions.add(initialStock())
    },
  )
}

function commandOptions(operationId: string) {
  return { now: now.toISOString(), operationId }
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

describe('stock ledger commands', () => {
  it('records refills once and replays the same operation safely', async () => {
    const value = database()
    await seed(value)

    const first = await refillStock(
      fixtureMedicine().id,
      '12.5',
      'New bottle',
      value,
      commandOptions('refill-one'),
    )
    const retry = await refillStock(
      fixtureMedicine().id,
      '12.5',
      'New bottle',
      value,
      commandOptions('refill-one'),
    )

    expect(first).toMatchObject({
      replayed: false,
      transaction: {
        transactionType: 'refill',
        quantityDelta: parseQuantity('12.5'),
        note: 'New bottle',
      },
    })
    expect(retry).toMatchObject({
      replayed: true,
      transaction: first.transaction,
    })
    expect(await value.stockTransactions.count()).toBe(2)
  })

  it('requires an adjustment reason and prevents negative stock', async () => {
    const value = database()
    await seed(value)

    await expect(
      adjustStock(fixtureMedicine().id, '-31', 'Count correction', value),
    ).rejects.toThrow('cannot make stock negative')
    await expect(
      adjustStock(fixtureMedicine().id, '1', '   ', value),
    ).rejects.toThrow('Enter an adjustment reason')

    const result = await adjustStock(
      fixtureMedicine().id,
      '-2.5',
      'Damaged tablets',
      value,
      commandOptions('adjustment-one'),
    )
    expect(result.transaction).toMatchObject({
      transactionType: 'adjustment',
      quantityDelta: parseQuantity('-2.5'),
      note: 'Damaged tablets',
    })
    expect(
      (await value.stockTransactions.toArray()).reduce(
        (total, row) => total + row.quantityDelta,
        0,
      ),
    ).toBe(parseQuantity('27.5'))
  })
})
