import { liveQuery } from 'dexie'
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pill,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../database/db'
import type { DoseTiming, LocalDate } from '../database/models'
import { formatQuantity } from '../database/quantity'
import {
  getAnalyticsMonth,
  type AnalyticsReport,
  type HistoryDose,
} from '../analytics/service'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EVENT_LABELS: Record<string, string> = {
  taken: 'Marked taken',
  skipped: 'Marked skipped',
  snoozed: 'Reminder moved later',
  undone: 'Action undone',
  corrected: 'Dose corrected',
}

function localDate(now = new Date()): LocalDate {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

function monthOf(date: LocalDate) {
  return date.slice(0, 7)
}

function formatMonth(month: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T12:00:00`))
}

function formatDate(date: LocalDate, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(new Date(`${date}T12:00:00`))
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function getMonthOffset(month: string, amount: number) {
  const date = new Date(`${month}-01T12:00:00`)
  date.setMonth(date.getMonth() + amount)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function timingLabel(timing: DoseTiming) {
  if (timing.type === 'custom') return `At ${timing.time}`
  return timing.window
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

function statusLabel(status: HistoryDose['status']) {
  switch (status) {
    case 'taken':
      return 'Taken'
    case 'skipped':
      return 'Skipped'
    case 'unconfirmed':
      return 'Unconfirmed'
    case 'pending':
      return 'Pending today'
  }
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="analytics-metric">
      <p className="analytics-metric-label">{label}</p>
      <p className="analytics-metric-value">{value}</p>
    </Card>
  )
}

function DoseHistoryCard({ dose }: { dose: HistoryDose }) {
  const { occurrence } = dose
  return (
    <Card className="history-dose">
      <div className="history-dose-heading">
        <div className="history-dose-icon" aria-hidden="true">
          <Pill size={18} />
        </div>
        <div className="history-dose-copy">
          <h3 className="history-dose-name">{occurrence.medicineName}</h3>
          <p className="history-dose-detail">
            {formatQuantity(occurrence.scheduledQuantity)} {occurrence.unit} ·{' '}
            {timingLabel(occurrence.timing)}
          </p>
          {dose.archived && (
            <p className="history-archived">Archived medicine</p>
          )}
        </div>
        <span
          className={`status-badge history-status history-status-${dose.status}`}
        >
          {statusLabel(dose.status)}
        </span>
      </div>
      {occurrence.takenAt && (
        <p className="history-taken-time">
          Taken at{' '}
          <time dateTime={occurrence.takenAt}>
            {formatTime(occurrence.takenAt)}
          </time>
        </p>
      )}
      {dose.events.length > 0 && (
        <details className="history-audit">
          <summary>History and corrections ({dose.events.length})</summary>
          <ol>
            {dose.events.map((event) => (
              <li key={event.id}>
                <span>{EVENT_LABELS[event.action] ?? 'Dose updated'}</span>
                <time dateTime={event.recordedAt}>
                  {formatTime(event.recordedAt)}
                </time>
                {event.note && (
                  <span className="history-event-note">{event.note}</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  )
}

export function Insights() {
  const initialDate = localDate()
  const [month, setMonth] = useState(monthOf(initialDate))
  const [selectedDate, setSelectedDate] = useState<LocalDate>(initialDate)
  const [medicineId, setMedicineId] = useState('all')
  const [reportState, setReportState] = useState<{
    key: string
    report: AnalyticsReport
  } | null>(null)
  const [errorState, setErrorState] = useState<{
    key: string
    message: string
  } | null>(null)
  const queryKey = `${month}:${medicineId}`
  const report = reportState?.key === queryKey ? reportState.report : null
  const error = errorState?.key === queryKey ? errorState.message : null
  const loading = report === null && error === null

  useEffect(() => {
    const subscription = liveQuery(() =>
      getAnalyticsMonth(
        { month, medicineId: medicineId === 'all' ? null : medicineId },
        db,
      ),
    ).subscribe({
      next(nextReport) {
        setReportState({ key: queryKey, report: nextReport })
        setErrorState(null)
      },
      error() {
        setErrorState({
          key: queryKey,
          message: 'History could not be loaded from this device.',
        })
      },
    })
    return () => subscription.unsubscribe()
  }, [month, medicineId, queryKey])

  const selectedDay = report?.days.find((day) => day.date === selectedDate)
  const selectedDoses = useMemo(
    () =>
      report?.doses.filter(
        ({ occurrence }) => occurrence.scheduledDate === selectedDate,
      ) ?? [],
    [report, selectedDate],
  )
  const monthStartWeekday = useMemo(() => {
    const day = new Date(`${month}-01T12:00:00`).getDay()
    return (day + 6) % 7
  }, [month])
  const currentMonth = monthOf(localDate())
  const canGoNext = month < currentMonth

  function selectMonth(offset: number) {
    const nextMonth = getMonthOffset(month, offset)
    setMonth(nextMonth)
    const date = new Date(`${nextMonth}-01T12:00:00`)
    if (offset < 0) date.setMonth(date.getMonth() + 1, 0)
    const nextDate = new Date(
      Math.min(date.getTime(), new Date(`${localDate()}T12:00:00`).getTime()),
    )
    setSelectedDate(localDate(nextDate))
  }

  return (
    <>
      <p className="page-kicker">See the bigger picture</p>
      <h1 className="page-title">Insights</h1>
      <p className="page-description">
        Review dose history, corrections, and adherence on this device. Future
        doses are excluded; pending doses from past dates are counted as
        unconfirmed.
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="analytics-toolbar">
        <label className="field analytics-filter">
          <span className="field-label">Medicine</span>
          <select
            className="input"
            value={medicineId}
            onChange={(event) => setMedicineId(event.target.value)}
          >
            <option value="all">All medicines</option>
            {report?.medicines.map((medicine) => (
              <option key={medicine.id} value={medicine.id}>
                {medicine.name}
                {medicine.isArchived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="analytics-month-controls" aria-label="Calendar month">
          <button
            className="button button-secondary button-small"
            type="button"
            aria-label="Previous month"
            onClick={() => selectMonth(-1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h2 className="analytics-month-title" aria-live="polite">
            {formatMonth(month)}
          </h2>
          <button
            className="button button-secondary button-small"
            type="button"
            aria-label="Next month"
            disabled={!canGoNext}
            onClick={() => selectMonth(1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {loading && <p role="status">Loading history…</p>}

      {report && !error && (
        <>
          <section className="analytics-metrics" aria-label="Monthly summary">
            <Metric label="Taken" value={report.totals.taken} />
            <Metric label="Skipped" value={report.totals.skipped} />
            <Metric label="Unconfirmed" value={report.totals.unconfirmed} />
            <Metric
              label="Adherence"
              value={
                report.totals.adherence === null
                  ? '—'
                  : `${report.totals.adherence}%`
              }
            />
          </section>
          <p className="analytics-adherence-note">
            Adherence is taken doses divided by taken plus skipped doses.
            Unconfirmed and today-pending doses are reported separately.
          </p>

          {report.medicines.length === 0 ? (
            <EmptyState
              icon={<Activity size={32} />}
              title="No dose history yet"
            >
              Add a medicine and schedule to start building a local history.
              Your dose records stay on this device.
            </EmptyState>
          ) : (
            <div className="analytics-layout">
              <Card className="calendar-card">
                <div className="calendar-heading">
                  <CalendarDays size={20} aria-hidden="true" />
                  <h2 className="section-title">Dose calendar</h2>
                </div>
                <div className="calendar-weekdays" aria-hidden="true">
                  {WEEKDAYS.map((weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ))}
                </div>
                <div
                  className="calendar-days"
                  aria-label={`${formatMonth(month)} dose calendar`}
                >
                  {Array.from({ length: monthStartWeekday }, (_, index) => (
                    <span
                      className="calendar-spacer"
                      key={`spacer-${index}`}
                      aria-hidden="true"
                    />
                  ))}
                  {report.days.map((day) => {
                    const isSelected = day.date === selectedDate
                    const isToday = day.date === report.today
                    return (
                      <button
                        key={day.date}
                        type="button"
                        className={`calendar-day${isSelected ? ' calendar-day-selected' : ''}${day.isFuture ? ' calendar-day-future' : ''}`}
                        aria-pressed={isSelected}
                        aria-label={`${formatDate(day.date)}${day.isFuture ? ', future date' : `, ${day.taken} taken, ${day.skipped} skipped, ${day.unconfirmed} unconfirmed, ${day.pending} pending`}`}
                        disabled={day.isFuture}
                        onClick={() => setSelectedDate(day.date)}
                      >
                        <span className="calendar-day-number">
                          {Number(day.date.slice(-2))}
                          {isToday && (
                            <span className="calendar-today">Today</span>
                          )}
                        </span>
                        {!day.isFuture && day.total > 0 && (
                          <span className="calendar-day-counts">
                            <span aria-label={`${day.taken} taken`}>
                              {day.taken}✓
                            </span>
                            <span aria-label={`${day.skipped} skipped`}>
                              {day.skipped}–
                            </span>
                            <span aria-label={`${day.unconfirmed} unconfirmed`}>
                              {day.unconfirmed}?
                            </span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="calendar-legend">
                  ✓ taken · – skipped · ? unconfirmed from past dates
                </p>
              </Card>

              <section
                className="history-detail"
                aria-labelledby="history-date"
              >
                <div className="history-detail-heading">
                  <div>
                    <p className="page-kicker">Selected day</p>
                    <h2 className="section-title" id="history-date">
                      {selectedDate
                        ? formatDate(selectedDate)
                        : 'Choose a date'}
                    </h2>
                  </div>
                  <Clock3 size={22} aria-hidden="true" />
                </div>
                {selectedDay && selectedDay.total > 0 && (
                  <p className="history-day-summary" role="status">
                    {selectedDay.taken} taken · {selectedDay.skipped} skipped ·{' '}
                    {selectedDay.unconfirmed} unconfirmed
                    {selectedDay.pending > 0 &&
                      ` · ${selectedDay.pending} pending today`}
                  </p>
                )}
                {selectedDoses.length === 0 ? (
                  <EmptyState
                    icon={<CalendarDays size={28} />}
                    title="No doses for this date"
                  >
                    No doses are recorded or scheduled for this day.
                  </EmptyState>
                ) : (
                  <div className="history-dose-list">
                    {selectedDoses.map((dose) => (
                      <DoseHistoryCard key={dose.occurrence.id} dose={dose} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}

      <p className="page-note analytics-note">
        <Activity size={16} aria-hidden="true" />
        History and adherence are calculated from saved schedule versions and
        local dose records. No health data is sent to a server.
      </p>
    </>
  )
}
