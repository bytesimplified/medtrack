import { Capacitor } from '@capacitor/core'
import {
  LocalNotifications,
  type LocalNotificationsPlugin,
} from '@capacitor/local-notifications'
import type { LocalNotification } from './platform'
import type { NotificationAdapter, ReminderPermission } from './platform'
import { browserNotificationAdapter } from './platform'

const REMINDER_CHANNEL = {
  id: 'medtrack-reminders',
  name: 'Medicine reminders',
  description: 'Scheduled dose and low-stock reminders from MedTrack.',
  importance: 3 as const,
}

function toPermission(value: string): ReminderPermission {
  if (value === 'granted' || value === 'denied' || value === 'unsupported') {
    return value
  }
  return 'prompt'
}

/** Stable Android integer IDs allow a reminder to replace itself after reload. */
export function nativeNotificationId(key: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0) & 0x7fff_ffff || 1
}

/** Capacitor implementation. Android schedules inexact alarms to avoid special access. */
export class CapacitorNotificationAdapter implements NotificationAdapter {
  private permission: ReminderPermission = 'prompt'
  private initialization?: Promise<void>
  private channelSetup?: Promise<void>
  private readonly notificationKeys = new Map<number, string>()
  private readonly plugin: LocalNotificationsPlugin

  constructor(plugin: LocalNotificationsPlugin = LocalNotifications) {
    this.plugin = plugin
  }

  permissionStatus(): ReminderPermission {
    return this.permission
  }

  initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = Promise.all([
        this.refreshPermission(),
        this.ensureChannel(),
        this.installOpenListener(),
      ])
        .then(() => undefined)
        .catch((error: unknown) => {
          this.initialization = undefined
          throw error
        })
    }
    return this.initialization
  }

  async requestPermission(): Promise<ReminderPermission> {
    const result = await this.plugin.requestPermissions()
    this.permission = toPermission(result.display)
    return this.permission
  }

  async schedule(notification: LocalNotification): Promise<void> {
    if (this.permissionStatus() !== 'granted') return
    const at = Date.parse(notification.scheduledAt)
    if (!Number.isFinite(at)) {
      throw new RangeError('Reminder time must be a valid timestamp.')
    }
    await this.ensureChannel()
    const id = nativeNotificationId(notification.id)
    const previousKey = this.notificationKeys.get(id)
    if (previousKey && previousKey !== notification.id) {
      throw new RangeError(
        'Two reminders mapped to the same Android notification ID.',
      )
    }
    this.notificationKeys.set(id, notification.id)
    await this.plugin.schedule({
      notifications: [
        {
          id,
          title: notification.title,
          body: notification.body,
          channelId: REMINDER_CHANNEL.id,
          schedule: { at: new Date(at), allowWhileIdle: true },
          isExactNotification: false,
        },
      ],
    })
  }

  async notifyNow(notification: LocalNotification): Promise<boolean> {
    if (this.permissionStatus() !== 'granted') return false
    await this.schedule({
      ...notification,
      scheduledAt: new Date(Date.now() + 1_000).toISOString(),
    })
    return true
  }

  async cancelAll(): Promise<void> {
    await this.plugin.cancelAll()
    this.notificationKeys.clear()
  }

  private async refreshPermission(): Promise<void> {
    const result = await this.plugin.checkPermissions()
    this.permission = toPermission(result.display)
  }

  private ensureChannel(): Promise<void> {
    if (!this.channelSetup) {
      this.channelSetup = this.plugin
        .createChannel(REMINDER_CHANNEL)
        .catch((error: unknown) => {
          this.channelSetup = undefined
          throw error
        })
    }
    return this.channelSetup
  }

  private async installOpenListener(): Promise<void> {
    await this.plugin.addListener('localNotificationActionPerformed', () => {
      window.location.hash = '#today'
    })
  }
}

export const isNativeApp = Capacitor.isNativePlatform()
export const notificationAdapter: NotificationAdapter = isNativeApp
  ? new CapacitorNotificationAdapter()
  : browserNotificationAdapter
