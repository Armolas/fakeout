import { useEffect, useRef, useState } from 'react'
import type {
  GamePhase,
  PublicPlayer,
  RoundCluesPayload,
} from '../types'

interface Props {
  phase: GamePhase
  role: 'crewmate' | 'impostor' | null
  word: string
  hint: string
  players: PublicPlayer[]
  currentRound: number
  totalRounds: number
  roundTimeoutSeconds: number
  voteTimeoutSeconds: number
  hasSubmittedClue: boolean
  clueProgress: { submitted: number; total: number } | null
  roundClues: RoundCluesPayload | null
  hasVoted: boolean
  voteOptions: PublicPlayer[]
  voteProgress: { votesIn: number; totalVoters: number } | null
  tiebreakPlayers: PublicPlayer[] | null
  eliminatedPlayer: PublicPlayer | null
  walletAddress: string
  error: string | null
  clearError: () => void
  onSubmitClue: (clue: string) => void
  onSubmitVote: (walletAddress: string) => void
}

export function GamePlay({
  phase,
  role,
  word,
  hint,
  players,
  currentRound,
  totalRounds,
  roundTimeoutSeconds,
  voteTimeoutSeconds,
  hasSubmittedClue,
  clueProgress,
  roundClues,
  hasVoted,
  voteOptions,
  voteProgress,
  tiebreakPlayers,
  eliminatedPlayer,
  walletAddress,
  error,
  clearError,
  onSubmitClue,
  onSubmitVote,
}: Props) {
  const [clueText, setClueText] = useState('')
  const [timeLeft, setTimeLeft] = useState(roundTimeoutSeconds)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset clue input on new round
  useEffect(() => {
    if (phase === 'clue_phase') {
      setClueText('')
      setTimeLeft(roundTimeoutSeconds)
      startTimer(roundTimeoutSeconds)
    }
    if (phase === 'vote_phase' || phase === 'tiebreak') {
      setTimeLeft(voteTimeoutSeconds)
      startTimer(voteTimeoutSeconds)
    }
    return () => stopTimer()
  }, [phase, currentRound]) // eslint-disable-line

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

  function handleSubmitClue() {
    const trimmed = clueText.trim()
    if (!trimmed || trimmed.includes(' ')) return
    onSubmitClue(trimmed)
    setClueText('')
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

  // ── Clue phase ─────────────────────────────────────────────────────────────
  if (phase === 'clue_phase') {
    const isMultiWord = clueText.trim().includes(' ')

    return (
      <div className="screen">
        <div className="game-header">
          <span className="round-badge">Round {currentRound}/{totalRounds}</span>
          <Timer seconds={timeLeft} warn={timeLeft <= 10} />
        </div>

        {error && <div className="error-banner" onClick={clearError}>{error}</div>}

        <div className="word-reminder">
          {role === 'crewmate' ? (
            <span>Word: <strong>{word}</strong></span>
          ) : (
            <span>Hint: <strong>{hint}</strong> · You are the impostor</span>
          )}
        </div>

        <div className="players-row">
          {players.map(p => (
            <div key={p.walletAddress} className="player-chip">
              {p.displayName[0]?.toUpperCase()}
            </div>
          ))}
        </div>

        {clueProgress && (
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-fill"
              style={{ width: `${(clueProgress.submitted / clueProgress.total) * 100}%` }}
            />
            <span className="progress-label">
              {clueProgress.submitted}/{clueProgress.total} clues submitted
            </span>
          </div>
        )}

        {hasSubmittedClue ? (
          <div className="submitted-notice">
            <span className="check">✓</span>
            <span>Clue submitted. Waiting for others…</span>
          </div>
        ) : (
          <div className="clue-input-area">
            <label className="label">Your clue — one word only</label>
            <div className="clue-row">
              <input
                className={`input ${isMultiWord ? 'input-error' : ''}`}
                placeholder="e.g. fluffy"
                value={clueText}
                maxLength={30}
                onChange={e => setClueText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmitClue()}
                autoFocus
              />
              <button
                className="btn btn-primary"
                disabled={!clueText.trim() || isMultiWord}
                onClick={handleSubmitClue}
              >
                Submit
              </button>
            </div>
            {isMultiWord && <p className="field-error">One word only — no spaces!</p>}
          </div>
        )}
      </div>
    )
  }

  // ── Reviewing clues ────────────────────────────────────────────────────────
  if (phase === 'reviewing_clues' && roundClues) {
    return (
      <div className="screen">
        <div className="game-header">
          <span className="round-badge">Round {roundClues.roundNumber} clues</span>
        </div>

        <div className="clue-list">
          {roundClues.clues.map((c, i) => (
            <div key={i} className="clue-card">
              <span className="clue-author">{c.displayName}</span>
              <span className="clue-word">{c.clueText}</span>
            </div>
          ))}
        </div>

        <p className="muted center">Voting starts soon…</p>
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
