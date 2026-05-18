import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { formatUnits } from 'viem'
import { ERC20_ABI, FAKEOUT_CONTRACT_ADDRESS, GOOD_DOLLAR_ADDRESS } from '../config/contracts'
import type { PublicLobby } from '../types'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'

const STAKE_OPTIONS = [
  { label: 'Free', value: '0' },
  { label: '1 G$', value: '1000000000000000000' },
  { label: '5 G$', value: '5000000000000000000' },
  { label: '10 G$', value: '10000000000000000000' },
]

interface Props {
  onJoinGame: (walletAddress: string, displayName: string, roomCode?: string) => void
  onCreateGame: (walletAddress: string, displayName: string, type: 'public' | 'private', stakeAmount: string) => void
  connectedWallet: string
  displayName: string
  onDisplayNameChange: (name: string) => void
  error: string | null
  clearError: () => void
}

type Tab = 'join' | 'create' | 'browse'

export function Home({
  onJoinGame,
  onCreateGame,
  connectedWallet,
  displayName,
  onDisplayNameChange,
  error,
  clearError,
}: Props) {
  const { address, isConnected } = useAccount()
  const { connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()

  const [tab, setTab] = useState<Tab>('join')
  const [roomCode, setRoomCode] = useState('')
  const [gameType, setGameType] = useState<'public' | 'private'>('public')
  const [stakeAmount, setStakeAmount] = useState(STAKE_OPTIONS[0].value)
  const [lobbies, setLobbies] = useState<PublicLobby[]>([])
  const [loadingLobbies, setLoadingLobbies] = useState(false)
  const [needsApproval, setNeedsApproval] = useState(false)
  const [pendingAction, setPendingAction] = useState<'join' | 'create' | null>(null)

  // G$ balance
  const { data: balance } = useReadContract({
    address: GOOD_DOLLAR_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: GOOD_DOLLAR_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, FAKEOUT_CONTRACT_ADDRESS] : undefined,
    query: { enabled: !!address && BigInt(stakeAmount) > 0n },
  })

  // Approve tx
  const { writeContract: approve, data: approveTxHash, isPending: isApproving } = useWriteContract()
  const { isLoading: isWaitingApproval, isSuccess: approvalConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  })

  // After approval confirmed, fire the pending action
  useEffect(() => {
    if (!approvalConfirmed || !pendingAction) return
    refetchAllowance()
    setNeedsApproval(false)

    const wallet = address!.toLowerCase()
    if (pendingAction === 'create') {
      onCreateGame(wallet, displayName, gameType, stakeAmount)
    } else {
      onJoinGame(wallet, displayName, roomCode || undefined)
    }
    setPendingAction(null)
  }, [approvalConfirmed])  // eslint-disable-line

  // Auto-connect for MiniPay
  useEffect(() => {
    if (!isConnected) {
      connect({ connector: injected() })
    }
  }, []) // eslint-disable-line

  // Fetch public lobbies
  useEffect(() => {
    if (tab !== 'browse') return
    fetchLobbies()
  }, [tab])

  async function fetchLobbies() {
    setLoadingLobbies(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/lobbies`)
      const data = await res.json()
      setLobbies(data.lobbies ?? [])
    } catch {
      // silent
    } finally {
      setLoadingLobbies(false)
    }
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
      approve({
        address: GOOD_DOLLAR_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [FAKEOUT_CONTRACT_ADDRESS, BigInt(stakeAmount)],
      })
      return
    }

    onCreateGame(wallet, displayName, gameType, stakeAmount)
  }

  function handleJoin(code?: string) {
    if (!address || !displayName.trim()) return
    const wallet = address.toLowerCase()
    const rc = code ?? roomCode

    if (BigInt(stakeAmount) > 0n && !hasEnoughAllowance()) {
      setNeedsApproval(true)
      setPendingAction('join')
      approve({
        address: GOOD_DOLLAR_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [FAKEOUT_CONTRACT_ADDRESS, BigInt(stakeAmount)],
      })
      return
    }

    onJoinGame(wallet, displayName, rc || undefined)
  }

  const isApprovalInFlight = isApproving || isWaitingApproval

  if (!isConnected) {
    return (
      <div className="screen center-content">
        <div className="logo">
          <span className="logo-emoji">🎭</span>
          <h1 className="logo-title">FAKEOUT</h1>
          <p className="logo-sub">Social deduction on Celo</p>
        </div>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => connect({ connector: injected() })}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
        <p className="muted">Powered by MiniPay + GoodDollar</p>
      </div>
    )
  }

  return (
    <div className="screen">
      {/* Header */}
      <div className="home-header">
        <div className="logo-row">
          <span className="logo-emoji-sm">🎭</span>
          <span className="logo-title-sm">FAKEOUT</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => disconnect()}>
          {shortenAddress(address ?? '')}
        </button>
      </div>

      {balance !== undefined && (
        <p className="balance-badge">
          G$ Balance: {formatUnits(balance as bigint, 18)}
        </p>
      )}

      {/* Display name */}
      <div className="field">
        <label className="label">Your name</label>
        <input
          className="input"
          placeholder="Enter display name"
          value={displayName}
          maxLength={20}
          onChange={e => onDisplayNameChange(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'join' ? 'active' : ''}`} onClick={() => { setTab('join'); clearError() }}>
          Join
        </button>
        <button className={`tab ${tab === 'create' ? 'active' : ''}`} onClick={() => { setTab('create'); clearError() }}>
          Create
        </button>
        <button className={`tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => { setTab('browse'); clearError() }}>
          Browse
        </button>
      </div>

      {error && (
        <div className="error-banner" onClick={clearError}>
          {friendlyError(error)}
        </div>
      )}

      {/* Join tab */}
      {tab === 'join' && (
        <div className="tab-content">
          <div className="field">
            <label className="label">Room code (private game)</label>
            <input
              className="input input-code"
              placeholder="XXXXXX"
              value={roomCode}
              maxLength={6}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={!displayName.trim() || isApprovalInFlight}
            onClick={() => handleJoin()}
          >
            {isApprovalInFlight ? 'Approving G$…' : roomCode ? 'Join Private Game' : 'Join Random Game'}
          </button>
          {needsApproval && isApprovalInFlight && (
            <p className="hint">Approve G$ spend in your wallet, then the game will start automatically.</p>
          )}
        </div>
      )}

      {/* Create tab */}
      {tab === 'create' && (
        <div className="tab-content">
          <div className="field">
            <label className="label">Game type</label>
            <div className="toggle-group">
              <button
                className={`toggle ${gameType === 'public' ? 'active' : ''}`}
                onClick={() => setGameType('public')}
              >
                Public
              </button>
              <button
                className={`toggle ${gameType === 'private' ? 'active' : ''}`}
                onClick={() => setGameType('private')}
              >
                Private
              </button>
            </div>
          </div>

          <div className="field">
            <label className="label">Stake per player</label>
            <div className="stake-grid">
              {STAKE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`stake-option ${stakeAmount === opt.value ? 'active' : ''}`}
                  onClick={() => setStakeAmount(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary"
            disabled={!displayName.trim() || isApprovalInFlight}
            onClick={handleCreate}
          >
            {isApprovalInFlight ? 'Approving G$…' : 'Create Game'}
          </button>
          {needsApproval && isApprovalInFlight && (
            <p className="hint">Approve G$ spend in your wallet, then the game will start automatically.</p>
          )}
        </div>
      )}

      {/* Browse tab */}
      {tab === 'browse' && (
        <div className="tab-content">
          <div className="browse-header">
            <span className="label">Public lobbies</span>
            <button className="btn btn-ghost btn-sm" onClick={fetchLobbies}>Refresh</button>
          </div>
          {loadingLobbies && <p className="muted">Loading…</p>}
          {!loadingLobbies && lobbies.length === 0 && (
            <p className="muted">No open lobbies. Create one!</p>
          )}
          {lobbies.map(lobby => (
            <div key={lobby.roomCode} className="lobby-card">
              <div className="lobby-info">
                <span className="lobby-code">{lobby.roomCode}</span>
                <span className="muted">
                  {lobby.playerCount}/{lobby.maxPlayers} players
                  {lobby.stakeAmount !== '0' && ` · ${formatUnits(BigInt(lobby.stakeAmount), 18)} G$`}
                </span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                disabled={!displayName.trim()}
                onClick={() => handleJoin(lobby.roomCode)}
              >
                Join
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function shortenAddress(addr: string) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function friendlyError(code: string): string {
  const map: Record<string, string> = {
    GAME_NOT_FOUND: 'Game not found. Check the room code.',
    GAME_ALREADY_STARTED: 'This game has already started.',
    GAME_FULL: 'This game is full.',
    NO_PUBLIC_GAME: 'No open public games. Try creating one!',
    NOT_ENOUGH_PLAYERS: 'Need at least 3 players to start.',
    NOT_HOST: "Only the host can start the game.",
    ALREADY_IN_GAME: "You're already in this game.",
    ROOM_CODE_REQUIRED: 'Enter a room code to join a private game.',
  }
  return map[code] ?? code
}
