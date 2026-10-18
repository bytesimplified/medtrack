import type { LocalDate, Timestamp } from '../database/models'

export type ReminderPermission = 'prompt' | 'granted' | 'denied' | 'unsupported'

export interface LocalNotification {
  id: string
  title: string
  body: string
  scheduledAt: Timestamp
}

export interface NotificationAdapter {
  permissionStatus(): ReminderPermission
  requestPermission(): Promise<ReminderPermission>
  schedule(notification: LocalNotification): Promise<void>
  notifyNow(notification: LocalNotification): Promise<boolean>
  cancelAll(): Promise<void>
}

const MAX_TIMER_DELAY = 2_147_000_000

/**
 * Browser implementation for an open app session. Android can provide its
 * background-capable local-notification implementation through the same port.
 */
export class BrowserNotificationAdapter implements NotificationAdapter {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  permissionStatus(): ReminderPermission {
    if (typeof globalThis.Notification === 'undefined') return 'unsupported'
    return this.mapPermission(globalThis.Notification.permission)
  }

  async requestPermission(): Promise<ReminderPermission> {
    if (typeof globalThis.Notification === 'undefined') return 'unsupported'
    return this.mapPermission(await globalThis.Notification.requestPermission())
  }

  async schedule(notification: LocalNotification): Promise<void> {
    if (this.permissionStatus() !== 'granted') return
    const at = Date.parse(notification.scheduledAt)
    if (!Number.isFinite(at)) {
      throw new RangeError('Reminder time must be a valid timestamp.')
    }
    this.cancel(notification.id)

    const setNextTimer = () => {
      const remaining = at - Date.now()
      if (remaining <= 0) {
        this.timers.delete(notification.id)
        void this.notifyNow(notification)
        return
      }
      const timer = setTimeout(
        setNextTimer,
        Math.min(remaining, MAX_TIMER_DELAY),
      )
      this.timers.set(notification.id, timer)
    }
    setNextTimer()
  }

  async notifyNow(notification: LocalNotification): Promise<boolean> {
    if (this.permissionStatus() !== 'granted') return false
    const shown = new globalThis.Notification(notification.title, {
      body: notification.body,
      tag: notification.id,
    })
    shown.onclick = () => {
      window.focus()
      window.location.hash = '#today'
      shown.close()
    }
    return true
  }

  async cancelAll(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  private cancel(id: string): void {
    const timer = this.timers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    this.timers.delete(id)
  }

  private mapPermission(value: NotificationPermission): ReminderPermission {
    if (value === 'default') return 'prompt'
    return value
  }
}

export function localDateTimeToInstant(
  date: LocalDate,
  time: string,
  timezone: string,
): Timestamp {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ) {
    throw new RangeError('Reminder date and time must be valid local values.')
  }

  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const calendarDate = new Date(Date.UTC(year, month - 1, day))
    .toISOString()
    .slice(0, 10)
  if (year < 1000 || calendarDate !== date) {
    throw new RangeError('Reminder date must be a real calendar date.')
  }
  const target = Date.UTC(year, month - 1, day, hour, minute)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  function partsAt(instant: number) {
    const parts = formatter.formatToParts(new Date(instant))
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value)
    return {
      year: value('year'),
      month: value('month'),
      day: value('day'),
      hour: value('hour'),
      minute: value('minute'),
    }
  }

  function matches(instant: number, targetInstant: number) {
    const actual = partsAt(instant)
    const expected = new Date(targetInstant)
    return (
      actual.year === expected.getUTCFullYear() &&
      actual.month === expected.getUTCMonth() + 1 &&
      actual.day === expected.getUTCDate() &&
      actual.hour === expected.getUTCHours() &&
      actual.minute === expected.getUTCMinutes()
    )
  }

  function candidatesFor(targetInstant: number) {
    const offsets = new Set<number>()
    for (const sample of [
      targetInstant - 86_400_000,
      targetInstant,
      targetInstant + 86_400_000,
    ]) {
      const local = partsAt(sample)
      const represented = Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
      )
      offsets.add(represented - sample)
    }
    return [...offsets]
      .map((offset) => targetInstant - offset)
      .filter((instant) => matches(instant, targetInstant))
      .sort((left, right) => left - right)
  }

  const candidates = candidatesFor(target)
  if (candidates.length > 0) return new Date(candidates[0]).toISOString()

  // A clock time inside a spring-forward gap is moved to the first valid local
  // minute after the gap. During a fall-back overlap, candidates above select
  // the earlier instant so the reminder fires only once.
  for (let offset = 1; offset <= 180; offset += 1) {
    const candidateTarget = target + offset * 60_000
    const next = candidatesFor(candidateTarget)
    if (next.length > 0) return new Date(next[0]).toISOString()
  }
  throw new RangeError('Reminder time could not be resolved in this timezone.')
}

export const browserNotificationAdapter = new BrowserNotificationAdapter()
