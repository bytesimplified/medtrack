import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { MedTrackDatabase } from '../database/db'
import type {
  LocalNotification,
  NotificationAdapter,
  ReminderPermission,
} from './platform'
import { registerMedicine } from '../medicines/registration'
import { generateOccurrences } from '../scheduling/engine'
import { snoozeDoseLater } from '../doses/service'
import {
  requestNotificationPermission,
  setScheduleReminderEnabled,
  synchronizeReminders,
} from './service'

const now = new Date('2026-10-18T08:00:00.000Z')
const databases: MedTrackDatabase[] = []

function database() {
  const value = new MedTrackDatabase(
    `medtrack-reminders-${crypto.randomUUID()}`,
  )
  databases.push(value)
  return value
}

class FakeNotificationAdapter implements NotificationAdapter {
  permission: ReminderPermission = 'prompt'
  requestedPermission: ReminderPermission = 'granted'
  scheduled: LocalNotification[] = []
  shown: LocalNotification[] = []

  permissionStatus() {
    return this.permission
  }

  async requestPermission() {
    this.permission = this.requestedPermission
    return this.permission
  }

  async schedule(notification: LocalNotification) {
    this.scheduled.push(notification)
  }

  async notifyNow(notification: LocalNotification) {
    this.shown.push(notification)
    return this.permission === 'granted'
  }

  async cancelAll() {
    this.scheduled = []
  }
}

async function addMedicine(
  value: MedTrackDatabase,
  options: {
    timing?:
      | { type: 'meal'; window: 'after-lunch'; reminderTime: null }
      | {
          type: 'custom'
          time: string
        }
    initialStock?: string
    lowStockAlertsEnabled?: boolean
  } = {},
) {
  return registerMedicine(
    {
      name: 'Vitamin D',
      strength: '',
      description: '',
      notes: '',
      unit: 'tablet',
      initialStock: options.initialStock ?? '30',
      lowStockDays: 5,
      lowStockAlertsEnabled: options.lowStockAlertsEnabled ?? false,
      recurrence: { type: 'daily' },
      startDate: '2026-10-18',
      endDate: null,
      timezone: 'Asia/Kolkata',
      doses: [
        {
          quantity: '1',
          timing: options.timing ?? { type: 'custom', time: '15:00' },
        },
      ],
    },
    value,
    { now: now.toISOString() },
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

describe('reminder scheduling', () => {
  it('requests permission on enable and schedules a future dose at its local clock time', async () => {
    const value = database()
    const adapter = new FakeNotificationAdapter()
    const { schedules } = await addMedicine(value)

    await expect(
      setScheduleReminderEnabled(schedules[0].id, true, value, adapter, now),
    ).resolves.toBe(true)

    expect(adapter.permission).toBe('granted')
    expect(adapter.scheduled).toContainEqual(
      expect.objectContaining({
        id: 'dose-' + schedules[0].id + '-2026-10-18',
        scheduledAt: '2026-10-18T09:30:00.000Z',
      }),
    )
    expect(
      await value.reminderPreferences
        .where('scheduleId')
        .equals(schedules[0].id)
        .first(),
    ).toMatchObject({
      enabled: true,
      permissionStatus: 'granted',
    })
  })

  it('records denied permission and leaves a reminder disabled', async () => {
    const value = database()
    const adapter = new FakeNotificationAdapter()
    adapter.requestedPermission = 'denied'
    const { schedules } = await addMedicine(value)

    await expect(
      setScheduleReminderEnabled(schedules[0].id, true, value, adapter, now),
    ).rejects.toThrow('Notification permission is blocked')

    expect(
      await value.reminderPreferences
        .where('scheduleId')
        .equals(schedules[0].id)
        .first(),
    ).toMatchObject({
      enabled: false,
      permissionStatus: 'denied',
    })
    expect(adapter.scheduled).toHaveLength(0)
  })

  it('reschedules a pending dose from its Later snooze time', async () => {
    const value = database()
    const adapter = new FakeNotificationAdapter()
    const result = await addMedicine(value)
    const occurrence = generateOccurrences(
      result.schedules[0],
      result.medicine,
      { startDate: '2026-10-18', endDate: '2026-10-18' },
      now.toISOString(),
    )[0]
    await value.doseOccurrences.add(occurrence)
    await setScheduleReminderEnabled(
      result.schedules[0].id,
      true,
      value,
      adapter,
      now,
    )
    await snoozeDoseLater(occurrence.id, value, {
      now: now.toISOString(),
      operationId: 'later-vitamin-d',
    })

    await synchronizeReminders(value, adapter, now)

    expect(adapter.scheduled).toContainEqual(
      expect.objectContaining({
        id: occurrence.id,
        scheduledAt: '2026-10-18T08:15:00.000Z',
      }),
    )
  })

  it('does not schedule meal-window doses without a reminder clock time', async () => {
    const value = database()
    const adapter = new FakeNotificationAdapter()
    const { schedules } = await addMedicine(value, {
      timing: {
        type: 'meal',
        window: 'after-lunch',
        reminderTime: null,
      },
    })

    await setScheduleReminderEnabled(schedules[0].id, true, value, adapter, now)

    expect(adapter.scheduled).toHaveLength(0)
  })

  it('serializes concurrent state changes so reminders are not lost or duplicated', async () => {
    const value = database()
    const adapter = new FakeNotificationAdapter()
    const { schedules } = await addMedicine(value)
    await setScheduleReminderEnabled(schedules[0].id, true, value, adapter, now)
    const expectedCount = adapter.scheduled.length

    await Promise.all([
      synchronizeReminders(value, adapter, now),
      synchronizeReminders(value, adapter, now),
    ])

    expect(expectedCount).toBeGreaterThan(0)
    expect(adapter.scheduled).toHaveLength(expectedCount)
    expect(new Set(adapter.scheduled.map(({ id }) => id)).size).toBe(
      expectedCount,
    )
  })

  it('shows an opted-in low-stock alert only once per medicine-local day', async () => {
    const value = database()
    const adapter = new FakeNotificationAdapter()
    await addMedicine(value, {
      initialStock: '2',
      lowStockAlertsEnabled: true,
    })

    await requestNotificationPermission(value, adapter, now)
    await synchronizeReminders(value, adapter, now)

    expect(adapter.shown).toHaveLength(1)
    expect(adapter.shown[0]).toMatchObject({
      title: 'Low stock: Vitamin D',
      id: expect.stringMatching(/^low-stock:.+:2026-10-18$/),
    })
    expect((await value.medicines.toArray())[0].lastLowStockAlertDate).toBe(
      '2026-10-18',
    )
  })
})
