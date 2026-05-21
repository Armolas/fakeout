import { useState } from 'react'
import { formatUnits } from 'viem'

type PlayerStats = {
  gamesPlayed: number
  gamesWon: number
  totalAmountWon: string
  totalAmountLost: string
}

interface Props {
  walletAddress: string
  displayName: string
  playerStats: PlayerStats | null
  onEditName: (name: string) => void
  onBack: () => void
  onDisconnect: () => void
}

export function Profile({ walletAddress, displayName, playerStats, onEditName, onBack, onDisconnect }: Props) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(displayName)
  const [copied, setCopied] = useState(false)

  function saveEdit() {
    const trimmed = editValue.trim()
    if (!trimmed) return
    onEditName(trimmed)
    setEditing(false)
  }

  function copyAddress() {
    navigator.clipboard?.writeText(walletAddress).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const winRate = playerStats && playerStats.gamesPlayed > 0
    ? Math.round((playerStats.gamesWon / playerStats.gamesPlayed) * 100)
    : 0

  const wonG$ = playerStats ? parseFloat(formatUnits(BigInt(playerStats.totalAmountWon), 18)).toFixed(2) : '0.00'
  const lostG$ = playerStats ? parseFloat(formatUnits(BigInt(playerStats.totalAmountLost), 18)).toFixed(2) : '0.00'
  const hasStaked = playerStats && (BigInt(playerStats.totalAmountWon) > 0n || BigInt(playerStats.totalAmountLost) > 0n)

  return (
    <div className="screen profile-screen">
      {/* Back */}
      <div className="profile-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
      </div>

      {/* Avatar + name */}
      <div className="profile-hero">
        <div className="profile-avatar-lg">
          {displayName?.[0]?.toUpperCase() ?? '?'}
        </div>

        {editing ? (
          <div className="profile-edit-row">
            <input
              className="input profile-name-input"
              value={editValue}
              maxLength={20}
              autoFocus
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={!editValue.trim()}>
              Save
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="profile-name-row">
            <span className="profile-name">{displayName || 'Anonymous'}</span>
            <button className="profile-edit-btn" onClick={() => { setEditValue(displayName); setEditing(true) }} title="Edit name">
              ✏️
            </button>
          </div>
        )}

        <button className="profile-address" onClick={copyAddress}>
          <span className="profile-address-text">
            {walletAddress.slice(0, 10)}…{walletAddress.slice(-8)}
          </span>
          <span className="profile-copy-badge">{copied ? '✓ Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Stats */}
      <div className="profile-section-label">Statistics</div>

      <div className="profile-stats-grid">
        <div className="profile-stat-card">
          <span className="profile-stat-value">{playerStats?.gamesPlayed ?? 0}</span>
          <span className="profile-stat-label">Played</span>
        </div>
        <div className="profile-stat-card">
          <span className="profile-stat-value">{playerStats?.gamesWon ?? 0}</span>
          <span className="profile-stat-label">Won</span>
        </div>
        <div className="profile-stat-card">
          <span className="profile-stat-value">{winRate}%</span>
          <span className="profile-stat-label">Win rate</span>
        </div>
      </div>

      {hasStaked && (
        <div className="profile-amount-row">
          <div className="amount-card won">
            <span className="amount-value">+{wonG$} G$</span>
            <span className="amount-label">Total won</span>
          </div>
          <div className="amount-card lost">
            <span className="amount-value">-{lostG$} G$</span>
            <span className="amount-label">Total lost</span>
          </div>
        </div>
      )}

      {/* Account */}
      <div className="profile-section-label" style={{ marginTop: 8 }}>Account</div>

      <button className="btn btn-danger btn-lg" onClick={onDisconnect}>
        Disconnect Wallet
      </button>
    </div>
  )
}
