import { formatUnits } from 'viem'
import type { LobbyPlayer } from '../types'

interface Props {
  roomCode: string
  stakeAmount: string
  discussionSeconds: number
  players: LobbyPlayer[]
  isHost: boolean
  hostWalletAddress: string
  walletAddress: string
  onStart: () => void
  onLeave: () => void
  error: string | null
  clearError: () => void
}

export function GameLobby({
  roomCode,
  stakeAmount,
  discussionSeconds,
  players,
  isHost,
  onStart,
  onLeave,
  error,
  clearError,
}: Props) {
  const canStart = players.length >= 3
  const stakeLabel = BigInt(stakeAmount) > 0n
    ? `${formatUnits(BigInt(stakeAmount), 18)} G$ per player`
    : 'Free to play'

  return (
    <div className="screen lobby-screen">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="lobby-topbar">
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>← Leave</button>
        <div className="lobby-meta">
          <span className="badge">{stakeLabel}</span>
          <span className="badge">{players.length}/10</span>
          <span className="badge">{discussionSeconds / 60}m</span>
        </div>
      </div>

      {error && (
        <div className="error-banner" onClick={clearError}>{error}</div>
      )}

      {/* ── Room code ─────────────────────────────────────────────────────── */}
      <div className="invite-box">
        <p className="invite-label">
          {isHost ? 'Share this code with friends' : 'Room code'}
        </p>
        <button
          className="room-code-large"
          onClick={() => navigator.clipboard?.writeText(roomCode)}
          title="Tap to copy"
        >
          {roomCode}
        </button>
        <p className="hint-small">Tap to copy</p>
      </div>

      {/* ── Players ───────────────────────────────────────────────────────── */}
      <div className="lobby-players-section">
        <p className="lobby-section-label">Players · {players.length}/10</p>
        <div className="player-list">
          {players.map(p => (
            <div key={p.walletAddress} className="player-row">
              <div className="player-avatar">{p.displayName[0]?.toUpperCase()}</div>
              <div className="player-info">
                <span className="player-name">{p.displayName}</span>
                <span className="muted">{shortenAddress(p.walletAddress)}</span>
              </div>
              {p.isHost && <span className="host-badge">HOST</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="lobby-footer">
        {isHost ? (
          <>
            {!canStart && (
              <p className="hint center">
                Need {3 - players.length} more player{3 - players.length !== 1 ? 's' : ''} to start
              </p>
            )}
            <button
              className="btn btn-primary btn-lg"
              disabled={!canStart}
              onClick={onStart}
            >
              Start Game
            </button>
          </>
        ) : (
          <div className="waiting-pulse">
            <span className="pulse-dot" />
            <span className="pulse-dot" style={{ animationDelay: '0.2s' }} />
            <span className="pulse-dot" style={{ animationDelay: '0.4s' }} />
            <span>Waiting for host to start…</span>
          </div>
        )}
      </div>

    </div>
  )
}

function shortenAddress(addr: string) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
