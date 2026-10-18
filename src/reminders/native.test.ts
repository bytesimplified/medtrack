import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  LocalNotificationsPlugin,
  ScheduleOptions,
} from '@capacitor/local-notifications'
import type { LocalNotification } from './platform'
import { CapacitorNotificationAdapter, nativeNotificationId } from './native'

function notification(id = 'dose-vitamin-d-2026-10-18'): LocalNotification {
  return {
    id,
    title: 'Time for Vitamin D',
    body: '1 tablet scheduled',
    scheduledAt: '2026-10-18T09:30:00.000Z',
  }
}

function pluginHarness(permission: string = 'granted') {
  let openListener: (() => void) | undefined
  const plugin = {
    checkPermissions: vi.fn(async () => ({ display: permission })),
    requestPermissions: vi.fn(async () => ({ display: permission })),
    createChannel: vi.fn(async () => undefined),
    addListener: vi.fn(async (_event: string, listener: () => void) => {
      openListener = listener
      return { remove: vi.fn(async () => undefined) }
    }),
    schedule: vi.fn(async ({ notifications }: ScheduleOptions) => ({
      notifications: notifications.map(({ id }) => ({ id })),
    })),
    cancelAll: vi.fn(async () => undefined),
  } as unknown as LocalNotificationsPlugin
  return { plugin, open: () => openListener?.() }
}

afterEach(() => {
  window.location.hash = ''
})

describe('Capacitor notification adapter', () => {
  it('maps permission, installs the channel and routes a notification tap to Today', async () => {
    const harness = pluginHarness('granted')
    const adapter = new CapacitorNotificationAdapter(harness.plugin)

    await adapter.initialize()

    expect(adapter.permissionStatus()).toBe('granted')
    expect(harness.plugin.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'medtrack-reminders' }),
    )
    window.location.hash = '#medicines'
    harness.open()
    expect(window.location.hash).toBe('#today')
  })

  it('schedules a stable inexact Android alarm and cancels pending reminders', async () => {
    const harness = pluginHarness('granted')
    const adapter = new CapacitorNotificationAdapter(harness.plugin)
    await adapter.initialize()

    await adapter.schedule(notification())

    const options = vi.mocked(harness.plugin.schedule).mock.calls[0][0]
    const scheduled = options.notifications[0]
    expect(scheduled.id).toBe(nativeNotificationId(notification().id))
    expect(scheduled.schedule?.at?.toISOString()).toBe(
      notification().scheduledAt,
    )
    expect(scheduled.schedule?.allowWhileIdle).toBe(true)
    expect(scheduled.isExactNotification).toBe(false)
    expect(scheduled.channelId).toBe('medtrack-reminders')

    await adapter.cancelAll()
    expect(harness.plugin.cancelAll).toHaveBeenCalledOnce()
  })

  it('does not schedule when permission is denied and normalizes rationale state', async () => {
    const harness = pluginHarness('prompt-with-rationale')
    const adapter = new CapacitorNotificationAdapter(harness.plugin)
    await adapter.initialize()

    expect(adapter.permissionStatus()).toBe('prompt')
    await adapter.schedule(notification())
    expect(harness.plugin.schedule).not.toHaveBeenCalled()

    await adapter.requestPermission()
    expect(adapter.permissionStatus()).toBe('prompt')
  })
})
