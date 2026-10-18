import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import type {
  DoseSchedule,
  DoseTiming,
  LocalDate,
  MealWindow,
  Medicine,
  Recurrence,
  Weekday,
} from '../database/models'
import { formatQuantity, type Quantity } from '../database/quantity'
import {
  localDateInTimeZone,
  updateScheduleVersion,
} from '../medicines/registration'

interface ScheduleFormProps {
  medicine: Medicine
  schedule: DoseSchedule
  onCancel: () => void
  onSaved: (effectiveFrom: LocalDate) => void
}

type Frequency = 'daily' | 'alternate' | 'weekdays' | 'interval'

const mealWindows: Array<{ value: MealWindow; label: string }> = [
  { value: 'before-breakfast', label: 'Before breakfast' },
  { value: 'after-breakfast', label: 'After breakfast' },
  { value: 'before-lunch', label: 'Before lunch' },
  { value: 'after-lunch', label: 'After lunch' },
  { value: 'before-dinner', label: 'Before dinner' },
  { value: 'after-dinner', label: 'After dinner' },
  { value: 'bedtime', label: 'Bedtime' },
]

const weekdayOptions: Array<{ value: Weekday; label: string }> = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

function nextDate(value: LocalDate): LocalDate {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day) + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

function frequencyOf(recurrence: Recurrence): Frequency {
  return recurrence.type
}

function medicineUnitLabel(unit: Medicine['unit']) {
  switch (unit) {
    case 'tablet':
      return 'tablets'
    case 'capsule':
      return 'capsules'
    case 'ml':
      return 'mL'
    case 'other':
      return 'units'
  }
}

export function ScheduleForm({
  medicine,
  schedule,
  onCancel,
  onSaved,
}: ScheduleFormProps) {
  const today = localDateInTimeZone(new Date(), schedule.timezone)
  const firstEditableDate =
    schedule.effectiveFrom >= today ? nextDate(schedule.effectiveFrom) : today
  const [frequency, setFrequency] = useState<Frequency>(() =>
    frequencyOf(schedule.recurrence),
  )
  const [intervalDays, setIntervalDays] = useState(
    schedule.recurrence.type === 'interval'
      ? String(schedule.recurrence.intervalDays)
      : '2',
  )
  const [weekdays, setWeekdays] = useState<Weekday[]>(
    schedule.recurrence.type === 'weekdays'
      ? [...schedule.recurrence.weekdays]
      : [],
  )
  const [effectiveFrom, setEffectiveFrom] =
    useState<LocalDate>(firstEditableDate)
  const [endDate, setEndDate] = useState(schedule.endDate ?? '')
  const [quantity, setQuantity] = useState(
    formatQuantity(schedule.quantityPerDose as Quantity),
  )
  const [timingType, setTimingType] = useState(schedule.timing.type)
  const [window, setWindow] = useState<MealWindow | ''>(
    schedule.timing.type === 'meal' ? schedule.timing.window : '',
  )
  const [time, setTime] = useState(
    schedule.timing.type === 'custom' ? schedule.timing.time : '',
  )
  const [reminderTime, setReminderTime] = useState(
    schedule.timing.type === 'meal' ? (schedule.timing.reminderTime ?? '') : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function toggleWeekday(day: Weekday) {
    setWeekdays((current) =>
      current.includes(day)
        ? current.filter((selected) => selected !== day)
        : [...current, day].sort((left, right) => left - right),
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      let recurrence: Recurrence
      switch (frequency) {
        case 'daily':
          recurrence = { type: 'daily' }
          break
        case 'alternate':
          recurrence = { type: 'alternate' }
          break
        case 'weekdays':
          recurrence = { type: 'weekdays', weekdays }
          break
        case 'interval':
          recurrence = {
            type: 'interval',
            intervalDays: Number(intervalDays),
          }
          break
      }

      let timing: DoseTiming
      if (timingType === 'meal') {
        if (!window) throw new RangeError('Choose a meal window.')
        timing = {
          type: 'meal',
          window,
          reminderTime: reminderTime || null,
        }
      } else {
        timing = { type: 'custom', time }
      }

      await updateScheduleVersion(schedule.id, {
        effectiveFrom,
        endDate: endDate || null,
        quantity,
        recurrence,
        timing,
      })
      onSaved(effectiveFrom)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The schedule could not be saved. Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="medicine-form-card">
      <div className="form-card-heading">
        <div>
          <h2 className="section-title">Edit dose schedule</h2>
          <p className="page-note">
            {medicine.name} · the original start date remains the recurrence
            anchor.
          </p>
        </div>
        <Button
          className="button-secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
      <form className="medicine-form" onSubmit={handleSubmit}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="field-hint">
          This creates a new schedule version. Earlier dates keep the previous
          dose and timing details.
        </p>
        <div className="form-grid">
          <p className="field-hint">
            Original start date: <strong>{schedule.startDate}</strong>
          </p>
          <Input
            label={'Dose quantity (' + medicineUnitLabel(medicine.unit) + ')'}
            type="text"
            inputMode="decimal"
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <div className="field">
            <label className="field-label" htmlFor="schedule-frequency">
              Frequency
            </label>
            <select
              className="input"
              id="schedule-frequency"
              value={frequency}
              onChange={(event) =>
                setFrequency(event.target.value as Frequency)
              }
            >
              <option value="daily">Every day</option>
              <option value="alternate">Every other day</option>
              <option value="weekdays">Selected weekdays</option>
              <option value="interval">Every X days</option>
            </select>
          </div>
          {frequency === 'interval' && (
            <Input
              label="Repeat every (days)"
              type="number"
              min="1"
              step="1"
              required
              value={intervalDays}
              onChange={(event) => setIntervalDays(event.target.value)}
            />
          )}
          <Input
            label="Effective from"
            type="date"
            required
            min={firstEditableDate}
            value={effectiveFrom}
            onChange={(event) =>
              setEffectiveFrom(event.target.value as LocalDate)
            }
          />
          <Input
            label="End date (optional)"
            type="date"
            min={effectiveFrom}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
          <p className="field-hint form-span">
            Dates use {schedule.timezone}. Every-other-day and interval
            schedules keep the original anchor date.
          </p>
        </div>

        {frequency === 'weekdays' && (
          <fieldset className="weekday-picker">
            <legend className="field-label">Repeat on</legend>
            <div className="choice-list">
              {weekdayOptions.map(({ value, label }) => (
                <label className="choice" key={value}>
                  <input
                    type="checkbox"
                    checked={weekdays.includes(value)}
                    onChange={() => toggleWeekday(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="form-section">
          <h3 className="section-subtitle">Timing</h3>
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="schedule-timing-type">
                Timing type
              </label>
              <select
                className="input"
                id="schedule-timing-type"
                value={timingType}
                onChange={(event) =>
                  setTimingType(event.target.value as 'meal' | 'custom')
                }
              >
                <option value="meal">Meal window</option>
                <option value="custom">Custom clock time</option>
              </select>
            </div>
            {timingType === 'meal' ? (
              <>
                <div className="field">
                  <label className="field-label" htmlFor="schedule-meal-window">
                    Meal window
                  </label>
                  <select
                    className="input"
                    id="schedule-meal-window"
                    required
                    value={window}
                    onChange={(event) =>
                      setWindow(event.target.value as MealWindow)
                    }
                  >
                    <option value="" disabled>
                      Choose a meal window
                    </option>
                    {mealWindows.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Reminder time (optional)"
                  type="time"
                  hint="Saved as a preference. Notifications are planned for PR 09."
                  value={reminderTime}
                  onChange={(event) => setReminderTime(event.target.value)}
                />
              </>
            ) : (
              <Input
                label="Custom time"
                type="time"
                required
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            )}
          </div>
        </div>

        <div className="form-actions">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save schedule'}
          </Button>
          <Button
            className="button-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
