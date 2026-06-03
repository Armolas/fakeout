import { formatUnits } from 'viem'
import type { GameResultPayload } from '../types'

interface Props {
  result: GameResultPayload
  walletAddress: string
  role: 'crewmate' | 'impostor' | null
  onPlayAgain: () => void
}

export function Results({ result, walletAddress, role, onPlayAgain }: Props) {
  const isWinner = result.winners.some(
    w => w.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  )
  const isDraw = result.outcome === 'draw'
  const crewmatesWin = result.outcome === 'crewmates_win'
  const perWinner = BigInt(result.perWinnerAmount ?? '0')
  const pot = BigInt(result.potAmount ?? '0')
  const hasPrize = perWinner > 0n

  return (
    <div className="screen center-content">
      <div className="results">
        {/* Outcome banner */}
        <div className={`outcome-banner ${isDraw ? 'draw' : crewmatesWin ? 'crewmates-win' : 'impostor-wins'}`}>
          {isWinner && (
            <div className="confetti" aria-hidden="true">
              {['⭐','✨','🌟','💫','⚡','🎊'].map((s, i) => (
                <span key={i} style={{
                  left: `${10 + i * 14}%`,
                  top: '15%',
                  '--tx': `${(i % 2 === 0 ? 1 : -1) * (18 + i * 9)}px`,
                  '--ty': `${-(28 + i * 13)}px`,
                  animationDelay: `${i * 0.09}s`,
                } as React.CSSProperties}>{s}</span>
              ))}
            </div>
          )}
          <span className="outcome-icon">{isDraw ? '🤝' : crewmatesWin ? '🕵️' : '👁'}</span>
          <h1 className="outcome-title">
            {isDraw ? "It's a Draw!" : crewmatesWin ? 'Crewmates Win!' : 'Impostor Wins!'}
          </h1>
          <p className="outcome-sub">
            {isDraw
              ? '3 tiebreaks with no result. Nobody wins.'
              : isWinner ? 'You won!' : 'Better luck next time.'}
          </p>
        </div>

        {/* Your result */}
        {!isDraw && (
        <div className={`personal-result ${isWinner ? 'winner' : 'loser'}`}>
          <span className="personal-icon">{isWinner ? '🏆' : '💀'}</span>
          <div>
            <p className="personal-label">{isWinner ? 'Victory' : 'Defeat'}</p>
            {hasPrize && isWinner && (
              <p className="prize">
                +{formatUnits(perWinner, 18)} G$
              </p>
            )}
          </div>
        </div>
        )}

        {/* The word */}
        <div className="reveal-box">
          <span className="reveal-label">The word was</span>
          <span className="reveal-word">{result.word}</span>
        </div>

        {/* Impostors revealed */}
        <div className="impostors-section">
          <p className="section-label">
            {result.impostors.length === 1 ? 'The impostor was' : 'The impostors were'}
          </p>
          <div className="impostor-list">
            {result.impostors.map(p => (
              <div key={p.walletAddress} className="impostor-chip">
                <span className="impostor-avatar">{p.displayName[0]?.toUpperCase()}</span>
                <span>{p.displayName}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Winners */}
        {result.winners.length > 0 && (
          <div className="winners-section">
            <p className="section-label">Winners</p>
            <div className="winner-list">
              {result.winners.map(p => (
                <div key={p.walletAddress} className="winner-chip">
                  <span>🏆</span>
                  <span>{p.displayName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pot info */}
        {pot > 0n && (
          <p className="muted center">
            Pot: {formatUnits(pot, 18)} G$
            {hasPrize && result.winners.length > 0 && (
              <> · {formatUnits(perWinner, 18)} G$ per winner</>
            )}
          </p>
        )}

        <button className="btn btn-primary btn-lg" onClick={onPlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  )
}
