import { Pill } from 'lucide-react'

export default function App() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col px-6 py-10 sm:px-10 sm:py-16">
      <header className="flex items-center gap-3 text-teal-800">
        <span className="rounded-2xl bg-teal-100 p-3">
          <Pill aria-hidden="true" size={24} strokeWidth={1.8} />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">MedTrack</h1>
      </header>

      <section aria-labelledby="welcome-title" className="my-auto py-16">
        <p className="mb-4 text-xs font-semibold tracking-[0.18em] text-teal-700 uppercase">
          One day at a time
        </p>
        <h2 id="welcome-title" className="max-w-md text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
          A little clarity for your daily medicines.
        </h2>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-600">
          Know what to take, keep track of your stock, and build a routine that works for you.
        </p>

        <div className="mt-10 rounded-3xl border border-teal-900/10 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900">A simpler routine is on its way</h3>
          <p className="mt-2 leading-relaxed text-slate-600">
            Medicine tracking is coming soon. This is the first step toward your daily companion.
          </p>
        </div>
      </section>

      <footer className="text-sm text-slate-500">A small step toward an easier day.</footer>
    </main>
  )
}
