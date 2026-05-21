/// <reference types="vite/client" />

/// <reference types="vite/client" />

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useConnectors, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits } from 'viem'
import { WALLET_ADAPTERS } from '@web3auth/base'
import { web3AuthInstance } from '../config/web3auth'
import { ERC20_ABI, FAKEOUT_CONTRACT_ADDRESS, GOOD_DOLLAR_ADDRESS } from '../config/contracts'
import { UBIBanner } from '../components/UBIBanner'
import { useUBIClaim } from '../hooks/useUBIClaim'
import type { PublicLobby } from '../types'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'

const STAKE_OPTIONS = [
  { label: 'Free',  value: '0' },
  { label: '1 G$',  value: '1000000000000000000' },
  { label: '5 G$',  value: '5000000000000000000' },
  { label: '10 G$', value: '10000000000000000000' },
]

const DISCUSSION_OPTIONS = [
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '3 min', value: 180 },
  { label: '5 min', value: 300 },
]

interface Props {
  onJoinGame: (walletAddress: string, displayName: string, roomCode?: string) => void
  onCreateGame: (walletAddress: string, displayName: string, type: 'public' | 'private', stakeAmount: string, discussionSeconds: number) => void
  connectedWallet: string
  displayName: string
  onOpenProfile: () => void
  error: string | null
  clearError: () => void
}

type Tab = 'join' | 'create' | 'browse'

export function Home({
  onJoinGame,
  onCreateGame,
  displayName,
  onOpenProfile,
  error,
  clearError,
}: Props) {
  const { address, isConnected } = useAccount()
  const { connect, isPending: isConnecting } = useConnect()
  const connectors = useConnectors()
  const { entitlement, nextClaimTime, isClaiming, claimSuccess, claim } = useUBIClaim()

  const [loginEmail, setLoginEmail] = useState('')

  function connectWith(id: string) {
    const connector = connectors.find(c => c.id === id)
    if (connector) connect({ connector })
  }

  async function connectWithEmail() {
    if (!loginEmail.trim() || !web3AuthInstance) return
    const connector = connectors.find(c => c.id === 'web3auth-email')
    if (!connector) return
    await web3AuthInstance.connectTo(WALLET_ADAPTERS.AUTH, {
      loginProvider: 'email_passwordless',
      extraLoginOptions: { login_hint: loginEmail.trim() },
    })
    connect({ connector })
  }

  const [tab, setTab] = useState<Tab>('join')
  const [roomCode, setRoomCode] = useState('')
  const [gameType, setGameType] = useState<'public' | 'private'>('public')
  const [stakeAmount, setStakeAmount] = useState(STAKE_OPTIONS[0].value)
  const [discussionSeconds, setDiscussionSeconds] = useState(120)
  const [customDiscussion, setCustomDiscussion] = useState(false)
  const [customDiscussionInput, setCustomDiscussionInput] = useState('')
  const [customStake, setCustomStake] = useState(false)
  const [customStakeInput, setCustomStakeInput] = useState('')
  const [lobbies, setLobbies] = useState<PublicLobby[]>([])
  const [loadingLobbies, setLoadingLobbies] = useState(false)
  const [needsApproval, setNeedsApproval] = useState(false)
  const [pendingAction, setPendingAction] = useState<'join' | 'create' | null>(null)

  const { data: balance } = useReadContract({
    address: GOOD_DOLLAR_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: GOOD_DOLLAR_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, FAKEOUT_CONTRACT_ADDRESS] : undefined,
    query: { enabled: !!address && BigInt(stakeAmount) > 0n },
  })

  const MAX_UINT256 = 2n ** 256n - 1n

  const { writeContract: approve, data: approveTxHash, isPending: isApproving, error: approveError } = useWriteContract()
  const { isLoading: isWaitingApproval, isSuccess: approvalConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash })

  useEffect(() => {
    if (!approvalConfirmed || !pendingAction) return
    refetchAllowance()
    setNeedsApproval(false)
    const wallet = address!.toLowerCase()
    if (pendingAction === 'create') {
      onCreateGame(wallet, displayName, gameType, stakeAmount, discussionSeconds)
    } else {
      onJoinGame(wallet, displayName, roomCode || undefined)
    }
    setPendingAction(null)
  }, [approvalConfirmed]) // eslint-disable-line

  useEffect(() => {
    if (tab === 'browse') fetchLobbies()
  }, [tab])

  async function fetchLobbies() {
    setLoadingLobbies(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/lobbies`)
      const data = await res.json()
      setLobbies(data.lobbies ?? [])
    } catch { /* silent */ }
    finally { setLoadingLobbies(false) }
  }

  function hasEnoughAllowance() {
    if (BigInt(stakeAmount) === 0n) return true
    return (allowance ?? 0n) >= BigInt(stakeAmount)
  }

  function handleCreate() {
    if (!address || !displayName.trim()) return
    const wallet = address.toLowerCase()
    if (BigInt(stakeAmount) > 0n && !hasEnoughAllowance()) {
      setNeedsApproval(true)
      setPendingAction('create')
      approve({ address: GOOD_DOLLAR_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [FAKEOUT_CONTRACT_ADDRESS, MAX_UINT256] })
      return
    }
    onCreateGame(wallet, displayName, gameType, stakeAmount, discussionSeconds)
  }

  function handleJoin(code?: string) {
    if (!address || !displayName.trim()) return
    const wallet = address.toLowerCase()
    const rc = code ?? roomCode
    if (BigInt(stakeAmount) > 0n && !hasEnoughAllowance()) {
      setNeedsApproval(true)
      setPendingAction('join')
      approve({ address: GOOD_DOLLAR_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [FAKEOUT_CONTRACT_ADDRESS, MAX_UINT256] })
      return
    }
    onJoinGame(wallet, displayName, rc || undefined)
  }

  const isApprovalInFlight = isApproving || isWaitingApproval

  function approveErrorMessage(err: unknown): string {
    const msg = (err as { message?: string })?.message ?? ''
    if (msg.includes('insufficient funds')) return 'Not enough CELO for gas. Add a small amount of CELO to your wallet to cover fees.'
    if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) return 'Approval cancelled.'
    if (msg.includes('User rejected')) return 'Approval cancelled.'
    return 'Approval failed. Please try again.'
  }

  // ── Connect screen ──────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="screen center-content connect-screen">
        <div className="connect-hero">
          <img src="/icons/icon-192.png" alt="FAKEOUT" className="connect-logo" />
          <h1 className="connect-title">FAKEOUT</h1>
          <p className="connect-tagline">Social deduction · Real stakes</p>
        </div>

        <div className="connect-features">
          <div className="connect-feature">
            <span className="connect-feature-icon">🕵️</span>
            <span>Spot the impostor among your crew</span>
          </div>
          <div className="connect-feature">
            <span className="connect-feature-icon">💬</span>
            <span>Discuss, deceive, and debate live</span>
          </div>
          <div className="connect-feature">
            <span className="connect-feature-icon">💰</span>
            <span>Stake G$ — winners take the pot</span>
          </div>
        </div>

        <div className="social-login-group">
          <input
            className="input connect-email-input"
            type="email"
            placeholder="Enter your email"
            value={loginEmail}
            onChange={e => setLoginEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connectWithEmail()}
            disabled={isConnecting}
          />
          <button
            className="btn btn-primary btn-lg"
            onClick={connectWithEmail}
            disabled={isConnecting || !loginEmail.trim()}
          >
            {isConnecting
              ? <><span className="btn-spinner" />Connecting…</>
              : <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/>
                  </svg>
                  Continue with email
                </>
            }
          </button>

          <div className="connect-or"><span>or</span></div>

          <button
            className="social-login-btn"
            onClick={() => connectWith('injected')}
            disabled={isConnecting}
          >
            <svg className="social-login-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="6" width="20" height="14" rx="2"/>
              <path d="M2 10h20M16 14h2"/>
            </svg>
            <span>Continue with wallet</span>
          </button>
        </div>

        <p className="connect-footer">By continuing you agree to our terms of service.</p>
      </div>
    )
  }

  // ── Main home screen ────────────────────────────────────────────────────────
  return (
    <div className="screen home-screen">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="home-header">
        <div className="logo-row">
          <img src="/icons/icon-192.png" alt="FAKEOUT" className="logo-img-sm" />
        </div>
        <div className="home-header-right">
          {balance !== undefined && (
            <span className="balance-badge">
              <span className="balance-dot" />
              {parseFloat(formatUnits(balance as bigint, 18)).toFixed(2)} G$
            </span>
          )}
          <button className="avatar-btn" onClick={onOpenProfile} title="View profile">
            {displayName?.[0]?.toUpperCase() ?? '?'}
          </button>
        </div>
      </div>

      {isConnected && (
        <UBIBanner
          entitlement={entitlement}
          nextClaimTime={nextClaimTime}
          isClaiming={isClaiming}
          claimSuccess={claimSuccess}
          onClaim={claim}
        />
      )}

      {error && (
        <div className="error-banner" onClick={clearError}>
          {friendlyError(error)}
        </div>
      )}

      {/* ── Join tab ───────────────────────────────────────────────────────── */}
      {tab === 'join' && (
        <div className="tab-panel">
          <div className="join-panel">

            <div className="join-section">
              <p className="join-section-label">Have a room code?</p>
              <input
                className="input input-code"
                placeholder="XXXXXX"
                value={roomCode}
                maxLength={6}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
              />
            </div>

            <div className="join-divider"><span>or</span></div>

            <div className="join-section">
              <p className="join-section-label">Jump into a random public game</p>
            </div>

            <button
              className="btn btn-primary btn-lg"
              disabled={!displayName.trim() || isApprovalInFlight}
              onClick={() => handleJoin()}
            >
              {isApprovalInFlight
                ? <><span className="btn-spinner" />Approving G$…</>
                : roomCode
                  ? <>🔑 Join Private Game</>
                  : <>🎲 Join Random Game</>}
            </button>

            {needsApproval && isApprovalInFlight && (
              <p className="approve-hint">Approve G$ spend in your wallet — game starts automatically after.</p>
            )}
            {approveError && (
              <p className="approve-error">{approveErrorMessage(approveError)}</p>
            )}

            {!displayName.trim() && (
              <p className="name-nudge">Set a name in your profile to play</p>
            )}
          </div>
        </div>
      )}

      {/* ── Create tab ─────────────────────────────────────────────────────── */}
      {tab === 'create' && (
        <div className="tab-panel">
          <div className="create-panel">

            <div className="field">
              <label className="label">Game type</label>
              <div className="type-toggle">
                <button
                  className={`type-option ${gameType === 'public' ? 'active' : ''}`}
                  onClick={() => setGameType('public')}
                >
                  <span className="type-option-icon">🌐</span>
                  <span className="type-option-name">Public</span>
                  <span className="type-option-desc">Anyone can join</span>
                </button>
                <button
                  className={`type-option ${gameType === 'private' ? 'active' : ''}`}
                  onClick={() => setGameType('private')}
                >
                  <span className="type-option-icon">🔒</span>
                  <span className="type-option-name">Private</span>
                  <span className="type-option-desc">Invite only</span>
                </button>
              </div>
            </div>

            <div className="field">
              <label className="label">Discussion time</label>
              <div className="option-pills">
                {DISCUSSION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`option-pill ${!customDiscussion && discussionSeconds === opt.value ? 'active' : ''}`}
                    onClick={() => { setCustomDiscussion(false); setDiscussionSeconds(opt.value) }}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  className={`option-pill ${customDiscussion ? 'active' : ''}`}
                  onClick={() => { setCustomDiscussion(true); setCustomDiscussionInput('') }}
                >
                  Custom
                </button>
              </div>
              {customDiscussion && (
                <div className="custom-input-row">
                  <input
                    className="input input-custom"
                    type="number"
                    min={1}
                    max={60}
                    placeholder="Minutes (1–60)"
                    value={customDiscussionInput}
                    onChange={e => {
                      const val = e.target.value
                      setCustomDiscussionInput(val)
                      const mins = parseInt(val)
                      if (!isNaN(mins) && mins >= 1 && mins <= 60) {
                        setDiscussionSeconds(mins * 60)
                      }
                    }}
                  />
                  <span className="custom-input-unit">min</span>
                </div>
              )}
            </div>

            <div className="field">
              <label className="label">Stake per player</label>
              <div className="option-pills">
                {STAKE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`option-pill ${!customStake && stakeAmount === opt.value ? 'active' : ''}`}
                    onClick={() => { setCustomStake(false); setStakeAmount(opt.value) }}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  className={`option-pill ${customStake ? 'active' : ''}`}
                  onClick={() => { setCustomStake(true); setCustomStakeInput('') }}
                >
                  Custom
                </button>
              </div>
              {customStake && (
                <div className="custom-input-row">
                  <input
                    className="input input-custom"
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="Amount in G$"
                    value={customStakeInput}
                    onChange={e => {
                      const val = e.target.value
                      setCustomStakeInput(val)
                      const gd = parseFloat(val)
                      if (!isNaN(gd) && gd >= 0) {
                        setStakeAmount(BigInt(Math.round(gd * 1e18)).toString())
                      }
                    }}
                  />
                  <span className="custom-input-unit">G$</span>
                </div>
              )}
            </div>

            <div className="create-summary">
              <span className="summary-chip">{gameType === 'public' ? '🌐 Public' : '🔒 Private'}</span>
              <span className="summary-chip">⏱ {(discussionSeconds / 60).toFixed(discussionSeconds % 60 === 0 ? 0 : 1)} min</span>
              <span className="summary-chip">
                {stakeAmount === '0'
                  ? '🆓 Free'
                  : `💰 ${customStake ? `${customStakeInput} G$` : STAKE_OPTIONS.find(o => o.value === stakeAmount)?.label}`}
              </span>
            </div>

            <button
              className="btn btn-primary btn-lg"
              disabled={
                !displayName.trim() ||
                isApprovalInFlight ||
                (customDiscussion && (!customDiscussionInput || discussionSeconds < 60)) ||
                (customStake && customStakeInput === '')
              }
              onClick={handleCreate}
            >
              {isApprovalInFlight
                ? <><span className="btn-spinner" />Approving G$…</>
                : <>✨ Create Game</>}
            </button>

            {needsApproval && isApprovalInFlight && (
              <p className="approve-hint">Approve G$ spend in your wallet — game starts automatically after.</p>
            )}
            {approveError && (
              <p className="approve-error">{approveErrorMessage(approveError)}</p>
            )}

            {!displayName.trim() && (
              <p className="name-nudge">Set a name in your profile to play</p>
            )}
          </div>
        </div>
      )}

      {/* ── Browse tab ─────────────────────────────────────────────────────── */}
      {tab === 'browse' && (
        <div className="tab-panel">
          <div className="browse-panel">
            <div className="browse-top">
              <span className="browse-count">
                {loadingLobbies ? 'Looking for games…' : `${lobbies.length} open ${lobbies.length === 1 ? 'lobby' : 'lobbies'}`}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={fetchLobbies}>↺ Refresh</button>
            </div>

            {loadingLobbies && (
              <div className="browse-loading">
                <span className="pulse-dot" />
                <span className="pulse-dot" style={{ animationDelay: '0.2s' }} />
                <span className="pulse-dot" style={{ animationDelay: '0.4s' }} />
              </div>
            )}

            {!loadingLobbies && lobbies.length === 0 && (
              <div className="browse-empty">
                <span className="browse-empty-icon">🌙</span>
                <p>No open lobbies right now.</p>
                <p className="muted">Switch to Create and start one!</p>
              </div>
            )}

            {lobbies.map(lobby => (
              <div key={lobby.roomCode} className="browse-card">
                <div className="browse-card-left">
                  <span className="browse-room-code">{lobby.roomCode}</span>
                  <div className="browse-card-meta">
                    <span className="browse-badge">
                      {lobby.playerCount}/{lobby.maxPlayers} players
                    </span>
                    {lobby.stakeAmount !== '0' && (
                      <span className="browse-badge browse-badge-gold">
                        💰 {formatUnits(BigInt(lobby.stakeAmount), 18)} G$
                      </span>
                    )}
                    {lobby.stakeAmount === '0' && (
                      <span className="browse-badge browse-badge-free">🆓 Free</span>
                    )}
                  </div>
                  <div className="player-pips">
                    {Array.from({ length: lobby.maxPlayers }).map((_, i) => (
                      <span
                        key={i}
                        className={`player-pip ${i < lobby.playerCount ? 'filled' : ''}`}
                      />
                    ))}
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-sm browse-join-btn"
                  disabled={!displayName.trim()}
                  onClick={() => handleJoin(lobby.roomCode)}
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom nav ─────────────────────────────────────────────────────── */}
      <nav className="home-bottom-nav">
        {(['join', 'create', 'browse'] as Tab[]).map(t => (
          <button
            key={t}
            className={`home-nav-item ${tab === t ? 'active' : ''}`}
            onClick={() => { setTab(t); clearError() }}
          >
            <span className="home-nav-icon">
              {t === 'join' ? '🎯' : t === 'create' ? '✨' : '🌐'}
            </span>
            <span className="home-nav-label">
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </span>
          </button>
        ))}
      </nav>
    </div>
  )
}


function friendlyError(code: string): string {
  const map: Record<string, string> = {
    GAME_NOT_FOUND:       'Game not found. Check the room code.',
    GAME_ALREADY_STARTED: 'This game has already started.',
    GAME_FULL:            'This game is full.',
    NO_PUBLIC_GAME:       'No open public games. Try creating one!',
    NOT_ENOUGH_PLAYERS:   'Need at least 3 players to start.',
    NOT_HOST:             'Only the host can start the game.',
    ALREADY_IN_GAME:      "You're already in this game.",
    ROOM_CODE_REQUIRED:   'Enter a room code to join a private game.',
  }
  return map[code] ?? code
}
