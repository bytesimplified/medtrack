import { Download, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import {
  BackupFormatError,
  createBackup,
  restoreBackup,
  serializeBackup,
} from './backup'
import { Button } from '../components/ui/Button'

function messageFor(error: unknown): string {
  if (error instanceof BackupFormatError) return error.message
  return 'MedTrack could not complete the backup operation. Your current data is unchanged.'
}

export function BackupControls() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function exportData() {
    setBusy(true)
    setStatus(null)
    setError(null)
    try {
      const backup = await createBackup()
      const blob = new Blob([serializeBackup(backup)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `medtrack-backup-${backup.exportedAt.slice(0, 10)}.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setStatus('Backup downloaded. Keep a copy somewhere safe.')
    } catch (caught: unknown) {
      setError(messageFor(caught))
    } finally {
      setBusy(false)
    }
  }

  async function restoreFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setStatus(null)
    setError(null)
    if (
      !window.confirm(
        'Restore this backup and replace all MedTrack data on this device?',
      )
    ) {
      event.target.value = ''
      return
    }
    setBusy(true)
    try {
      const counts = await restoreBackup(await file.text())
      setStatus(
        `Backup restored: ${counts.medicines} medicines and ${counts.occurrences} dose records.`,
      )
    } catch (caught: unknown) {
      setError(messageFor(caught))
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  return (
    <details className="backup-menu">
      <summary aria-label="Data and backup">Data</summary>
      <div
        className="backup-actions"
        role="group"
        aria-label="Data backup actions"
      >
        <Button disabled={busy} onClick={() => void exportData()}>
          <Download size={17} aria-hidden="true" />
          Export backup
        </Button>
        <Button disabled={busy} onClick={() => fileInput.current?.click()}>
          <Upload size={17} aria-hidden="true" />
          Restore backup
        </Button>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".json,application/json"
          aria-label="Select a MedTrack backup file"
          onChange={(event) => void restoreFile(event)}
        />
      </div>
      {status && (
        <p className="backup-feedback" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="backup-feedback backup-error" role="alert">
          {error}
        </p>
      )}
    </details>
  )
}
