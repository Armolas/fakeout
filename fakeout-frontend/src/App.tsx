import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useGame } from './hooks/useGame'
import { Home } from './screens/Home'
import { GameLobby } from './screens/GameLobby'
import { GamePlay } from './screens/GamePlay'
import { Results } from './screens/Results'

export default function App() {
  const { address } = useAccount()
  const [displayName, setDisplayName] = useState('')

  const walletAddress = address?.toLowerCase() ?? ''

  const game = useGame(walletAddress, displayName)

  function handleCreateGame(wallet: string, name: string, type: 'public' | 'private', stakeAmount: string) {
    setDisplayName(name)
    game.createGame(type, stakeAmount)
  }

  function handleJoinGame(wallet: string, name: string, roomCode?: string) {
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
      error={game.error}
      clearError={game.clearError}
    />
  )
}
