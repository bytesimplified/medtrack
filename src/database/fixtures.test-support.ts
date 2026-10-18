import type {
  DoseEvent,
  DoseOccurrence,
  DoseSchedule,
  Medicine,
  StockTransaction,
} from './models'
import { parseQuantity } from './quantity'
const now = '2026-10-17T08:30:00.000Z'
export function medicine(): Medicine {
  return {
    id: 'medicine-vitamin-d',
    name: 'Vitamin D',
    strength: null,
    description: null,
    notes: null,
    unit: 'tablet',
    lowStockDays: 5,
    isArchived: false,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}
export function schedule(): DoseSchedule {
  return {
    id: 'schedule-lunch-v1',
    seriesId: 'schedule-lunch',
    version: 1,
    medicineId: medicine().id,
    quantityPerDose: parseQuantity('1'),
    recurrence: { type: 'daily' },
    timing: { type: 'meal', window: 'after-lunch', reminderTime: null },
    timezone: 'Asia/Kolkata',
    startDate: '2026-10-17',
    endDate: null,
    effectiveFrom: '2026-10-17',
    effectiveTo: null,
    pausePeriods: [],
    createdAt: now,
  }
}
export function occurrence(): DoseOccurrence {
  return {
    id: 'dose-lunch-2026-10-17',
    scheduleId: schedule().id,
    medicineId: medicine().id,
    scheduledDate: '2026-10-17',
    medicineName: 'Vitamin D',
    unit: 'tablet',
    scheduledQuantity: parseQuantity('1'),
    timing: schedule().timing,
    timezone: schedule().timezone,
    status: 'pending',
    takenAt: null,
    quantityTaken: null,
    snoozedUntil: null,
    createdAt: now,
    updatedAt: now,
  }
}
export function event(): DoseEvent {
  return {
    id: 'event-taken',
    operationId: 'operation-taken',
    occurrenceId: occurrence().id,
    action: 'taken',
    previousStatus: 'pending',
    newStatus: 'taken',
    previousQuantityTaken: null,
    newQuantityTaken: parseQuantity('1'),
    previousTakenAt: null,
    newTakenAt: now,
    previousSnoozedUntil: null,
    newSnoozedUntil: null,
    reversesEventId: null,
    recordedAt: now,
    note: null,
  }
}
export function initialStock(): StockTransaction {
  return {
    id: 'stock-initial',
    operationId: 'operation-initial',
    medicineId: medicine().id,
    doseEventId: null,
    transactionType: 'initial',
    quantityDelta: parseQuantity('30'),
    reversesTransactionId: null,
    note: null,
    createdAt: now,
  }
}
