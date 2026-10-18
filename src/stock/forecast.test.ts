import { describe, expect, it } from 'vitest'
import {
  initialStock,
  medicine as fixtureMedicine,
  schedule as fixtureSchedule,
} from '../database/fixtures.test-support'
import { parseQuantity } from '../database/quantity'
import type { StockTransaction } from '../database/models'
import { calculateStockForecast } from './forecast'

const now = new Date('2026-10-17T08:30:00.000Z')

describe('stock forecast', () => {
  it('calculates stock-out dates from recurrence and applies the day threshold', () => {
    const medicine = fixtureMedicine()
    const schedule = {
      ...fixtureSchedule(),
      recurrence: { type: 'alternate' as const },
    }
    const transactions: StockTransaction[] = [
      { ...initialStock(), quantityDelta: parseQuantity('3') },
    ]

    const forecast = calculateStockForecast(
      medicine,
      [schedule],
      transactions,
      now,
    )
    expect(forecast).toMatchObject({
      balance: parseQuantity('3'),
      daysOfSupply: 6,
      stockOutDate: '2026-10-23',
      lowStock: false,
    })

    expect(
      calculateStockForecast(
        { ...medicine, lowStockDays: 6 },
        [schedule],
        transactions,
        now,
      ).lowStock,
    ).toBe(true)
  })

  it('does not invent a forecast when an archived medicine has no upcoming use', () => {
    const forecast = calculateStockForecast(
      { ...fixtureMedicine(), isArchived: true },
      [fixtureSchedule()],
      [initialStock()],
      now,
    )
    expect(forecast).toMatchObject({
      balance: parseQuantity('30'),
      daysOfSupply: null,
      stockOutDate: null,
      lowStock: false,
    })
  })
})
