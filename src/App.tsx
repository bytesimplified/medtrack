import { useEffect, useRef } from 'react'
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
