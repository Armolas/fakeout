import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useGame } from './hooks/useGame'
import { Home } from './screens/Home'
import { GameLobby } from './screens/GameLobby'
import { GamePlay } from './screens/GamePlay'
import { Results } from './screens/Results'

export default function App() {
  const { address } = useAccount()
  const [displayName, setDisplayName] = useState('')
  const [playerStats, setPlayerStats] = useState<{ gamesPlayed: number; gamesWon: number } | null>(null)

  const walletAddress = address?.toLowerCase() ?? ''

  // Pre-fill display name and stats from DB if the player has played before
  useEffect(() => {
    if (!walletAddress) return
    const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'
    fetch(`${backendUrl}/api/players/${walletAddress}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.player) {
          if (data.player.displayName) setDisplayName(data.player.displayName)
          setPlayerStats({ gamesPlayed: data.player.gamesPlayed, gamesWon: data.player.gamesWon })
        }
      })
      .catch(() => {}) // silent — new player
  }, [walletAddress])

  const game = useGame(walletAddress, displayName)

  function handleCreateGame(_wallet: string, name: string, type: 'public' | 'private', stakeAmount: string) {
    setDisplayName(name)
    game.createGame(type, stakeAmount)
  }

  function handleJoinGame(_wallet: string, name: string, roomCode?: string) {
    setDisplayName(name)
    game.joinGame(roomCode)
  }

  function handleLeave() {
    game.resetGame()
  }

  // ── Route by game phase ────────────────────────────────────────────────────
  const { phase } = game

  if (phase === 'results' && game.result) {
    return (
      <Results
        result={game.result}
        walletAddress={walletAddress}
        role={game.role}
        onPlayAgain={handleLeave}
      />
    )
  }

  if (phase === 'lobby') {
    return (
      <GameLobby
        roomCode={game.roomCode}
        stakeAmount={game.stakeAmount}
        players={game.lobbyPlayers}
        isHost={game.isHost}
        hostWalletAddress={game.hostWalletAddress}
        walletAddress={walletAddress}
        onStart={game.startGame}
        onLeave={handleLeave}
        error={game.error}
        clearError={game.clearError}
      />
    )
  }

  if (
    phase === 'word_reveal' ||
    phase === 'clue_phase' ||
    phase === 'reviewing_clues' ||
    phase === 'vote_phase' ||
    phase === 'tiebreak' ||
    phase === 'eliminated_notice'
  ) {
    return (
      <GamePlay
        phase={phase}
        role={game.role}
        word={game.word}
        hint={game.hint}
        players={game.players}
        currentRound={game.currentRound}
        totalRounds={game.totalRounds}
        roundTimeoutSeconds={game.roundTimeoutSeconds}
        voteTimeoutSeconds={game.voteTimeoutSeconds}
        hasSubmittedClue={game.hasSubmittedClue}
        clueProgress={game.clueProgress}
        roundClues={game.roundClues}
        hasVoted={game.hasVoted}
        voteOptions={game.voteOptions}
        voteProgress={game.voteProgress}
        tiebreakPlayers={game.tiebreakPlayers}
        eliminatedPlayer={game.eliminatedPlayer}
        walletAddress={walletAddress}
        error={game.error}
        clearError={game.clearError}
        onSubmitClue={game.submitClue}
        onSubmitVote={game.submitVote}
      />
    )
  }

  // Default: home
  return (
    <Home
      onCreateGame={handleCreateGame}
      onJoinGame={handleJoinGame}
      connectedWallet={walletAddress}
      displayName={displayName}
      onDisplayNameChange={setDisplayName}
      playerStats={playerStats}
      error={game.error}
      clearError={game.clearError}
    />
  )
}
