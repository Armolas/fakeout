import { useEffect, useRef, useState } from 'react'
import type {
  GamePhase,
  PublicPlayer,
} from '../types'

interface Props {
  phase: GamePhase
  role: 'crewmate' | 'impostor' | null
  word: string
  hint: string
  players: PublicPlayer[]
  roundTimeoutSeconds: number
  voteTimeoutSeconds: number
  chatMessages: Array<{ walletAddress: string; displayName: string; text: string }>
  hasVoted: boolean
  voteOptions: PublicPlayer[]
  voteProgress: { votesIn: number; totalVoters: number } | null
  tiebreakPlayers: PublicPlayer[] | null
  eliminatedPlayer: PublicPlayer | null
  walletAddress: string
  error: string | null
  clearError: () => void
  onSendMessage: (text: string) => void
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
  hasVoted,
  voteOptions,
  voteProgress,
  tiebreakPlayers,
  eliminatedPlayer,
  walletAddress,
  error,
  clearError,
  onSendMessage,
  onSubmitVote,
}: Props) {
  const [messageText, setMessageText] = useState('')
  const [timeLeft, setTimeLeft] = useState(roundTimeoutSeconds)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  function handleSend() {
    const trimmed = messageText.trim()
    if (!trimmed) return
    onSendMessage(trimmed)
    setMessageText('')
  }

  // ── Word reveal phase ──────────────────────────────────────────────────────
  if (phase === 'word_reveal') {
    return (
      <div className="screen center-content">
        <div className="role-reveal">
          {role === 'impostor' ? (
            <>
              <div className="role-icon impostor">👁</div>
              <h2 className="role-title">YOU ARE THE IMPOSTOR</h2>
              <p className="role-sub">You don't know the word. Blend in.</p>
              <div className="hint-box">
                <span className="hint-label">Your hint</span>
                <span className="hint-word">{hint}</span>
              </div>
            </>
          ) : (
            <>
              <div className="role-icon crewmate">👤</div>
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
        <div className="chat-word-bar">
          {role === 'crewmate'
            ? <span>Word: <strong>{word}</strong></span>
            : <span>Hint: <strong>{hint}</strong> · Impostor</span>}
        </div>

        <div className="game-header">
          <span className="round-badge">Discussion</span>
          {isClosed
            ? <span className="timer timer-warn">0s</span>
            : <Timer seconds={timeLeft} warn={timeLeft <= 10} />}
        </div>

        {error && <div className="error-banner" onClick={clearError}>{error}</div>}

        <div className="chat-messages">
          {chatMessages.map((entry, i) => {
            const isMine = entry.walletAddress.toLowerCase() === walletAddress.toLowerCase()
            return (
              <div key={i} className={`chat-bubble-row ${isMine ? 'mine' : 'theirs'}`}>
                {!isMine && <span className="chat-name">{entry.displayName}</span>}
                <div className={`chat-bubble ${isMine ? 'chat-bubble-mine' : 'chat-bubble-theirs'}`}>
                  {entry.text}
                </div>
              </div>
            )
          })}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-bar">
          {isClosed ? (
            <div className="chat-closed-banner">Chat closed · Voting soon…</div>
          ) : (
            <div className="clue-row">
              <input
                className="input"
                placeholder="Say something…"
                value={messageText}
                maxLength={200}
                onChange={e => setMessageText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                autoFocus
              />
              <button
                className="btn btn-primary"
                disabled={!messageText.trim()}
                onClick={handleSend}
              >
                Send
              </button>
            </div>
          )}
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
            {phase === 'tiebreak' ? '⚡ Tiebreak' : 'Vote'}
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
            <span className="check">✓</span>
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
                  <span className="vote-arrow">→</span>
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
          <div className="eliminated-icon">💀</div>
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
