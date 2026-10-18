import { Laptop, Moon, Sun } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useTheme } from './useTheme'
const options = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Device', icon: Laptop },
] as const
export function ThemePicker() {
  const { theme, chooseTheme, saveError } = useTheme()
  return (
    <div className="theme-settings">
      <div className="theme-picker" role="group" aria-label="Color theme">
        {options.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            className="theme-button"
            aria-label={`${label} theme`}
            aria-pressed={theme === value}
            title={`${label} theme`}
            onClick={() => chooseTheme(value)}
          >
            <Icon size={17} aria-hidden="true" />
            <span className="theme-label">{label}</span>
          </Button>
        ))}
      </div>
      {saveError && (
        <p role="status" className="theme-warning">
          Theme changed for this visit. Your browser couldn’t save it.
        </p>
      )}
    </div>
  )
}
