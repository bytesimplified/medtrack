import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, expect, it } from 'vitest'
import { db } from '../../src/database/db'
import { Medicines } from '../../src/pages/Medicines'

afterAll(() => {
  db.close()
})

it('registers multiple doses, displays saved stock, edits details, pauses, and archives', async () => {
  render(<Medicines />)

  await screen.findByRole('heading', { name: 'Your list is ready' })
  fireEvent.click(screen.getByRole('button', { name: 'Add medicine' }))
  fireEvent.change(screen.getByLabelText('Medicine name'), {
    target: { value: 'Vitamin D' },
  })
  fireEvent.change(screen.getByLabelText('Unit'), {
    target: { value: 'tablet' },
  })
  fireEvent.change(screen.getByLabelText('Frequency'), {
    target: { value: 'daily' },
  })
  fireEvent.change(screen.getByLabelText('Starting stock (tablets)'), {
    target: { value: '30' },
  })
  fireEvent.change(screen.getAllByLabelText('Dose quantity (tablets)')[0], {
    target: { value: '1' },
  })
  fireEvent.change(screen.getByLabelText('Meal window'), {
    target: { value: 'after-lunch' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add dose time' }))
  fireEvent.change(screen.getAllByLabelText('Dose quantity (tablets)')[1], {
    target: { value: '0.5' },
  })
  fireEvent.change(screen.getByLabelText('Timing for dose 2'), {
    target: { value: 'custom' },
  })
  fireEvent.change(screen.getByLabelText('Custom time'), {
    target: { value: '20:00' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save medicine' }))

  await screen.findByRole('heading', { name: 'Vitamin D' })
  expect(screen.getByText('30 tablets')).toBeInTheDocument()
  expect(screen.getByText('0.5 tablet · at 20:00')).toBeInTheDocument()
  await waitFor(async () => {
    expect(await db.doseSchedules.count()).toBe(2)
    expect(await db.stockTransactions.count()).toBe(1)
  })

  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
  fireEvent.change(screen.getByLabelText('Medicine name'), {
    target: { value: 'Vitamin D3' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
  await screen.findByRole('heading', { name: 'Vitamin D3' })

  fireEvent.click(
    screen
      .getAllByRole('button', { name: 'Edit schedule for Vitamin D3' })
      .find((button) => !button.hasAttribute('disabled'))!,
  )
  await screen.findByRole('heading', { name: 'Edit dose schedule' })
  fireEvent.change(screen.getByLabelText('Dose quantity (tablets)'), {
    target: { value: '2' },
  })
  fireEvent.change(screen.getByLabelText('Frequency'), {
    target: { value: 'weekdays' },
  })
  fireEvent.click(screen.getByLabelText('Monday'))
  fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }))
  await screen.findByText(/Schedule updated from/)
  await waitFor(async () => {
    const versions = await db.doseSchedules.toArray()
    const nextVersion = versions.find((schedule) => schedule.version === 2)
    expect(nextVersion).toMatchObject({
      quantityPerDose: 2000,
      recurrence: { type: 'weekdays', weekdays: [1] },
    })
    expect(
      versions.find(
        (schedule) =>
          schedule.seriesId === nextVersion?.seriesId &&
          schedule.id !== nextVersion.id,
      ),
    ).toMatchObject({ effectiveTo: nextVersion?.effectiveFrom })
  })

  fireEvent.click(
    screen
      .getAllByRole('button', { name: 'Pause schedule for Vitamin D3' })
      .find((button) => !button.hasAttribute('disabled'))!,
  )
  await screen.findByText(/Paused/)
  const pausedSchedule = (await db.doseSchedules.toArray()).find((schedule) =>
    schedule.pausePeriods.some((period) => period.endDate === null),
  )!
  fireEvent.click(
    screen
      .getAllByRole('button', { name: 'Resume schedule for Vitamin D3' })
      .find((button) => !button.hasAttribute('disabled'))!,
  )
  await waitFor(async () => {
    expect(
      (await db.doseSchedules.get(pausedSchedule.id))?.pausePeriods,
    ).toEqual([])
  })

  fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
  await screen.findByText('Archived')
  expect(await db.medicines.count()).toBe(1)
  expect(await db.stockTransactions.count()).toBe(1)
})
