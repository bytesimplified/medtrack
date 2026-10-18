import { describe, expect, it } from 'vitest'
import { medicine, schedule } from '../database/fixtures.test-support'
import { parseQuantity } from '../../src/database/quantity'
import type { DoseSchedule } from '../../src/database/models'
import { generateOccurrences } from '../../src/scheduling/engine'

const timestamp = '2026-10-18T10:15:00.000Z'

function withSchedule(overrides: Partial<DoseSchedule> = {}): DoseSchedule {
  const base = schedule()
  return {
    ...base,
    ...overrides,
    effectiveFrom:
      overrides.effectiveFrom ?? overrides.startDate ?? base.effectiveFrom,
  }
}

function dates(
  value: DoseSchedule = schedule(),
  startDate = value.startDate,
  endDate = startDate,
) {
  return generateOccurrences(
    value,
    medicine(),
    { startDate, endDate },
    timestamp,
  ).map((occurrence) => occurrence.scheduledDate)
}

describe('generateOccurrences', () => {
  it('generates an inclusive daily range with stable IDs and historical snapshots', () => {
    const results = generateOccurrences(
      withSchedule({
        timing: { type: 'meal', window: 'after-lunch', reminderTime: '14:30' },
      }),
      medicine(),
      { startDate: '2026-10-17', endDate: '2026-10-19' },
      timestamp,
    )

    expect(results.map(({ scheduledDate }) => scheduledDate)).toEqual([
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
    ])
    expect(results[0]).toMatchObject({
      id: 'dose-schedule-lunch-v1-2026-10-17',
      scheduleId: 'schedule-lunch-v1',
      medicineId: 'medicine-vitamin-d',
      medicineName: 'Vitamin D',
      unit: 'tablet',
      scheduledQuantity: parseQuantity('1'),
      timing: { type: 'meal', window: 'after-lunch', reminderTime: '14:30' },
      timezone: 'Asia/Kolkata',
      status: 'pending',
      takenAt: null,
      quantityTaken: null,
      snoozedUntil: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(dates(withSchedule(), '2026-10-17', '2026-10-17')).toEqual([
      '2026-10-17',
    ])
  })

  it('anchors alternate-day recurrence to the original start date', () => {
    const value = withSchedule({
      recurrence: { type: 'alternate' },
      startDate: '2024-02-28',
    })
    expect(dates(value, '2024-02-28', '2024-03-04')).toEqual([
      '2024-02-28',
      '2024-03-01',
      '2024-03-03',
    ])
    expect(dates(value, '2024-02-29', '2024-03-04')).toEqual([
      '2024-03-01',
      '2024-03-03',
    ])
  })

  it('supports selected weekdays using Sunday as weekday zero', () => {
    const value = withSchedule({
      recurrence: { type: 'weekdays', weekdays: [0, 2, 6] },
      startDate: '2026-10-17',
    })
    expect(dates(value, '2026-10-17', '2026-10-24')).toEqual([
      '2026-10-17',
      '2026-10-18',
      '2026-10-20',
      '2026-10-24',
    ])
  })

  it('supports every-X-days recurrence across months and leap day', () => {
    const value = withSchedule({
      recurrence: { type: 'interval', intervalDays: 3 },
      startDate: '2024-02-27',
    })
    expect(dates(value, '2024-02-27', '2024-03-05')).toEqual([
      '2024-02-27',
      '2024-03-01',
      '2024-03-04',
    ])
  })

  it('applies schedule start and end dates inclusively', () => {
    const value = withSchedule({
      startDate: '2026-10-18',
      endDate: '2026-10-20',
      effectiveFrom: '2026-10-18',
    })
    expect(dates(value, '2026-10-16', '2026-10-22')).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
    ])
  })

  it('applies version effective-from inclusively and effective-to exclusively', () => {
    const value = withSchedule({
      effectiveFrom: '2026-10-18',
      effectiveTo: '2026-10-20',
    })
    expect(dates(value, '2026-10-17', '2026-10-21')).toEqual([
      '2026-10-18',
      '2026-10-19',
    ])
  })

  it('excludes every date inside inclusive and ongoing pause periods', () => {
    const value = withSchedule({
      pausePeriods: [
        { startDate: '2026-10-18', endDate: '2026-10-19' },
        { startDate: '2026-10-21', endDate: null },
      ],
    })
    expect(dates(value, '2026-10-17', '2026-10-23')).toEqual([
      '2026-10-17',
      '2026-10-20',
    ])
  })

  it('preserves the timezone while iterating calendar days over a DST change', () => {
    const value = withSchedule({
      startDate: '2026-03-07',
      effectiveFrom: '2026-03-07',
      timezone: 'America/Los_Angeles',
    })
    expect(dates(value, '2026-03-07', '2026-03-10')).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ])
  })

  it('allows the maximum 366-day request window', () => {
    expect(
      dates(
        withSchedule({ startDate: '2024-01-01' }),
        '2024-01-01',
        '2024-12-31',
      ),
    ).toHaveLength(366)
  })

  it('does not mix IDs from independent dose slots on the same date', () => {
    const first = schedule()
    const second = withSchedule({
      id: 'schedule-evening-v1',
      seriesId: 'schedule-evening',
      timing: { type: 'custom', time: '20:00' },
    })
    const resultA = generateOccurrences(
      first,
      medicine(),
      { startDate: '2026-10-17', endDate: '2026-10-17' },
      timestamp,
    )
    const resultB = generateOccurrences(
      second,
      medicine(),
      { startDate: '2026-10-17', endDate: '2026-10-17' },
      timestamp,
    )

    expect(resultA[0].id).not.toBe(resultB[0].id)
    expect(resultA[0].scheduledDate).toBe(resultB[0].scheduledDate)
  })

  it('does not create occurrences for a non-matching medicine', () => {
    expect(() =>
      generateOccurrences(
        schedule(),
        { ...medicine(), id: 'another-medicine' },
        { startDate: '2026-10-17', endDate: '2026-10-17' },
        timestamp,
      ),
    ).toThrow('Schedule and medicine must refer to each other.')
  })

  it.each([
    ['invalid calendar date', { startDate: '2026-02-29' }],
    ['end before start', { endDate: '2026-10-16' }],
    ['effective date before anchor', { effectiveFrom: '2026-10-16' }],
    ['effective-to on effective-from', { effectiveTo: '2026-10-17' }],
    ['invalid timezone', { timezone: 'Mars/Olympus' }],
    ['zero dose', { quantityPerDose: parseQuantity('0') }],
    ['negative dose', { quantityPerDose: parseQuantity('-1') }],
    ['invalid custom time', { timing: { type: 'custom', time: '25:00' } }],
    [
      'invalid reminder time',
      {
        timing: {
          type: 'meal',
          window: 'after-lunch',
          reminderTime: '12:60',
        },
      },
    ],
    ['invalid interval', { recurrence: { type: 'interval', intervalDays: 0 } }],
    ['empty weekdays', { recurrence: { type: 'weekdays', weekdays: [] } }],
    [
      'duplicate weekdays',
      { recurrence: { type: 'weekdays', weekdays: [1, 1] } },
    ],
    [
      'invalid pause range',
      { pausePeriods: [{ startDate: '2026-10-19', endDate: '2026-10-18' }] },
    ],
  ] as const)('rejects %s', (_label, overrides) => {
    expect(() =>
      dates(withSchedule(overrides as Partial<DoseSchedule>)),
    ).toThrow(RangeError)
  })

  it('rejects a range longer than one year', () => {
    expect(() => dates(schedule(), '2024-01-01', '2025-01-01')).toThrow(
      'Generate at most 366 calendar days at a time.',
    )
  })

  it('rejects invalid range order, malformed dates, and timestamps', () => {
    expect(() => dates(schedule(), '2026-10-18', '2026-10-17')).toThrow(
      'Range end date cannot be before its start date.',
    )
    expect(() => dates(schedule(), '2026-1-17', '2026-1-17')).toThrow(
      'must use YYYY-MM-DD',
    )
    expect(() =>
      generateOccurrences(
        schedule(),
        medicine(),
        { startDate: '2026-10-17', endDate: '2026-10-17' },
        'not-a-timestamp',
      ),
    ).toThrow('Occurrence creation time must be a valid timestamp.')
  })
})
