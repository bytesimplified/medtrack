import { describe, expect, it } from 'vitest'
import { localDateTimeToInstant } from '../../src/reminders/platform'

describe('local reminder time conversion', () => {
  it('resolves a clock time in the schedule timezone', () => {
    expect(localDateTimeToInstant('2026-10-18', '14:30', 'Asia/Kolkata')).toBe(
      '2026-10-18T09:00:00.000Z',
    )
  })

  it('moves a nonexistent daylight-saving time to the first valid minute', () => {
    expect(
      localDateTimeToInstant('2026-03-08', '02:30', 'America/New_York'),
    ).toBe('2026-03-08T07:00:00.000Z')
  })

  it('uses the earlier instant when daylight-saving time repeats', () => {
    expect(
      localDateTimeToInstant('2026-11-01', '01:30', 'America/New_York'),
    ).toBe('2026-11-01T05:30:00.000Z')
  })

  it('rejects invalid local dates and clock times', () => {
    expect(() => localDateTimeToInstant('2026-02-30', '09:00', 'UTC')).toThrow(
      RangeError,
    )
    expect(() => localDateTimeToInstant('2026-02-28', '25:00', 'UTC')).toThrow(
      RangeError,
    )
  })
})
