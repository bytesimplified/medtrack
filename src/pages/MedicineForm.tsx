import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import type {
  DoseTiming,
  LocalDate,
  MealWindow,
  Medicine,
  MedicineUnit,
  Recurrence,
  Weekday,
} from '../database/models'
import {
  localDateInTimeZone,
  registerMedicine,
  updateMedicineDetails,
} from '../medicines/registration'

interface MedicineFormProps {
  editing?: Medicine
  onCancel: () => void
  onSaved: () => void
}

type Frequency = '' | 'daily' | 'alternate' | 'weekdays' | 'interval'
type DoseFormValue = {
  id: string
  quantity: string
  timingType: 'meal' | 'custom'
  window: MealWindow | ''
  time: string
  reminderTime: string
}

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

const unitOptions: Array<{ value: MedicineUnit; label: string }> = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'ml', label: 'mL' },
  { value: 'other', label: 'Other' },
]

function newDose(): DoseFormValue {
  return {
    id: crypto.randomUUID(),
    quantity: '',
    timingType: 'meal',
    window: '',
    time: '',
    reminderTime: '',
  }
}

function initialDate() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return localDateInTimeZone(new Date(), timezone)
}

function quantityUnit(unit: MedicineUnit | '') {
  if (unit === 'tablet') return 'tablets'
  if (unit === 'capsule') return 'capsules'
  if (unit === 'ml') return 'mL'
  return 'units'
}

export function MedicineForm({
  editing,
  onCancel,
  onSaved,
}: MedicineFormProps) {
  const [name, setName] = useState(editing?.name ?? '')
  const [strength, setStrength] = useState(editing?.strength ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [unit, setUnit] = useState<MedicineUnit | ''>(editing?.unit ?? '')
  const [initialStock, setInitialStock] = useState('')
  const [lowStockDays, setLowStockDays] = useState(
    String(editing?.lowStockDays ?? 5),
  )
  const [frequency, setFrequency] = useState<Frequency>('')
  const [intervalDays, setIntervalDays] = useState('2')
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [startDate, setStartDate] = useState<LocalDate>(initialDate)
  const [endDate, setEndDate] = useState('')
  const [timezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  )
  const [doses, setDoses] = useState<DoseFormValue[]>(() => [newDose()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function updateDose(id: string, update: Partial<DoseFormValue>) {
    setDoses((current) =>
      current.map((dose) => (dose.id === id ? { ...dose, ...update } : dose)),
    )
  }

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
      if (editing) {
        await updateMedicineDetails(editing.id, {
          name,
          strength,
          description,
          notes,
          unit: unit as MedicineUnit,
          lowStockDays: Number(lowStockDays),
        })
      } else {
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
          default:
            throw new RangeError('Choose a schedule frequency.')
        }
        if (!unit) throw new RangeError('Choose a medicine unit.')

        const doseInputs: Array<{ quantity: string; timing: DoseTiming }> =
          doses.map((dose) => {
            if (dose.timingType === 'meal') {
              if (!dose.window) {
                throw new RangeError('Choose a meal window for each dose.')
              }
              return {
                quantity: dose.quantity,
                timing: {
                  type: 'meal',
                  window: dose.window,
                  reminderTime: dose.reminderTime || null,
                },
              }
            }
            return {
              quantity: dose.quantity,
              timing: { type: 'custom', time: dose.time },
            }
          })

        await registerMedicine({
          name,
          strength,
          description,
          notes,
          unit: unit as MedicineUnit,
          initialStock,
          lowStockDays: Number(lowStockDays),
          recurrence,
          startDate,
          endDate: endDate || null,
          timezone,
          doses: doseInputs,
        })
      }
      onSaved()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The medicine could not be saved. Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="medicine-form-card">
      <div className="form-card-heading">
        <div>
          <h2 className="section-title">
            {editing ? 'Edit medicine details' : 'Add a medicine'}
          </h2>
          <p className="page-note">
            {editing
              ? 'Update the label and notes saved with this medicine.'
              : 'Add the medicine details and the dose routine you want to track.'}
          </p>
        </div>
        <Button
          className="button-secondary"
          aria-label="Cancel medicine form"
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

        <div className="form-grid">
          <Input
            label="Medicine name"
            autoComplete="off"
            maxLength={120}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label="Strength (optional)"
            placeholder="For example, 1000 IU"
            maxLength={120}
            value={strength}
            onChange={(event) => setStrength(event.target.value)}
          />
          <div className="field">
            <label className="field-label" htmlFor="medicine-unit">
              Unit
            </label>
            <select
              className="input"
              id="medicine-unit"
              value={unit}
              required
              disabled={Boolean(editing)}
              onChange={(event) => setUnit(event.target.value as MedicineUnit)}
            >
              <option value="" disabled>
                Choose a unit
              </option>
              {unitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {editing && (
              <p className="field-hint">
                Unit stays fixed once schedules or stock history exist.
              </p>
            )}
          </div>
          <Input
            label="Low-stock estimate threshold (days)"
            type="number"
            inputMode="numeric"
            min="0"
            max="3650"
            step="1"
            value={lowStockDays}
            onChange={(event) => setLowStockDays(event.target.value)}
          />
          <div className="field form-span">
            <label className="field-label" htmlFor="medicine-description">
              Description (optional)
            </label>
            <textarea
              className="input"
              id="medicine-description"
              rows={2}
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="field form-span">
            <label className="field-label" htmlFor="medicine-notes">
              Notes (optional)
            </label>
            <textarea
              className="input"
              id="medicine-notes"
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        {!editing && (
          <>
            <div className="form-section">
              <h3 className="section-subtitle">Dose schedule</h3>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label" htmlFor="medicine-frequency">
                    Frequency
                  </label>
                  <select
                    className="input"
                    id="medicine-frequency"
                    value={frequency}
                    required
                    onChange={(event) =>
                      setFrequency(event.target.value as Frequency)
                    }
                  >
                    <option value="" disabled>
                      Choose a frequency
                    </option>
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
                  label="Start date"
                  type="date"
                  required
                  value={startDate}
                  onChange={(event) =>
                    setStartDate(event.target.value as LocalDate)
                  }
                />
                <Input
                  label="End date (optional)"
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
                <p className="field-hint form-span">
                  Dates use {timezone}. The start date anchors every-other-day
                  and interval schedules.
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
            </div>

            <div className="form-section">
              <div className="form-section-heading">
                <div>
                  <h3 className="section-subtitle">Daily dose times</h3>
                  <p className="field-hint">
                    Add each dose slot. “After lunch” stays a meal label and
                    does not set a clock time.
                  </p>
                </div>
                <Button
                  className="button-secondary"
                  onClick={() => setDoses((current) => [...current, newDose()])}
                >
                  Add dose time
                </Button>
              </div>
              <div className="dose-slot-list">
                {doses.map((dose, index) => (
                  <fieldset className="dose-slot" key={dose.id}>
                    <legend>Dose {index + 1}</legend>
                    <div className="form-grid">
                      <Input
                        label={'Dose quantity (' + quantityUnit(unit) + ')'}
                        type="text"
                        inputMode="decimal"
                        required
                        value={dose.quantity}
                        onChange={(event) =>
                          updateDose(dose.id, { quantity: event.target.value })
                        }
                      />
                      <div className="field">
                        <label
                          className="field-label"
                          htmlFor={'dose-timing-' + dose.id}
                        >
                          Timing for dose {index + 1}
                        </label>
                        <select
                          className="input"
                          id={'dose-timing-' + dose.id}
                          value={dose.timingType}
                          onChange={(event) =>
                            updateDose(dose.id, {
                              timingType: event.target.value as
                                'meal' | 'custom',
                            })
                          }
                        >
                          <option value="meal">Meal window</option>
                          <option value="custom">Custom clock time</option>
                        </select>
                      </div>
                      {dose.timingType === 'meal' ? (
                        <>
                          <div className="field">
                            <label
                              className="field-label"
                              htmlFor={'dose-window-' + dose.id}
                            >
                              Meal window
                            </label>
                            <select
                              className="input"
                              id={'dose-window-' + dose.id}
                              value={dose.window}
                              required
                              onChange={(event) =>
                                updateDose(dose.id, {
                                  window: event.target.value as MealWindow,
                                })
                              }
                            >
                              <option value="" disabled>
                                Choose a meal window
                              </option>
                              {mealWindows.map((window) => (
                                <option key={window.value} value={window.value}>
                                  {window.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Input
                            label="Reminder time (optional)"
                            type="time"
                            hint="Saved as a preference. Notifications are planned for PR 09."
                            value={dose.reminderTime}
                            onChange={(event) =>
                              updateDose(dose.id, {
                                reminderTime: event.target.value,
                              })
                            }
                          />
                        </>
                      ) : (
                        <Input
                          label="Custom time"
                          type="time"
                          required
                          value={dose.time}
                          onChange={(event) =>
                            updateDose(dose.id, { time: event.target.value })
                          }
                        />
                      )}
                      {doses.length > 1 && (
                        <div className="dose-remove">
                          <Button
                            className="button-secondary"
                            aria-label={'Remove dose ' + (index + 1)}
                            onClick={() =>
                              setDoses((current) =>
                                current.filter((item) => item.id !== dose.id),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3 className="section-subtitle">Starting stock</h3>
              <div className="form-grid">
                <Input
                  label={'Starting stock (' + quantityUnit(unit) + ')'}
                  type="text"
                  inputMode="decimal"
                  required
                  hint="Use 0 if you do not know the amount yet. Stock is recorded as a ledger entry."
                  value={initialStock}
                  onChange={(event) => setInitialStock(event.target.value)}
                />
              </div>
            </div>
          </>
        )}

        <div className="form-actions">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save details' : 'Save medicine'}
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
