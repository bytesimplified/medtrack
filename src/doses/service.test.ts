import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { MedTrackDatabase } from '../database/db'
import {
  initialStock,
  medicine,
  occurrence,
  schedule,
} from '../database/fixtures.test-support'
import { parseQuantity } from '../database/quantity'
import {
  markDoseSkipped,
  markDoseTaken,
  snoozeDoseLater,
  undoDose,
} from './service'

const now = '2026-10-17T08:30:00.000Z'
const databases: MedTrackDatabase[] = []

function database() {
  const value = new MedTrackDatabase(`medtrack-doses-${crypto.randomUUID()}`)
  databases.push(value)
  return value
}

async function seed(value: MedTrackDatabase, withStock = true) {
  await value.transaction(
    'rw',
    value.medicines,
    value.doseSchedules,
    value.doseOccurrences,
    value.stockTransactions,
    value.reminderPreferences,
    async () => {
      await value.medicines.add(medicine())
      await value.doseSchedules.add(schedule())
      await value.doseOccurrences.add(occurrence())
      if (withStock) await value.stockTransactions.add(initialStock())
      await value.reminderPreferences.add({
        id: 'reminder-lunch',
        scheduleId: schedule().id,
        enabled: false,
        snoozeMinutes: 15,
        permissionStatus: 'prompt',
        updatedAt: now,
      })
    },
  )
}

function actionOptions(operationId: string) {
  return { now, operationId }
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

describe('dose commands', () => {
  it('marks a dose taken once and deducts the scheduled amount atomically', async () => {
    const value = database()
    await seed(value)

    const first = await markDoseTaken(
      occurrence().id,
      value,
      actionOptions('take-once'),
    )
    const retry = await markDoseTaken(
      occurrence().id,
      value,
      actionOptions('take-once'),
    )

    expect(first).toMatchObject({
      occurrence: {
        status: 'taken',
        takenAt: now,
        quantityTaken: parseQuantity('1'),
        snoozedUntil: null,
      },
      event: { action: 'taken', operationId: 'take-once' },
      stockTransaction: {
        transactionType: 'consumption',
        quantityDelta: parseQuantity('-1'),
      },
      replayed: false,
    })
    expect(retry.replayed).toBe(true)
    expect(await value.doseEvents.count()).toBe(1)
    expect(
      (await value.stockTransactions.toArray()).reduce(
        (sum, transaction) => sum + transaction.quantityDelta,
        0,
      ),
    ).toBe(parseQuantity('29'))
  })

  it('refuses to take more than recorded stock without partial writes', async () => {
    const value = database()
    await seed(value, false)

    await expect(
      markDoseTaken(occurrence().id, value, actionOptions('take-empty')),
    ).rejects.toThrow('Not enough stock')
    expect((await value.doseOccurrences.get(occurrence().id))?.status).toBe(
      'pending',
    )
    expect(await value.doseEvents.count()).toBe(0)
    expect(await value.stockTransactions.count()).toBe(0)
  })

  it('rolls back occurrence and audit changes when the stock ledger rejects a write', async () => {
    const value = database()
    await seed(value)
    value.stockTransactions.hook('creating', (_key, transaction) => {
      if (transaction.transactionType === 'consumption') {
        throw new Error('Injected ledger failure.')
      }
    })

    await expect(
      markDoseTaken(occurrence().id, value, actionOptions('take-failure')),
    ).rejects.toThrow('Injected ledger failure.')
    expect((await value.doseOccurrences.get(occurrence().id))?.status).toBe(
      'pending',
    )
    expect(await value.doseEvents.count()).toBe(0)
    expect(await value.stockTransactions.toArray()).toEqual([initialStock()])
  })

  it('skips without changing stock and requires Undo before a different final action', async () => {
    const value = database()
    await seed(value)

    const result = await markDoseSkipped(
      occurrence().id,
      value,
      actionOptions('skip-once'),
    )
    expect(result).toMatchObject({
      occurrence: { status: 'skipped', quantityTaken: null, takenAt: null },
      event: { action: 'skipped', previousStatus: 'pending' },
      stockTransaction: null,
    })
    expect(await value.stockTransactions.toArray()).toEqual([initialStock()])
    await expect(
      markDoseTaken(occurrence().id, value, actionOptions('take-after-skip')),
    ).rejects.toThrow('already finalized')
  })

  it('snoozes Later without finalizing the dose or changing stock, and retries are idempotent', async () => {
    const value = database()
    await seed(value)

    const first = await snoozeDoseLater(
      occurrence().id,
      value,
      actionOptions('later-once'),
    )
    const retry = await snoozeDoseLater(occurrence().id, value, {
      ...actionOptions('later-once'),
      now: '2026-10-17T09:00:00.000Z',
    })

    expect(first).toMatchObject({
      occurrence: {
        status: 'pending',
        snoozedUntil: '2026-10-17T08:45:00.000Z',
      },
      event: {
        action: 'snoozed',
        previousStatus: 'pending',
        newStatus: 'pending',
        previousSnoozedUntil: null,
        newSnoozedUntil: '2026-10-17T08:45:00.000Z',
      },
      stockTransaction: null,
    })
    expect(retry.replayed).toBe(true)
    expect(retry.occurrence.snoozedUntil).toBe(first.occurrence.snoozedUntil)
    expect(await value.stockTransactions.toArray()).toEqual([initialStock()])
  })

  it('Undo restores stock with an append-only reversal and is itself idempotent', async () => {
    const value = database()
    await seed(value)
    const taken = await markDoseTaken(
      occurrence().id,
      value,
      actionOptions('take-to-undo'),
    )

    const first = await undoDose(
      occurrence().id,
      value,
      actionOptions('undo-once'),
    )
    const retry = await undoDose(
      occurrence().id,
      value,
      actionOptions('undo-once'),
    )
    const ledger = await value.stockTransactions.toArray()

    expect(first).toMatchObject({
      occurrence: { status: 'pending', quantityTaken: null, takenAt: null },
      event: {
        action: 'undone',
        previousStatus: 'taken',
        newStatus: 'pending',
      },
      stockTransaction: {
        transactionType: 'reversal',
        quantityDelta: parseQuantity('1'),
      },
    })
    expect(first.event.reversesEventId).toBe(taken.event.id)
    expect(first.stockTransaction?.reversesTransactionId).toBe(
      taken.stockTransaction?.id,
    )
    expect(retry.replayed).toBe(true)
    expect(await value.doseEvents.count()).toBe(2)
    expect(
      ledger.reduce((sum, transaction) => sum + transaction.quantityDelta, 0),
    ).toBe(parseQuantity('30'))
  })

  it('Undo returns a skipped dose to pending without writing a stock reversal', async () => {
    const value = database()
    await seed(value)
    await markDoseSkipped(occurrence().id, value, actionOptions('skip-to-undo'))

    const result = await undoDose(
      occurrence().id,
      value,
      actionOptions('undo-skip'),
    )

    expect(result).toMatchObject({
      occurrence: { status: 'pending' },
      event: { action: 'undone', reversesEventId: expect.any(String) },
      stockTransaction: null,
    })
    expect(await value.stockTransactions.toArray()).toEqual([initialStock()])
  })

  it('rejects an operation ID reused for another action', async () => {
    const value = database()
    await seed(value)
    await markDoseSkipped(
      occurrence().id,
      value,
      actionOptions('shared-operation'),
    )

    await expect(
      markDoseSkipped(
        'a-different-occurrence',
        value,
        actionOptions('shared-operation'),
      ),
    ).rejects.toThrow('another dose action')
    await expect(
      markDoseTaken(occurrence().id, value, actionOptions('shared-operation')),
    ).rejects.toThrow('another dose action')
  })
})
