import { useEffect, useRef, useState } from 'react'
import { Eye, User, Vote, Zap, Check, ChevronRight, Skull, MessageCircle, X } from 'lucide-react'
import { GameChat } from '../components/GameChat'
import type {
  ChatMessage,
  GamePhase,
  PublicPlayer,
  TurnDescription,
  TypingUser,
} from '../types'

interface Props {
  phase: GamePhase
  role: 'crewmate' | 'impostor' | null
  word: string
  hint: string
  players: PublicPlayer[]
  isHost: boolean
  currentTurnWallet: string
  currentTurnIndex: number
  describeRoundNumber: number
  totalDescribeRounds: number
  totalInRound: number
  turnDescriptions: TurnDescription[]
  chatBufferSeconds: number
  voteTimeoutSeconds: number
  chatMessages: ChatMessage[]
  typingUsers: TypingUser[]
  hasVoted: boolean
  voteOptions: PublicPlayer[]
  voteProgress: { votesIn: number; totalVoters: number } | null
  tiebreakPlayers: PublicPlayer[] | null
  eliminatedPlayer: PublicPlayer | null
  walletAddress: string
  error: string | null
  clearError: () => void
  onSendMessage: (
    text: string,
    opts?: { replyToId?: string; mentionWalletAddresses?: string[] }
  ) => void
  onTyping: () => void
  onTypingStop: () => void
  onReaction: (messageId: string, emoji: string) => void
  onSubmitDescription: (text: string) => void
  onSubmitVote: (walletAddress: string) => void
}

export function GamePlay({
  phase,
  role,
  word,
  hint,
  players,
  isHost: _isHost,
  currentTurnWallet,
  currentTurnIndex,
  describeRoundNumber,
  totalDescribeRounds,
  totalInRound,
  turnDescriptions,
  chatBufferSeconds,
  voteTimeoutSeconds,
  chatMessages,
  typingUsers,
  hasVoted,
  voteOptions,
  voteProgress,
  tiebreakPlayers,
  eliminatedPlayer,
  walletAddress,
  error,
  clearError,
  onSendMessage,
  onTyping,
  onTypingStop,
  onReaction,
  onSubmitDescription,
  onSubmitVote,
}: Props) {
  const [announceCount, setAnnounceCount] = useState(3)
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [describeInput, setDescribeInput] = useState('')
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(15)
  const [bufferSecondsLeft, setBufferSecondsLeft] = useState(chatBufferSeconds)
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bufferTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevChatLengthRef = useRef(chatMessages.length)

  const isMyTurn = currentTurnWallet.toLowerCase() === walletAddress.toLowerCase()

  // Track unread chat messages when drawer is closed
  useEffect(() => {
    if (chatOpen) {
      setUnreadCount(0)
      prevChatLengthRef.current = chatMessages.length
    } else {
      const newMessages = chatMessages.length - prevChatLengthRef.current
      if (newMessages > 0) setUnreadCount(n => n + newMessages)
      prevChatLengthRef.current = chatMessages.length
    }
  }, [chatMessages.length, chatOpen])

  // 15s per-turn countdown — reset on every new turn
  useEffect(() => {
    if (phase !== 'clue_phase') return
    if (!currentTurnWallet) return
    setTurnSecondsLeft(15)
    if (turnTimerRef.current) clearInterval(turnTimerRef.current)
    turnTimerRef.current = setInterval(() => {
      setTurnSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(turnTimerRef.current!)
          turnTimerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current)
    }
  }, [currentTurnWallet, phase])

  // Chat buffer countdown
  useEffect(() => {
    if (phase !== 'chat_buffer') return
    setBufferSecondsLeft(chatBufferSeconds)
    setChatOpen(true) // auto-open chat when buffer starts
    if (bufferTimerRef.current) clearInterval(bufferTimerRef.current)
    bufferTimerRef.current = setInterval(() => {
      setBufferSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(bufferTimerRef.current!)
          bufferTimerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (bufferTimerRef.current) clearInterval(bufferTimerRef.current)
    }
  }, [phase, chatBufferSeconds])

  // Vote announce countdown
  useEffect(() => {
    if (phase !== 'vote_announce') return
    setAnnounceCount(3)
    const tick = setInterval(() => setAnnounceCount(n => Math.max(0, n - 1)), 1000)
    return () => clearInterval(tick)
  }, [phase])

  // Close popup and reset input when turn changes away from me
  useEffect(() => {
    if (!isMyTurn) setDescribeInput('')
  }, [isMyTurn])

  // ── Word reveal ──────────────────────────────────────────────────────────────
  if (phase === 'word_reveal') {
    return (
      <div className="screen center-content">
        <div className="role-reveal">
          {role === 'impostor' ? (
            <>
              <div className="role-icon impostor"><Eye size={36} /></div>
              <h2 className="role-title">YOU ARE THE IMPOSTOR</h2>
              <p className="role-sub">You don't know the word. Blend in.</p>
              <div className="hint-box">
                <span className="hint-label">Your hint</span>
                <span className="hint-word">{hint}</span>
              </div>
            </>
          ) : (
            <>
              <div className="role-icon crewmate"><User size={36} /></div>
              <h2 className="role-title">YOU ARE A CREWMATE</h2>
              <p className="role-sub">Use the word to find the impostor.</p>
              <div className="word-box">
                <span className="word-label">The word is</span>
                <span className="word-reveal">{word}</span>
              </div>
            </>
          )}
          <p className="muted" style={{ marginTop: 24 }}>Game starting in a moment…</p>
        </div>
      </div>
    )
  }

  // ── Clue phase (turn-based descriptions) ────────────────────────────────────
  if (phase === 'clue_phase') {
    const currentDescriber = players.find(
      p => p.walletAddress.toLowerCase() === currentTurnWallet.toLowerCase()
    )

    return (
      <div className="screen describe-screen">
        {error && <div className="error-banner" onClick={clearError}>{error}</div>}

        {/* Round indicator */}
        <div className="describe-round-header">
          <span className="describe-round-label">
            Round {describeRoundNumber}/{totalDescribeRounds}
          </span>
          <span className="describe-turn-label">
            {currentDescriber ? `${currentDescriber.displayName} is describing` : 'Loading…'}
            <span className="describe-turn-timer" data-warn={turnSecondsLeft <= 5}>
              {turnSecondsLeft}s
            </span>
          </span>
        </div>

        {/* Player grid */}
        <div className="describe-player-grid">
          {players.map(p => {
            const isActive = p.walletAddress.toLowerCase() === currentTurnWallet.toLowerCase()
            const described = turnDescriptions.some(
              d => d.walletAddress.toLowerCase() === p.walletAddress.toLowerCase()
            )
            const isEliminated = !voteOptions.length
              ? false
              : !voteOptions.some(v => v.walletAddress.toLowerCase() === p.walletAddress.toLowerCase())
            return (
              <div
                key={p.walletAddress}
                className={`describe-player-card ${isActive ? 'active' : ''} ${isEliminated ? 'eliminated' : ''}`}
              >
                <div className={`describe-player-avatar ${isActive ? 'pulsing' : ''}`}>
                  {p.displayName[0]?.toUpperCase()}
                </div>
                <span className="describe-player-name">{p.displayName}</span>
                {described && <span className="describe-player-check"><Check size={10} /></span>}
              </div>
            )
          })}
        </div>

        {/* Descriptions feed */}
        <div className="describe-feed">
          {turnDescriptions.length === 0 ? (
            <p className="describe-feed-empty">Waiting for the first description…</p>
          ) : (
            turnDescriptions.map((d, i) => (
              <div key={i} className={`describe-entry ${d.skipped ? 'skipped' : ''}`}>
                <span className="describe-entry-avatar">{d.displayName[0]?.toUpperCase()}</span>
                <span className="describe-entry-name">{d.displayName}</span>
                <span className="describe-entry-text">
                  {d.skipped ? <em>(skipped)</em> : `"${d.text}"`}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Floating chat button — hidden while drawer is open */}
        {!chatOpen && (
          <button
            className="chat-fab"
            onClick={() => { setChatOpen(true); setUnreadCount(0) }}
          >
            <MessageCircle size={22} />
            {unreadCount > 0 && <span className="chat-fab-badge">{unreadCount}</span>}
          </button>
        )}

        {/* Chat drawer */}
        {chatOpen && (
          <div className="chat-drawer">
            <div className="chat-drawer-header">
              <span>Chat</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setChatOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <GameChat
              word={word}
              hint={hint}
              role={role}
              players={players}
              messages={chatMessages}
              typingUsers={typingUsers}
              walletAddress={walletAddress}
              isClosed={false}
              timeLeft={0}
              error={null}
              clearError={clearError}
              onSendMessage={onSendMessage}
              onTyping={onTyping}
              onTypingStop={onTypingStop}
              onReaction={onReaction}
            />
          </div>
        )}

        {/* Your turn popup — locked, cannot dismiss */}
        {isMyTurn && (
          <div className="describe-overlay">
            <div className="describe-popup">
              {/* Timer bar */}
              <div className="describe-popup-timer-bar">
                <div
                  className="describe-popup-timer-fill"
                  style={{ width: `${(turnSecondsLeft / 15) * 100}%` }}
                  data-warn={turnSecondsLeft <= 5}
                />
              </div>

              <h3 className="describe-popup-title">Your turn to describe!</h3>
              <p className="describe-popup-countdown" data-warn={turnSecondsLeft <= 5}>
                {turnSecondsLeft}s
              </p>

              {role === 'impostor' ? (
                <div className="describe-popup-word impostor">
                  <span className="describe-popup-word-label">Your hint</span>
                  <span className="describe-popup-word-value">{hint}</span>
                  <p className="describe-popup-word-note">You don't know the real word — blend in</p>
                </div>
              ) : (
                <div className="describe-popup-word crewmate">
                  <span className="describe-popup-word-label">The word is</span>
                  <span className="describe-popup-word-value">{word}</span>
                </div>
              )}

              <textarea
                className="describe-popup-input"
                placeholder="Type your description…"
                maxLength={120}
                value={describeInput}
                autoFocus
                onChange={e => setDescribeInput(e.target.value)}
              />
              <p className="describe-popup-charcount">{describeInput.length}/120</p>

              <button
                className="btn btn-primary btn-lg describe-popup-submit"
                disabled={!describeInput.trim()}
                onClick={() => {
                  onSubmitDescription(describeInput.trim())
                  setDescribeInput('')
                }}
              >
                Submit
              </button>

              <p className="describe-popup-hint">
                Turn {currentTurnIndex + 1} of {totalInRound}
              </p>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Chat buffer phase ────────────────────────────────────────────────────────
  if (phase === 'chat_buffer') {
    return (
      <div className="screen describe-screen">
        {/* Buffer banner */}
        <div className="chat-buffer-banner">
          <MessageCircle size={16} />
          <span>Open discussion</span>
          <span className="chat-buffer-timer">{bufferSecondsLeft}s</span>
        </div>

        {/* Descriptions summary (read-only) */}
        <div className="describe-feed describe-feed-summary">
          {turnDescriptions.length === 0 ? (
            <p className="describe-feed-empty">No descriptions were submitted.</p>
          ) : (
            turnDescriptions.map((d, i) => (
              <div key={i} className={`describe-entry ${d.skipped ? 'skipped' : ''}`}>
                <span className="describe-entry-avatar">{d.displayName[0]?.toUpperCase()}</span>
                <span className="describe-entry-name">{d.displayName}</span>
                <span className="describe-entry-text">
                  {d.skipped ? <em>(skipped)</em> : `"${d.text}"`}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Floating chat button — hidden while drawer is open */}
        {!chatOpen && (
          <button
            className="chat-fab"
            onClick={() => { setChatOpen(true); setUnreadCount(0) }}
          >
            <MessageCircle size={22} />
            {unreadCount > 0 && <span className="chat-fab-badge">{unreadCount}</span>}
          </button>
        )}

        {/* Full-height chat drawer */}
        {chatOpen && (
          <div className="chat-drawer">
            <div className="chat-drawer-header">
              <span>Chat</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setChatOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <GameChat
              word={word}
              hint={hint}
              role={role}
              players={players}
              messages={chatMessages}
              typingUsers={typingUsers}
              walletAddress={walletAddress}
              isClosed={false}
              timeLeft={0}
              error={error}
              clearError={clearError}
              onSendMessage={onSendMessage}
              onTyping={onTyping}
              onTypingStop={onTypingStop}
              onReaction={onReaction}
            />
          </div>
        )}
      </div>
    )
  }

  // ── Vote announce interstitial ───────────────────────────────────────────────
  if (phase === 'vote_announce') {
    return (
      <div className="screen center-content">
        <div className="vote-announce">
          <div className="vote-announce-icon"><Vote size={48} /></div>
          <h2 className="vote-announce-title">Time to vote!</h2>
          <p className="vote-announce-sub">Who do you think the impostor is?</p>
          <div className="vote-announce-count">{announceCount}</div>
        </div>
      </div>
    )
  }

  // ── Vote phase + tiebreak ────────────────────────────────────────────────────
  if (phase === 'vote_phase' || phase === 'tiebreak') {
    const options = phase === 'tiebreak' ? (tiebreakPlayers ?? voteOptions) : voteOptions
    const selfInOptions = options.some(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase())

    return (
      <div className="screen">
        <div className="game-header">
          <span className={`round-badge ${phase === 'tiebreak' ? 'tiebreak' : ''}`}>
            {phase === 'tiebreak' ? <><Zap size={14} /> Tiebreak</> : 'Vote'}
          </span>
          <Timer seconds={voteTimeoutSeconds} warn={voteTimeoutSeconds <= 10} />
        </div>

        {error && <div className="error-banner" onClick={clearError}>{error}</div>}

        <p className="vote-prompt">
          {phase === 'tiebreak'
            ? 'Sudden death! Vote to eliminate one of the tied players.'
            : 'Who is the impostor? Vote to eliminate.'}
        </p>

        {voteProgress && (
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-fill"
              style={{ width: `${(voteProgress.votesIn / voteProgress.totalVoters) * 100}%` }}
            />
            <span className="progress-label">
              {voteProgress.votesIn}/{voteProgress.totalVoters} voted
            </span>
          </div>
        )}

        {hasVoted ? (
          <div className="submitted-notice">
            <span className="check"><Check size={16} /></span>
            <span>Vote cast. Waiting for results…</span>
          </div>
        ) : (
          <div className="vote-list">
            {options
              .filter(p => p.walletAddress.toLowerCase() !== walletAddress.toLowerCase())
              .map(p => (
                <button
                  key={p.walletAddress}
                  className="vote-card"
                  onClick={() => onSubmitVote(p.walletAddress)}
                >
                  <div className="vote-avatar">{p.displayName[0]?.toUpperCase()}</div>
                  <span className="vote-name">{p.displayName}</span>
                  <span className="vote-arrow"><ChevronRight size={16} /></span>
                </button>
              ))}
            {selfInOptions && (
              <p className="hint center">You cannot vote for yourself.</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Eliminated notice ────────────────────────────────────────────────────────
  if (phase === 'eliminated_notice' && eliminatedPlayer) {
    const isSelf = eliminatedPlayer.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    return (
      <div className="screen center-content">
        <div className="eliminated-notice">
          <div className="eliminated-icon"><Skull size={48} /></div>
          <h2>{eliminatedPlayer.displayName} was eliminated</h2>
          {isSelf && <p className="hint">You have been eliminated. You can still chat!</p>}
          <p className="muted">Next round starting…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen center-content">
      <p className="muted">Loading game…</p>
    </div>
  )
}

function Timer({ seconds, warn }: { seconds: number; warn: boolean }) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const label = mins > 0
    ? `${mins}:${secs.toString().padStart(2, '0')}`
    : `${secs}s`
  return <span className={`timer ${warn ? 'timer-warn' : ''}`}>{label}</span>
}
