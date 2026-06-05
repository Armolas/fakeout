import { useState } from 'react'
import { ArrowRight } from 'lucide-react'

interface Props {
  onConfirm: (name: string) => void
}

export function FirstTimeModal({ onConfirm }: Props) {
  const [name, setName] = useState('')

  function handleConfirm() {
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <img src="/icons/icon-192.png" alt="FAKEOUT" className="modal-logo" />
        <div className="modal-text">
          <h2 className="modal-title">Welcome to FAKEOUT!</h2>
          <p className="modal-sub">What should we call you?</p>
        </div>
        <input
          className="input"
          placeholder="Your name…"
          value={name}
          maxLength={20}
          autoFocus
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleConfirm()}
        />
        <button
          className="btn btn-primary btn-lg"
          disabled={!name.trim()}
          onClick={handleConfirm}
        >
          Let's Play <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
