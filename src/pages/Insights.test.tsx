import 'fake-indexeddb/auto'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, expect, it } from 'vitest'
import { db } from '../database/db'
import {
  medicine as fixtureMedicine,
  schedule,
} from '../database/fixtures.test-support'
import { Insights } from './Insights'

function dateString(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

afterAll(() => {
  db.close()
})

it('shows unconfirmed history and filters the calendar by medicine', async () => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayDate = dateString(yesterday)
  const vitamin = fixtureMedicine()
  const iron = { ...vitamin, id: 'medicine-iron', name: 'Iron' }
  const vitaminSchedule = {
    ...schedule(),
    startDate: yesterdayDate,
    effectiveFrom: yesterdayDate,
  }
  const ironSchedule = {
    ...vitaminSchedule,
    id: 'schedule-iron-v1',
    seriesId: 'schedule-iron',
    medicineId: iron.id,
  }

  await db.medicines.bulkAdd([vitamin, iron])
  await db.doseSchedules.bulkAdd([vitaminSchedule, ironSchedule])
  render(<Insights />)

  await screen.findByRole('heading', { name: 'Insights', level: 1 })
  const calendarDay = await screen.findByRole('button', {
    name: /2 unconfirmed/,
  })
  fireEvent.change(screen.getByLabelText('Medicine'), {
    target: { value: iron.id },
  })
  const filteredDay = await screen.findByRole('button', {
    name: /1 unconfirmed/,
  })
  fireEvent.click(filteredDay)

  expect(await screen.findByRole('heading', { name: 'Iron' })).toBeVisible()
  expect(screen.getAllByText('Unconfirmed')).toHaveLength(2)
  expect(calendarDay).toHaveAttribute('aria-pressed', 'false')
})