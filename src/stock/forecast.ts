import { db, type MedTrackDatabase } from '../database/db'
import type {
  DoseSchedule,
  LocalDate,
  Medicine,
  StockTransaction,
} from '../database/models'
import { type Quantity } from '../database/quantity'
import { localDateInTimeZone } from '../medicines/registration'
import { generateOccurrences } from '../scheduling/engine'

export interface StockForecast {
  balance: Quantity | null
  daysOfSupply: number | null
  stockOutDate: LocalDate | null
  averageDailyUse: number | null
  lowStock: boolean
  lowStockDays: number
}

function stockBalance(rows: StockTransaction[]): Quantity | null {
  const total = rows.reduce((sum, row) => sum + row.quantityDelta, 0)
  return Number.isSafeInteger(total) ? (total as Quantity) : null
}

function addCalendarDays(value: LocalDate, days: number): LocalDate {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10)
}

/**
 * Estimate supply by replaying the saved schedule versions over a bounded
 * year. The first date whose planned demand exceeds the remaining ledger
 * balance is the projected stock-out date.
 */
export function calculateStockForecast(
  medicine: Medicine,
  schedules: DoseSchedule[],
  transactions: StockTransaction[],
  now = new Date(),
  horizonDays = 366,
): StockForecast {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError('Forecast date must be a valid instant.')
  }
  if (
    !Number.isSafeInteger(horizonDays) ||
    horizonDays < 1 ||
    horizonDays > 366
  ) {
    throw new RangeError('Forecast horizon must be from 1 to 366 days.')
  }

  const balance = stockBalance(transactions)
  if (balance === null) {
    return {
      balance: null,
      daysOfSupply: null,
      stockOutDate: null,
      averageDailyUse: null,
      lowStock: false,
      lowStockDays: medicine.lowStockDays,
    }
  }

  if (medicine.isArchived || schedules.length === 0) {
    return {
      balance,
      daysOfSupply: null,
      stockOutDate: null,
      averageDailyUse: null,
      lowStock: false,
      lowStockDays: medicine.lowStockDays,
    }
  }

  const timezone =
    schedules.find((schedule) => schedule.effectiveTo === null)?.timezone ??
    schedules[0].timezone
  const startDate = localDateInTimeZone(now, timezone)
  const endDate = addCalendarDays(startDate, horizonDays - 1)
  const generatedAt = now.toISOString()
  const demandByDay = Array<number>(horizonDays).fill(0)
  const startOrdinal = Date.parse(startDate + 'T00:00:00.000Z')

  for (const schedule of schedules) {
    const doses = generateOccurrences(
      schedule,
      medicine,
      { startDate, endDate },
      generatedAt,
    )
    for (const dose of doses) {
      const index =
        (Date.parse(dose.scheduledDate + 'T00:00:00.000Z') - startOrdinal) /
        86_400_000
      demandByDay[index] += dose.scheduledQuantity
    }
  }

  const plannedUse = demandByDay.reduce((total, amount) => total + amount, 0)
  const averageDailyUse = Number.isSafeInteger(plannedUse)
    ? plannedUse / horizonDays
    : null

  let remaining: number = balance
  let daysOfSupply: number | null = null
  let stockOutDate: LocalDate | null = null
  for (let index = 0; index < demandByDay.length; index += 1) {
    const demand = demandByDay[index]
    if (demand === 0) continue
    if (remaining < demand) {
      daysOfSupply = index + Math.max(remaining, 0) / demand
      stockOutDate = addCalendarDays(startDate, index)
      break
    }
    remaining -= demand
  }

  return {
    balance,
    daysOfSupply,
    stockOutDate,
    averageDailyUse,
    lowStock:
      medicine.lowStockDays > 0 &&
      daysOfSupply !== null &&
      daysOfSupply <= medicine.lowStockDays,
    lowStockDays: medicine.lowStockDays,
  }
}

export async function getMedicineStockForecast(
  medicineId: string,
  database: MedTrackDatabase = db,
  now = new Date(),
): Promise<StockForecast> {
  const [medicine, schedules, transactions] = await Promise.all([
    database.medicines.get(medicineId),
    database.doseSchedules.where('medicineId').equals(medicineId).toArray(),
    database.stockTransactions.where('medicineId').equals(medicineId).toArray(),
  ])
  if (!medicine) throw new RangeError('Medicine was not found.')
  return calculateStockForecast(medicine, schedules, transactions, now)
}
