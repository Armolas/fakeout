import { formatUnits } from 'viem'
import type { LobbyPlayer } from '../types'

interface Props {
  roomCode: string
  stakeAmount: string
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
    <div className="screen">
      {/* Header */}
      <div className="lobby-header">
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>← Leave</button>
        <div>
          <span className="label">Room</span>
          <span className="room-code">{roomCode}</span>
        </div>
      </div>

      <div className="lobby-meta">
        <span className="badge">{stakeLabel}</span>
        <span className="badge">{players.length}/10 players</span>
      </div>

      {error && (
        <div className="error-banner" onClick={clearError}>
          {error}
        </div>
      )}

      {/* Invite hint */}
      {isHost && (
        <div className="invite-box">
          <p className="hint">Share this code with friends:</p>
          <button
            className="room-code-large"
            onClick={() => navigator.clipboard?.writeText(roomCode)}
            title="Tap to copy"
          >
            {roomCode}
          </button>
          <p className="hint-small">Tap to copy</p>
        </div>
      )}

      {/* Player list */}
      <div className="player-list">
        <p className="label">Players</p>
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

      {/* Waiting / start */}
      <div className="lobby-footer">
        {isHost ? (
          <>
            {!canStart && (
              <p className="hint">Need at least {3 - players.length} more player{3 - players.length !== 1 ? 's' : ''}</p>
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
            Waiting for host to start…
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
