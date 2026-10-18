import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './ui/Button'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MedTrack render failed.', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-error" tabIndex={-1}>
          <section role="alert" aria-labelledby="app-error-heading">
            <h1 id="app-error-heading">MedTrack hit a problem</h1>
            <p>
              Your saved data stays on this device. Reload the app to try again.
            </p>
            <Button onClick={() => window.location.reload()}>Reload app</Button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}
