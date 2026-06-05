import { useEffect, useRef, useState } from 'react'
import { Eye, User, Vote, Zap, Check, ChevronRight, Skull } from 'lucide-react'
import { GameChat } from '../components/GameChat'
import type {
  ChatMessage,
  GamePhase,
  PublicPlayer,
  TypingUser,
} from '../types'

interface Props {
  phase: GamePhase
  role: 'crewmate' | 'impostor' | null
  word: string
  hint: string
  players: PublicPlayer[]
  roundTimeoutSeconds: number
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
  onSubmitVote: (walletAddress: string) => void
}

export function GamePlay({
  phase,
  role,
  word,
  hint,
  players,
  roundTimeoutSeconds,
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
  onSubmitVote,
}: Props) {
  const [timeLeft, setTimeLeft] = useState(roundTimeoutSeconds)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [announceCount, setAnnounceCount] = useState(3)

  useEffect(() => {
    if (phase === 'clue_phase') {
      setTimeLeft(roundTimeoutSeconds)
      startTimer(roundTimeoutSeconds)
    }
    if (phase === 'vote_phase' || phase === 'tiebreak') {
      setTimeLeft(voteTimeoutSeconds)
      startTimer(voteTimeoutSeconds)
    }
    return () => stopTimer()
  }, [phase]) // eslint-disable-line

  // Countdown display during vote_announce
  useEffect(() => {
    if (phase !== 'vote_announce') return
    setAnnounceCount(3)
    const tick = setInterval(() => setAnnounceCount(n => Math.max(0, n - 1)), 1000)
    return () => clearInterval(tick)
  }, [phase])

  function startTimer(seconds: number) {
    stopTimer()
    setTimeLeft(seconds)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          stopTimer()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // ── Word reveal phase ──────────────────────────────────────────────────────
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

  // ── Clue phase + reviewing clues (unified chat view) ──────────────────────
  if (phase === 'clue_phase' || phase === 'reviewing_clues') {
    const isClosed = phase === 'reviewing_clues'

    return (
      <div className="screen chat-screen">
        <GameChat
          word={word}
          hint={hint}
          role={role}
          players={players}
          messages={chatMessages}
          typingUsers={typingUsers}
          walletAddress={walletAddress}
          isClosed={isClosed}
          timeLeft={isClosed ? 0 : timeLeft}
          error={error}
          clearError={clearError}
          onSendMessage={onSendMessage}
          onTyping={onTyping}
          onTypingStop={onTypingStop}
          onReaction={onReaction}
        />
      </div>
    )
  }

  // ── Vote announce interstitial ─────────────────────────────────────────────
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

  // ── Vote phase + tiebreak ──────────────────────────────────────────────────
  if (phase === 'vote_phase' || phase === 'tiebreak') {
    const options = phase === 'tiebreak' ? (tiebreakPlayers ?? voteOptions) : voteOptions
    const selfInOptions = options.some(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase())

    return (
      <div className="screen">
        <div className="game-header">
          <span className={`round-badge ${phase === 'tiebreak' ? 'tiebreak' : ''}`}>
            {phase === 'tiebreak' ? <><Zap size={14} /> Tiebreak</> : 'Vote'}
          </span>
          <Timer seconds={timeLeft} warn={timeLeft <= 10} />
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

  // ── Eliminated notice ──────────────────────────────────────────────────────
  if (phase === 'eliminated_notice' && eliminatedPlayer) {
    const isSelf = eliminatedPlayer.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    return (
      <div className="screen center-content">
        <div className="eliminated-notice">
          <div className="eliminated-icon"><Skull size={48} /></div>
          <h2>{eliminatedPlayer.displayName} was eliminated</h2>
          {isSelf && <p className="hint">You have been eliminated. Watch the rest of the game!</p>}
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
