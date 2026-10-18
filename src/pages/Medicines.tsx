import { liveQuery } from 'dexie'
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Pause,
  Pencil,
  Pill,
  Play,
  Plus,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { db } from '../database/db'
import type {
  DoseSchedule,
  Medicine,
  ReminderPreference,
  StockTransaction,
} from '../database/models'
import { formatQuantity, type Quantity } from '../database/quantity'
import {
  localDateInTimeZone,
  setMedicineArchived,
  setSchedulePaused,
} from '../medicines/registration'
import { adjustStock, listStockHistory, refillStock } from '../stock/ledger'
import { calculateStockForecast, type StockForecast } from '../stock/forecast'
import {
  browserNotificationAdapter,
  type ReminderPermission,
} from '../reminders/platform'
import {
  requestNotificationPermission,
  setScheduleReminderEnabled,
} from '../reminders/service'
import { MedicineForm } from './MedicineForm'
import { ScheduleForm } from './ScheduleForm'

interface MedicineRecord {
  medicine: Medicine
  schedules: DoseSchedule[]
  reminderPreferences: ReminderPreference[]
  stockTransactions: StockTransaction[]
  forecast: StockForecast
}

type StockAction = 'refill' | 'adjustment'

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

function hasReminderTime(schedule: DoseSchedule) {
  return (
    schedule.timing.type === 'custom' || schedule.timing.reminderTime !== null
  )
}

function permissionLabel(permission: ReminderPermission) {
  switch (permission) {
    case 'granted':
      return 'allowed'
    case 'denied':
      return 'blocked in browser settings'
    case 'unsupported':
      return 'not supported in this browser'
    case 'prompt':
      return 'not requested'
  }
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
  const [stockAction, setStockAction] = useState<{
    medicineId: string
    kind: StockAction
  }>()
  const [busy, setBusy] = useState<string | null>(null)
  const [notificationPermission, setNotificationPermission] =
    useState<ReminderPermission>(() =>
      browserNotificationAdapter.permissionStatus(),
    )

  useEffect(() => {
    const query = liveQuery(async () => {
      const [medicines, schedules, transactions, reminderPreferences] =
        await Promise.all([
          db.medicines.toArray(),
          db.doseSchedules.toArray(),
          db.stockTransactions.toArray(),
          db.reminderPreferences.toArray(),
        ])
      const now = new Date()
      return medicines
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((medicine) => {
          const medicineSchedules = schedules.filter(
            (schedule) => schedule.medicineId === medicine.id,
          )
          const medicineTransactions = transactions.filter(
            (transaction) => transaction.medicineId === medicine.id,
          )
          return {
            medicine,
            schedules: medicineSchedules,
            reminderPreferences: reminderPreferences.filter((preference) =>
              medicineSchedules.some(
                (schedule) => schedule.id === preference.scheduleId,
              ),
            ),
            stockTransactions: medicineTransactions,
            forecast: calculateStockForecast(
              medicine,
              medicineSchedules,
              medicineTransactions,
              now,
            ),
          }
        })
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

      <section className="reminder-settings" aria-label="Reminder settings">
        <div>
          <h2 className="section-subtitle">Dose reminders</h2>
          <p className="field-hint">
            Browser permission: {permissionLabel(notificationPermission)}.
            Reminders run while MedTrack is open in this browser.
          </p>
          {notificationPermission === 'denied' && (
            <p className="field-hint">
              Allow notifications for this site in your browser settings, then
              reload MedTrack.
            </p>
          )}
        </div>
        {notificationPermission === 'prompt' && (
          <Button
            className="button-secondary button-small"
            disabled={busy === 'notification-permission'}
            onClick={() =>
              void runAction('notification-permission', async () => {
                const permission = await requestNotificationPermission()
                setNotificationPermission(permission)
                setNotice(
                  permission === 'granted'
                    ? 'Browser notifications are enabled.'
                    : 'Browser notification permission was not granted.',
                )
              })
            }
          >
            Enable browser notifications
          </Button>
        )}
      </section>

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
          {records.map(
            ({
              medicine,
              schedules,
              reminderPreferences,
              stockTransactions,
              forecast,
            }) => {
              const balance =
                forecast.balance === null
                  ? null
                  : formatQuantity(forecast.balance)
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
                      {forecast.lowStock && (
                        <span className="status-badge" role="status">
                          Low stock
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="field-hint" aria-live="polite">
                    {forecast.daysOfSupply === null
                      ? 'Supply estimate unavailable without upcoming doses.'
                      : `About ${forecast.daysOfSupply.toFixed(1)} days of supply · projected stock-out ${forecast.stockOutDate ?? 'beyond the next year'}`}
                  </p>
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
                        const reminder = reminderPreferences.find(
                          (preference) => preference.scheduleId === schedule.id,
                        )
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
                              onClick={() =>
                                openScheduleEdit(medicine, schedule)
                              }
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
                            {hasReminderTime(schedule) && reminder && (
                              <Button
                                className="button-secondary button-small"
                                disabled={
                                  busy === schedule.id ||
                                  medicine.isArchived ||
                                  schedule.effectiveTo !== null ||
                                  notificationPermission === 'unsupported'
                                }
                                onClick={() =>
                                  void runAction(schedule.id, async () => {
                                    try {
                                      const enabled =
                                        await setScheduleReminderEnabled(
                                          schedule.id,
                                          !reminder.enabled,
                                        )
                                      setNotificationPermission(
                                        browserNotificationAdapter.permissionStatus(),
                                      )
                                      setNotice(
                                        enabled
                                          ? 'Dose reminder enabled.'
                                          : 'Dose reminder disabled.',
                                      )
                                    } finally {
                                      setNotificationPermission(
                                        browserNotificationAdapter.permissionStatus(),
                                      )
                                    }
                                  })
                                }
                                aria-label={
                                  (reminder.enabled
                                    ? 'Disable reminder for '
                                    : 'Enable reminder for ') + medicine.name
                                }
                              >
                                {reminder.enabled ? (
                                  <BellOff size={16} aria-hidden="true" />
                                ) : (
                                  <Bell size={16} aria-hidden="true" />
                                )}
                                {reminder.enabled
                                  ? 'Disable reminder'
                                  : 'Enable reminder'}
                              </Button>
                            )}
                            {!hasReminderTime(schedule) && (
                              <p className="field-hint">
                                Add a custom or reminder clock time to enable
                                notifications.
                              </p>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                  <div className="medicine-actions">
                    <Button
                      className="button-secondary button-small"
                      disabled={busy === medicine.id || medicine.isArchived}
                      aria-label={'Refill stock for ' + medicine.name}
                      onClick={() =>
                        setStockAction({
                          medicineId: medicine.id,
                          kind: 'refill',
                        })
                      }
                    >
                      <Plus size={16} aria-hidden="true" />
                      Refill stock
                    </Button>
                    <Button
                      className="button-secondary button-small"
                      disabled={busy === medicine.id || medicine.isArchived}
                      aria-label={'Adjust stock for ' + medicine.name}
                      onClick={() =>
                        setStockAction({
                          medicineId: medicine.id,
                          kind: 'adjustment',
                        })
                      }
                    >
                      Adjust stock
                    </Button>
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
                          setMedicineArchived(
                            medicine.id,
                            !medicine.isArchived,
                          ),
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
                  {stockAction?.medicineId === medicine.id && (
                    <StockActionForm
                      key={medicine.id + stockAction.kind}
                      medicine={medicine}
                      kind={stockAction.kind}
                      busy={busy === medicine.id}
                      onCancel={() => setStockAction(undefined)}
                      onSave={async (quantity, note) => {
                        if (stockAction.kind === 'refill') {
                          await refillStock(medicine.id, quantity, note)
                        } else {
                          await adjustStock(medicine.id, quantity, note)
                        }
                        setStockAction(undefined)
                        setNotice(
                          stockAction.kind === 'refill'
                            ? 'Stock refill recorded.'
                            : 'Stock adjustment recorded.',
                        )
                      }}
                      onBusy={(isBusy) => setBusy(isBusy ? medicine.id : null)}
                    />
                  )}
                  {stockTransactions.length > 0 && (
                    <details className="stock-history">
                      <summary>
                        Stock history ({stockTransactions.length})
                      </summary>
                      <ul>
                        {listStockHistory(stockTransactions).map(
                          (transaction) => {
                            const kind =
                              transaction.transactionType === 'initial'
                                ? 'Starting stock'
                                : transaction.transactionType === 'consumption'
                                  ? 'Dose taken'
                                  : transaction.transactionType === 'reversal'
                                    ? 'Undo'
                                    : transaction.transactionType === 'refill'
                                      ? 'Refill'
                                      : 'Adjustment'
                            const amount = formatQuantity(
                              Math.abs(transaction.quantityDelta) as Quantity,
                            )
                            const sign =
                              transaction.quantityDelta > 0 ? '+' : '−'
                            return (
                              <li key={transaction.id}>
                                <span>
                                  {kind} · {sign}
                                  {amount} {unitLabel(amount, unit)}
                                </span>
                                {transaction.note && (
                                  <span>Reason: {transaction.note}</span>
                                )}
                                <time dateTime={transaction.createdAt}>
                                  {new Date(
                                    transaction.createdAt,
                                  ).toLocaleString()}
                                </time>
                              </li>
                            )
                          },
                        )}
                      </ul>
                    </details>
                  )}
                </Card>
              )
            },
          )}
        </div>
      )}
    </>
  )
}

function StockActionForm({
  medicine,
  kind,
  busy,
  onCancel,
  onSave,
  onBusy,
}: {
  medicine: Medicine
  kind: StockAction
  busy: boolean
  onCancel: () => void
  onSave: (quantity: string, note: string) => Promise<void>
  onBusy: (busy: boolean) => void
}) {
  const unit = unitNames[medicine.unit]
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isRefill = kind === 'refill'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    onBusy(true)
    try {
      await onSave(quantity, note)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Stock could not be updated. Please try again.',
      )
    } finally {
      onBusy(false)
    }
  }

  return (
    <form className="medicine-form stock-action-form" onSubmit={handleSubmit}>
      <h3 className="section-subtitle">
        {isRefill ? 'Record a refill' : 'Adjust recorded stock'}
      </h3>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-grid">
        <Input
          label={
            isRefill
              ? `Refill quantity (${unit.plural})`
              : `Adjustment quantity (${unit.plural}; use a minus sign to remove stock)`
          }
          inputMode="decimal"
          type="text"
          required
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <Input
          label={isRefill ? 'Refill note (optional)' : 'Adjustment reason'}
          required={!isRefill}
          maxLength={240}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="medicine-actions">
        <Button type="submit" disabled={busy}>
          {isRefill ? 'Record refill' : 'Save adjustment'}
        </Button>
        <Button className="button-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
