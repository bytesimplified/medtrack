import { liveQuery } from 'dexie'
import {
  CalendarDays,
  Check,
  Clock3,
  Pill,
  SkipForward,
  Undo2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { db } from '../database/db'
import type { DoseOccurrence, MedicineUnit } from '../database/models'
import { formatQuantity, type Quantity } from '../database/quantity'
import {
  markDoseSkipped,
  markDoseTaken,
  snoozeDoseLater,
  undoDose,
} from '../doses/service'
import { getTodayDashboard, type TodayDashboard } from '../today/dashboard'
import { ensureTodayOccurrences } from '../today/occurrences'

const unitNames: Record<MedicineUnit, { singular: string; plural: string }> = {
  tablet: { singular: 'tablet', plural: 'tablets' },
  capsule: { singular: 'capsule', plural: 'capsules' },
  ml: { singular: 'mL', plural: 'mL' },
  other: { singular: 'unit', plural: 'units' },
}

function quantityLabel(occurrence: DoseOccurrence) {
  const quantity = Number(formatQuantity(occurrence.scheduledQuantity))
  const unit = unitNames[occurrence.unit]
  return (
    formatQuantity(occurrence.scheduledQuantity) +
    ' ' +
    (quantity > 0 && quantity <= 1 ? unit.singular : unit.plural)
  )
}

function stockLabel(
  occurrence: DoseOccurrence,
  balance: Quantity | null | undefined,
) {
  if (balance === undefined) return 'Stock not recorded'
  if (balance === null) return 'Stock balance unavailable'
  const quantity = Number(formatQuantity(balance))
  const unit = unitNames[occurrence.unit]
  return (
    formatQuantity(balance) +
    ' ' +
    (quantity > 0 && quantity <= 1 ? unit.singular : unit.plural) +
    ' recorded stock'
  )
}

function statusLabel(status: DoseOccurrence['status']) {
  switch (status) {
    case 'taken':
      return 'Taken'
    case 'skipped':
      return 'Skipped'
    case 'pending':
      return 'Pending'
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Today’s schedule could not be loaded from this device.'
}

function snoozeLabel(occurrence: DoseOccurrence) {
  if (!occurrence.snoozedUntil) return null
  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: occurrence.timezone,
  }).format(new Date(occurrence.snoozedUntil))
  return 'Reminder moved to ' + time
}

export function Today() {
  const [clock, setClock] = useState(() => new Date())
  const [dashboard, setDashboard] = useState<TodayDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [busyOccurrence, setBusyOccurrence] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let mounted = true
    let subscription: { unsubscribe: () => void } | undefined

    void ensureTodayOccurrences(db, clock)
      .then(() => {
        if (!mounted) return
        subscription = liveQuery(() => getTodayDashboard(db, clock)).subscribe({
          next(value) {
            if (!mounted) return
            setDashboard(value)
            setLoading(false)
            setLoadError(null)
          },
          error(error: unknown) {
            if (!mounted) return
            setLoadError(errorMessage(error))
            setLoading(false)
          },
        })
      })
      .catch((error: unknown) => {
        if (!mounted) return
        setLoadError(errorMessage(error))
        setLoading(false)
      })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [clock])

  const progress = dashboard?.progress
  const isEverythingPaused =
    !!dashboard &&
    dashboard.applicableScheduleCount > 0 &&
    dashboard.pausedScheduleCount === dashboard.applicableScheduleCount

  async function runDoseAction(
    occurrence: DoseOccurrence,
    action: 'taken' | 'skipped' | 'later' | 'undo',
  ) {
    if (busyOccurrence) return
    setBusyOccurrence(occurrence.id)
    setActionError(null)
    setActionNotice(null)
    try {
      const options = { operationId: crypto.randomUUID() }
      if (action === 'taken') {
        await markDoseTaken(occurrence.id, db, options)
        setActionNotice('Dose marked taken.')
      } else if (action === 'skipped') {
        await markDoseSkipped(occurrence.id, db, options)
        setActionNotice('Dose marked skipped.')
      } else if (action === 'later') {
        await snoozeDoseLater(occurrence.id, db, options)
        setActionNotice('Dose moved later.')
      } else {
        await undoDose(occurrence.id, db, options)
        setActionNotice('Dose action undone.')
      }
    } catch (error: unknown) {
      setActionError(errorMessage(error))
    } finally {
      setBusyOccurrence(null)
    }
  }

  return (
    <>
      <p className="page-kicker">One day at a time</p>
      <div className="page-heading-row today-heading-row">
        <div>
          <h1 className="page-title">Today</h1>
          <p className="page-description">
            Your scheduled doses, grouped by when you take them.
          </p>
        </div>
      </div>

      {loadError && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {actionNotice && (
        <p className="success-message today-action-notice" role="status">
          {actionNotice}
        </p>
      )}

      {loading && !dashboard && (
        <p className="page-note" role="status">
          Loading today’s schedule…
        </p>
      )}

      {!loading && dashboard && progress && progress.total > 0 && (
        <>
          <Card className="today-progress" aria-label="Daily dose progress">
            <div className="today-progress-copy">
              <div>
                <p className="today-progress-count">
                  {progress.completed} of {progress.total} complete
                </p>
                <p className="today-progress-detail">
                  {progress.taken} taken
                  {progress.skipped > 0 && ` · ${progress.skipped} skipped`}
                  {progress.pending > 0 && ` · ${progress.pending} remaining`}
                </p>
              </div>
              <span className="today-progress-percent">
                {Math.round((progress.completed / progress.total) * 100)}%
              </span>
            </div>
            <progress
              className="today-progress-bar"
              aria-label="Doses completed"
              value={progress.completed}
              max={progress.total}
            />
          </Card>

          <div className="today-sections">
            {dashboard.sections.map((section) => (
              <section
                className="today-section"
                key={section.key}
                aria-labelledby={`today-section-${section.key}`}
              >
                <div className="today-section-heading">
                  <h2
                    className="section-title"
                    id={`today-section-${section.key}`}
                  >
                    {section.title}
                  </h2>
                  <span className="today-section-count">
                    {section.occurrences.length}{' '}
                    {section.occurrences.length === 1 ? 'dose' : 'doses'}
                  </span>
                </div>
                <div className="today-dose-list">
                  {section.occurrences.map((occurrence) => (
                    <Card className="today-dose" key={occurrence.id}>
                      <div className="today-dose-icon" aria-hidden="true">
                        <Pill size={19} />
                      </div>
                      <div className="today-dose-copy">
                        <h3 className="today-dose-name">
                          {occurrence.medicineName}
                        </h3>
                        <p className="today-dose-detail">
                          {quantityLabel(occurrence)}
                        </p>
                        <p className="today-dose-stock">
                          {stockLabel(
                            occurrence,
                            dashboard.stockBalances[occurrence.medicineId],
                          )}
                        </p>
                        {snoozeLabel(occurrence) && (
                          <p className="today-dose-snooze">
                            {snoozeLabel(occurrence)}
                          </p>
                        )}
                      </div>
                      <span
                        className={`status-badge today-status today-status-${occurrence.status}`}
                      >
                        {statusLabel(occurrence.status)}
                      </span>
                      <div className="today-dose-actions">
                        {occurrence.status === 'pending' ? (
                          <>
                            <Button
                              aria-label={`Take ${occurrence.medicineName} ${section.title}`}
                              className="button-small"
                              disabled={busyOccurrence !== null}
                              onClick={() =>
                                void runDoseAction(occurrence, 'taken')
                              }
                            >
                              <Check size={16} aria-hidden="true" />
                              Take
                            </Button>
                            <Button
                              aria-label={`Skip ${occurrence.medicineName} ${section.title}`}
                              className="button-secondary button-small"
                              disabled={busyOccurrence !== null}
                              onClick={() =>
                                void runDoseAction(occurrence, 'skipped')
                              }
                            >
                              <SkipForward size={16} aria-hidden="true" />
                              Skip
                            </Button>
                            <Button
                              aria-label={`Move ${occurrence.medicineName} ${section.title} later`}
                              className="button-secondary button-small"
                              disabled={busyOccurrence !== null}
                              onClick={() =>
                                void runDoseAction(occurrence, 'later')
                              }
                            >
                              <Clock3 size={16} aria-hidden="true" />
                              Later
                            </Button>
                          </>
                        ) : (
                          <Button
                            aria-label={`Undo ${occurrence.medicineName} ${section.title}`}
                            className="button-secondary button-small"
                            disabled={busyOccurrence !== null}
                            onClick={() =>
                              void runDoseAction(occurrence, 'undo')
                            }
                          >
                            <Undo2 size={16} aria-hidden="true" />
                            Undo
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {!loading && dashboard && progress?.total === 0 && (
        <EmptyState
          icon={<CalendarDays size={32} />}
          title={
            dashboard.activeMedicineCount === 0
              ? 'Your routine starts here'
              : isEverythingPaused
                ? 'Your schedules are paused'
                : 'Nothing scheduled today'
          }
          action={
            <a className="button" href="#medicines">
              {dashboard.activeMedicineCount === 0
                ? 'Add a medicine'
                : 'Review medicines'}
            </a>
          }
        >
          {dashboard.activeMedicineCount === 0
            ? 'Add a medicine and its schedule to see daily doses here.'
            : isEverythingPaused
              ? 'Resume a schedule from Medicines when you are ready.'
              : 'Your saved schedules have no doses due today.'}
        </EmptyState>
      )}

      <p className="page-note today-note">
        Dose actions update your schedule and stock together.
      </p>
    </>
  )
}
