import { liveQuery } from 'dexie'
import {
  Archive,
  ArchiveRestore,
  Pause,
  Pencil,
  Pill,
  Play,
  Plus,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { db } from '../database/db'
import type {
  DoseSchedule,
  Medicine,
  StockTransaction,
} from '../database/models'
import { formatQuantity, type Quantity } from '../database/quantity'
import {
  localDateInTimeZone,
  setMedicineArchived,
  setSchedulePaused,
} from '../medicines/registration'
import { MedicineForm } from './MedicineForm'
import { ScheduleForm } from './ScheduleForm'

interface MedicineRecord {
  medicine: Medicine
  schedules: DoseSchedule[]
  stockTransactions: StockTransaction[]
}

const unitNames: Record<
  Medicine['unit'],
  { singular: string; plural: string }
> = {
  tablet: { singular: 'tablet', plural: 'tablets' },
  capsule: { singular: 'capsule', plural: 'capsules' },
  ml: { singular: 'mL', plural: 'mL' },
  other: { singular: 'unit', plural: 'units' },
}

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function recurrenceLabel(schedule: DoseSchedule) {
  switch (schedule.recurrence.type) {
    case 'daily':
      return 'Every day'
    case 'alternate':
      return 'Every other day'
    case 'weekdays':
      return schedule.recurrence.weekdays
        .map((day) => weekdayNames[day])
        .join(', ')
    case 'interval':
      return 'Every ' + schedule.recurrence.intervalDays + ' days'
  }
}

function timingLabel(schedule: DoseSchedule) {
  if (schedule.timing.type === 'custom') {
    return 'at ' + schedule.timing.time
  }
  const meal = schedule.timing.window
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  return schedule.timing.reminderTime
    ? meal + ' · reminder preference ' + schedule.timing.reminderTime
    : meal
}

function stockBalance(transactions: StockTransaction[]): string | null {
  const total = transactions.reduce(
    (sum, transaction) => sum + transaction.quantityDelta,
    0,
  )
  if (!Number.isSafeInteger(total)) return null
  return formatQuantity(total as Quantity)
}

function unitLabel(amount: string, unit: { singular: string; plural: string }) {
  const quantity = Number(amount)
  return quantity > 0 && quantity <= 1 ? unit.singular : unit.plural
}

function isPausedToday(schedule: DoseSchedule) {
  const today = localDateInTimeZone(new Date(), schedule.timezone)
  return schedule.pausePeriods.some(
    (pause) =>
      pause.startDate <= today &&
      (pause.endDate === null || pause.endDate >= today),
  )
}

export function Medicines() {
  const [records, setRecords] = useState<MedicineRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Medicine | undefined>()
  const [editingSchedule, setEditingSchedule] = useState<{
    medicine: Medicine
    schedule: DoseSchedule
  }>()
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const query = liveQuery(async () => {
      const [medicines, schedules, transactions] = await Promise.all([
        db.medicines.toArray(),
        db.doseSchedules.toArray(),
        db.stockTransactions.toArray(),
      ])
      return medicines
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((medicine) => ({
          medicine,
          schedules: schedules.filter(
            (schedule) => schedule.medicineId === medicine.id,
          ),
          stockTransactions: transactions.filter(
            (transaction) => transaction.medicineId === medicine.id,
          ),
        }))
    })
    const subscription = query.subscribe({
      next(value) {
        setRecords(value)
        setLoading(false)
        setLoadError(null)
      },
      error(error: unknown) {
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Saved medicine data could not be loaded.',
        )
        setLoading(false)
      },
    })
    return () => subscription.unsubscribe()
  }, [])

  function openAddForm() {
    setEditing(undefined)
    setEditingSchedule(undefined)
    setNotice(null)
    setActionError(null)
    setFormOpen(true)
  }

  function openEditForm(medicine: Medicine) {
    setEditing(medicine)
    setEditingSchedule(undefined)
    setNotice(null)
    setActionError(null)
    setFormOpen(true)
  }

  function openScheduleEdit(medicine: Medicine, schedule: DoseSchedule) {
    setEditing(undefined)
    setEditingSchedule({ medicine, schedule })
    setNotice(null)
    setActionError(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(undefined)
    setEditingSchedule(undefined)
  }

  async function runAction(key: string, action: () => Promise<unknown>) {
    setBusy(key)
    setActionError(null)
    setNotice(null)
    try {
      await action()
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : 'The change could not be saved. Please try again.',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <p className="page-kicker">A place for your routine</p>
      <div className="page-heading-row">
        <div>
          <h1 className="page-title">Medicines</h1>
          <p className="page-description">
            Your medicines, schedules, and recorded stock in one place.
          </p>
        </div>
        {!formOpen && records.length > 0 && (
          <Button onClick={openAddForm}>
            <Plus size={18} aria-hidden="true" />
            Add medicine
          </Button>
        )}
      </div>

      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      {(loadError || actionError) && (
        <p className="form-error" role="alert">
          {loadError ?? actionError}
        </p>
      )}

      {formOpen && editingSchedule && (
        <ScheduleForm
          key={editingSchedule.schedule.id}
          medicine={editingSchedule.medicine}
          schedule={editingSchedule.schedule}
          onCancel={closeForm}
          onSaved={(effectiveFrom) => {
            closeForm()
            setNotice('Schedule updated from ' + effectiveFrom + '.')
          }}
        />
      )}

      {formOpen && !editingSchedule && (
        <MedicineForm
          key={editing?.id ?? 'new'}
          editing={editing}
          onCancel={closeForm}
          onSaved={() => {
            closeForm()
            setNotice(editing ? 'Medicine details saved.' : 'Medicine saved.')
          }}
        />
      )}

      {loading && (
        <p className="page-note" role="status">
          Loading saved medicines…
        </p>
      )}

      {!loading && !formOpen && records.length === 0 && !loadError && (
        <EmptyState
          icon={<Pill size={32} />}
          title="Your list is ready"
          action={
            <Button onClick={openAddForm}>
              <Plus size={18} aria-hidden="true" />
              Add medicine
            </Button>
          }
        >
          Add a medicine and its dose routine. Your information stays in this
          browser.
        </EmptyState>
      )}

      {!loading && !formOpen && records.length > 0 && (
        <div className="medicine-list">
          {records.map(({ medicine, schedules, stockTransactions }) => {
            const balance = stockBalance(stockTransactions)
            const unit = unitNames[medicine.unit]
            return (
              <Card className="medicine-card" key={medicine.id}>
                <div className="medicine-card-top">
                  <div>
                    <div className="medicine-title-row">
                      <h2 className="medicine-name">{medicine.name}</h2>
                      {medicine.isArchived && (
                        <span className="status-badge">Archived</span>
                      )}
                    </div>
                    {medicine.strength && (
                      <p className="medicine-subtitle">{medicine.strength}</p>
                    )}
                  </div>
                  <p className="stock-value">
                    {balance === null
                      ? 'Stock unavailable'
                      : balance + ' ' + unitLabel(balance, unit)}
                    <span> recorded stock</span>
                  </p>
                </div>
                {medicine.description && (
                  <p className="medicine-copy">{medicine.description}</p>
                )}
                {medicine.notes && (
                  <p className="medicine-copy">Note: {medicine.notes}</p>
                )}
                <div className="schedule-list">
                  {schedules.length === 0 ? (
                    <p className="field-hint">No dose schedules saved.</p>
                  ) : (
                    schedules.map((schedule) => {
                      const paused = isPausedToday(schedule)
                      return (
                        <div className="schedule-row" key={schedule.id}>
                          <div>
                            <p className="schedule-title">
                              {formatQuantity(
                                schedule.quantityPerDose as Quantity,
                              )}{' '}
                              {unitLabel(
                                formatQuantity(
                                  schedule.quantityPerDose as Quantity,
                                ),
                                unit,
                              )}{' '}
                              · {timingLabel(schedule)}
                            </p>
                            <p className="field-hint">
                              {recurrenceLabel(schedule)} · starts{' '}
                              {schedule.startDate}
                              {' · version ' + schedule.version}
                              {schedule.effectiveTo
                                ? ' · replaced from ' + schedule.effectiveTo
                                : ''}
                              {schedule.endDate
                                ? ' · ends ' + schedule.endDate
                                : ''}
                              {paused ? ' · Paused' : ''}
                            </p>
                          </div>
                          <Button
                            className="button-secondary button-small"
                            disabled={
                              busy === schedule.id ||
                              medicine.isArchived ||
                              schedule.effectiveTo !== null
                            }
                            onClick={() => openScheduleEdit(medicine, schedule)}
                            aria-label={'Edit schedule for ' + medicine.name}
                          >
                            <Pencil size={16} aria-hidden="true" />
                            Edit schedule
                          </Button>
                          <Button
                            className="button-secondary button-small"
                            disabled={
                              busy === schedule.id ||
                              medicine.isArchived ||
                              schedule.effectiveTo !== null
                            }
                            onClick={() =>
                              void runAction(schedule.id, () =>
                                setSchedulePaused(
                                  schedule.id,
                                  !paused,
                                  localDateInTimeZone(
                                    new Date(),
                                    schedule.timezone,
                                  ),
                                ),
                              )
                            }
                            aria-label={
                              (paused
                                ? 'Resume schedule for '
                                : 'Pause schedule for ') + medicine.name
                            }
                          >
                            {paused ? (
                              <Play size={16} aria-hidden="true" />
                            ) : (
                              <Pause size={16} aria-hidden="true" />
                            )}
                            {paused ? 'Resume' : 'Pause'}
                          </Button>
                        </div>
                      )
                    })
                  )}
                </div>
                <div className="medicine-actions">
                  <Button
                    className="button-secondary button-small"
                    onClick={() => openEditForm(medicine)}
                  >
                    <Pencil size={16} aria-hidden="true" />
                    Edit details
                  </Button>
                  <Button
                    className="button-secondary button-small"
                    disabled={busy === medicine.id}
                    onClick={() =>
                      void runAction(medicine.id, () =>
                        setMedicineArchived(medicine.id, !medicine.isArchived),
                      )
                    }
                  >
                    {medicine.isArchived ? (
                      <ArchiveRestore size={16} aria-hidden="true" />
                    ) : (
                      <Archive size={16} aria-hidden="true" />
                    )}
                    {medicine.isArchived ? 'Restore' : 'Archive'}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
