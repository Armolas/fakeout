import { useEffect } from 'react'
import { formatUnits } from 'viem'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ERC20_ABI, FAKEOUT_CONTRACT_ADDRESS, GOOD_DOLLAR_ADDRESS } from '../config/contracts'
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

const MAX_UINT256 = 2n ** 256n - 1n

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
  const { address } = useAccount()
  const isStaked = BigInt(stakeAmount) > 0n

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: GOOD_DOLLAR_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, FAKEOUT_CONTRACT_ADDRESS] : undefined,
    query: { enabled: !!address && isStaked },
  })

  const { writeContract: approve, data: approveTxHash, isPending: isApproving } = useWriteContract()
  const { isLoading: isWaitingApproval, isSuccess: approvalConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash })

  useEffect(() => {
    if (approvalConfirmed) refetchAllowance()
  }, [approvalConfirmed]) // eslint-disable-line

  const hasApproval = !isStaked || (allowance ?? 0n) >= BigInt(stakeAmount)
  const isApprovalInFlight = isApproving || isWaitingApproval

  function handleApprove() {
    approve({ address: GOOD_DOLLAR_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [FAKEOUT_CONTRACT_ADDRESS, MAX_UINT256] })
  }

  const canStart = players.length >= 3
  const stakeLabel = isStaked
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
        {/* Approval gate — shown to any player (host or not) who hasn't approved yet */}
        {isStaked && !hasApproval && (
          <div className="approve-gate">
            <p className="approve-gate-label">
              Approve G$ to join this staked game
            </p>
            <button
              className="btn btn-primary btn-lg"
              disabled={isApprovalInFlight}
              onClick={handleApprove}
            >
              {isApprovalInFlight
                ? <><span className="btn-spinner" />Approving…</>
                : <>Approve {formatUnits(BigInt(stakeAmount), 18)} G$</>}
            </button>
            {isApprovalInFlight && (
              <p className="approve-hint">Approve G$ spend in your wallet…</p>
            )}
          </div>
        )}

        {/* Normal host / guest controls — only shown once approved */}
        {hasApproval && (
          isHost ? (
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
          )
        )}
      </div>

    </div>
  )
}

function shortenAddress(addr: string) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
