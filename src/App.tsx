import { liveQuery } from 'dexie'
import { useEffect, useRef } from 'react'
import { db } from './database/db'
import { notificationAdapter } from './reminders/native'
import { synchronizeReminders } from './reminders/service'
import { ThemePicker } from './theme/ThemePicker'
import { AppShell } from './components/AppShell'
import { Navigation } from './components/Navigation'
import { usePage } from './navigation/usePage'
import { Today } from './pages/Today'
import { Medicines } from './pages/Medicines'
import { Insights } from './pages/Insights'
const titles = { today: 'Today', medicines: 'Medicines', insights: 'Insights' }
export default function App() {
  const page = usePage()
  const previousPage = useRef(page)
  useEffect(() => {
    document.title = `${titles[page]} · MedTrack`
    if (previousPage.current !== page) {
      document.getElementById('main-content')?.focus()
      previousPage.current = page
    }
  }, [page])

  useEffect(() => {
    const initialized = notificationAdapter.initialize?.() ?? Promise.resolve()
    void initialized.then(() => synchronizeReminders()).catch(() => undefined)
    const changes = liveQuery(() =>
      Promise.all([
        db.medicines.toArray(),
        db.doseSchedules.toArray(),
        db.doseOccurrences.toArray(),
        db.reminderPreferences.toArray(),
        db.stockTransactions.toArray(),
      ]),
    )
    const subscription = changes.subscribe({
      next() {
        void initialized
          .then(() => synchronizeReminders())
          .catch(() => undefined)
      },
      error() {
        // Reminder synchronization is best-effort if local storage is unavailable.
      },
    })
    return () => {
      subscription.unsubscribe()
      void notificationAdapter.cancelAll()
    }
  }, [])

  return (
    <AppShell
      navigation={<Navigation page={page} />}
      settings={<ThemePicker />}
    >
      {page === 'today' && <Today />}
      {page === 'medicines' && <Medicines />}
      {page === 'insights' && <Insights />}
    </AppShell>
  )
}
