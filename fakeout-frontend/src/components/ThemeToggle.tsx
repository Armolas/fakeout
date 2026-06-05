import type { ReactNode } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import type { ThemePreference } from '../hooks/useTheme'

interface Props {
  preference: ThemePreference
  onChange: (theme: ThemePreference) => void
}

const OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun size={16} /> },
  { value: 'dark', label: 'Dark', icon: <Moon size={16} /> },
  { value: 'system', label: 'Auto', icon: <Monitor size={16} /> },
]

export function ThemeToggle({ preference, onChange }: Props) {
  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`theme-toggle-option ${preference === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={preference === opt.value}
        >
          <span className="theme-toggle-icon">{opt.icon}</span>
          <span className="theme-toggle-label">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}
