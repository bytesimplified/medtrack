import { db, type MedTrackDatabase } from '../database/db'
import type {
  DoseOccurrence,
  DoseSchedule,
  LocalDate,
  ReminderPreference,
  Timestamp,
} from '../database/models'
import { formatQuantity } from '../database/quantity'
import { localDateInTimeZone } from '../medicines/registration'
import { generateOccurrences } from '../scheduling/engine'
import { calculateStockForecast } from '../stock/forecast'
import {
  browserNotificationAdapter,
  localDateTimeToInstant,
  type LocalNotification,
  type NotificationAdapter,
  type ReminderPermission,
} from './platform'

const DOSE_REMINDER_DAYS = 30
let synchronizationTail: Promise<void> = Promise.resolve()

export interface ReminderSyncResult {
  scheduled: number
  lowStockNotifications: number
}

function validNow(now: Date): string {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError('Reminder synchronization time must be valid.')
  }
  return now.toISOString()
}

function addCalendarDays(value: LocalDate, days: number): LocalDate {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10)
}

function clockTime(schedule: DoseSchedule): string | null {
  if (schedule.timing.type === 'custom') return schedule.timing.time
  return schedule.timing.reminderTime
}

function reminderBody(occurrence: DoseOccurrence) {
  return (
    formatQuantity(occurrence.scheduledQuantity) +
    ' ' +
    (occurrence.unit === 'ml' ? 'mL' : occurrence.unit) +
    ' scheduled'
  )
}

function permissionError(permission: ReminderPermission): RangeError {
  if (permission === 'denied') {
    return new RangeError(
      'Notification permission is blocked in this browser. Change it in browser settings to enable reminders.',
    )
  }
  if (permission === 'unsupported') {
    return new RangeError('This browser does not support notifications.')
  }
  return new RangeError('Notification permission was not granted.')
}

async function savePermissionStatus(
  database: MedTrackDatabase,
  permission: ReminderPermission,
  now: string,
): Promise<void> {
  await database.transaction('rw', database.reminderPreferences, async () => {
    const preferences = await database.reminderPreferences.toArray()
    for (const preference of preferences) {
      if (preference.permissionStatus === permission) continue
      await database.reminderPreferences.put({
        ...preference,
        permissionStatus: permission,
        updatedAt: now,
      })
    }
  })
}

export async function requestNotificationPermission(
  database: MedTrackDatabase = db,
  adapter: NotificationAdapter = browserNotificationAdapter,
  now = new Date(),
): Promise<ReminderPermission> {
  const timestamp = validNow(now)
  const permission =
    adapter.permissionStatus() === 'granted'
      ? 'granted'
      : await adapter.requestPermission()
  await savePermissionStatus(database, permission, timestamp)
  if (permission === 'granted') {
    await synchronizeReminders(database, adapter, now)
  } else {
    await adapter.cancelAll()
  }
  return permission
}

export async function setScheduleReminderEnabled(
  scheduleId: string,
  enabled: boolean,
  database: MedTrackDatabase = db,
  adapter: NotificationAdapter = browserNotificationAdapter,
  now = new Date(),
): Promise<boolean> {
  const timestamp = validNow(now)
  const permission =
    enabled && adapter.permissionStatus() !== 'granted'
      ? await adapter.requestPermission()
      : adapter.permissionStatus()
  const savedEnabled = enabled && permission === 'granted'

  await database.transaction('rw', database.reminderPreferences, async () => {
    const preference = await database.reminderPreferences
      .where('scheduleId')
      .equals(scheduleId)
      .first()
    if (!preference) throw new RangeError('Reminder preference was not found.')
    const updated: ReminderPreference = {
      ...preference,
      enabled: savedEnabled,
      permissionStatus: permission,
      updatedAt: timestamp,
    }
    await database.reminderPreferences.put(updated)
  })

  if (permission === 'granted') {
    await synchronizeReminders(database, adapter, now)
  } else {
    await adapter.cancelAll()
  }
  if (enabled && !savedEnabled) throw permissionError(permission)
  return savedEnabled
}

function desiredDoseNotification(
  occurrence: DoseOccurrence,
  scheduledAt: Timestamp,
): LocalNotification {
  return {
    id: occurrence.id,
    title: 'Time for ' + occurrence.medicineName,
    body: reminderBody(occurrence),
    scheduledAt,
  }
}

async function claimLowStockAlert(
  database: MedTrackDatabase,
  medicineId: string,
  localDate: LocalDate,
  now: Timestamp,
): Promise<boolean> {
  let claimed = false
  await database.transaction('rw', database.medicines, async () => {
    const medicine = await database.medicines.get(medicineId)
    if (!medicine || medicine.lastLowStockAlertDate === localDate) return
    await database.medicines.put({
      ...medicine,
      lastLowStockAlertDate: localDate,
      updatedAt: now,
    })
    claimed = true
  })
  return claimed
}

export function synchronizeReminders(
  database: MedTrackDatabase = db,
  adapter: NotificationAdapter = browserNotificationAdapter,
  now = new Date(),
): Promise<ReminderSyncResult> {
  const run = () => synchronizeRemindersNow(database, adapter, now)
  const synchronization = synchronizationTail.then(run, run)
  synchronizationTail = synchronization.then(
    () => undefined,
    () => undefined,
  )
  return synchronization
}

async function synchronizeRemindersNow(
  database: MedTrackDatabase,
  adapter: NotificationAdapter,
  now: Date,
): Promise<ReminderSyncResult> {
  const nowIso = validNow(now)
  await adapter.cancelAll()
  if (adapter.permissionStatus() !== 'granted') {
    return { scheduled: 0, lowStockNotifications: 0 }
  }

  const [medicines, schedules, preferences, occurrences, stockTransactions] =
    await Promise.all([
      database.medicines.toArray(),
      database.doseSchedules.toArray(),
      database.reminderPreferences.toArray(),
      database.doseOccurrences.toArray(),
      database.stockTransactions.toArray(),
    ])
  const medicineById = new Map(
    medicines.map((medicine) => [medicine.id, medicine]),
  )
  const preferenceBySchedule = new Map(
    preferences.map((preference) => [preference.scheduleId, preference]),
  )
  const occurrenceById = new Map(occurrences.map((item) => [item.id, item]))
  const desired = new Map<string, LocalNotification>()

  for (const schedule of schedules) {
    const medicine = medicineById.get(schedule.medicineId)
    const preference = preferenceBySchedule.get(schedule.id)
    const time = clockTime(schedule)
    if (
      !medicine ||
      medicine.isArchived ||
      !preference?.enabled ||
      preference.permissionStatus !== 'granted' ||
      time === null
    ) {
      continue
    }

    const startDate = localDateInTimeZone(now, schedule.timezone)
    const endDate = addCalendarDays(startDate, DOSE_REMINDER_DAYS - 1)
    const futureOccurrences = generateOccurrences(
      schedule,
      medicine,
      { startDate, endDate },
      nowIso,
    )
    for (const generated of futureOccurrences) {
      const saved = occurrenceById.get(generated.id)
      if (saved && saved.status !== 'pending') continue
      const snoozedUntil = saved?.snoozedUntil
      const scheduledAt =
        snoozedUntil && Date.parse(snoozedUntil) > now.getTime()
          ? snoozedUntil
          : localDateTimeToInstant(
              generated.scheduledDate,
              time,
              schedule.timezone,
            )
      if (Date.parse(scheduledAt) <= now.getTime()) continue
      desired.set(generated.id, desiredDoseNotification(generated, scheduledAt))
    }
  }

  for (const occurrence of occurrences) {
    if (
      occurrence.status !== 'pending' ||
      !occurrence.snoozedUntil ||
      Date.parse(occurrence.snoozedUntil) <= now.getTime() ||
      desired.has(occurrence.id)
    ) {
      continue
    }
    const medicine = medicineById.get(occurrence.medicineId)
    const preference = preferenceBySchedule.get(occurrence.scheduleId)
    if (
      !medicine ||
      medicine.isArchived ||
      !preference?.enabled ||
      preference.permissionStatus !== 'granted'
    ) {
      continue
    }
    desired.set(
      occurrence.id,
      desiredDoseNotification(occurrence, occurrence.snoozedUntil),
    )
  }

  await Promise.all(
    [...desired.values()].map((notification) => adapter.schedule(notification)),
  )

  let lowStockNotifications = 0
  for (const medicine of medicines) {
    if (medicine.isArchived || !medicine.lowStockAlertsEnabled) continue
    const medicineSchedules = schedules.filter(
      (schedule) => schedule.medicineId === medicine.id,
    )
    const transactions = stockTransactions.filter(
      (transaction) => transaction.medicineId === medicine.id,
    )
    const forecast = calculateStockForecast(
      medicine,
      medicineSchedules,
      transactions,
      now,
    )
    if (!forecast.lowStock || forecast.daysOfSupply === null) continue
    const timezone =
      medicineSchedules.find((schedule) => schedule.effectiveTo === null)
        ?.timezone ??
      medicineSchedules[0]?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone
    const localDate = localDateInTimeZone(now, timezone)
    if (!(await claimLowStockAlert(database, medicine.id, localDate, nowIso))) {
      continue
    }

    const notification: LocalNotification = {
      id: 'low-stock:' + medicine.id + ':' + localDate,
      title: 'Low stock: ' + medicine.name,
      body:
        'About ' + forecast.daysOfSupply.toFixed(1) + ' days of supply remain.',
      scheduledAt: nowIso,
    }
    try {
      if (await adapter.notifyNow(notification)) lowStockNotifications += 1
    } catch {
      // Keep the daily claim to avoid retry loops if the browser rejects a notice.
    }
  }

  return { scheduled: desired.size, lowStockNotifications }
}
