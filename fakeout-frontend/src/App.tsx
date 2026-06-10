import { useState, useEffect } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { Volume2, VolumeX } from 'lucide-react'
import { useGame } from './hooks/useGame'
import { useMusic } from './hooks/useMusic'
import { Home } from './screens/Home'
import { Profile } from './screens/Profile'
import { GameLobby } from './screens/GameLobby'
import { GamePlay } from './screens/GamePlay'
import { Results } from './screens/Results'
import { FirstTimeModal } from './components/FirstTimeModal'
type PlayerStats = {
  gamesPlayed: number
  gamesWon: number
  totalAmountWon: string
  totalAmountLost: string
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'

export default function App() {
  const { address } = useAccount()
  const { disconnect } = useDisconnect()
  const [displayName, setDisplayName] = useState('')
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null)
  const [showProfile, setShowProfile] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState(false)

  const walletAddress = address?.toLowerCase() ?? ''

  useEffect(() => {
    if (!walletAddress) return
    fetch(`${BACKEND_URL}/api/players/${walletAddress}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.player) {
          if (data.player.displayName) setDisplayName(data.player.displayName)
          setPlayerStats({
            gamesPlayed: data.player.gamesPlayed,
            gamesWon: data.player.gamesWon,
            totalAmountWon: data.player.totalAmountWon ?? '0',
            totalAmountLost: data.player.totalAmountLost ?? '0',
          })
        } else {
          setIsFirstTime(true)
        }
      })
      .catch(() => {})
  }, [walletAddress])

  const game = useGame(walletAddress, displayName)
  const { isMuted, toggleMute } = useMusic(game.phase)

  async function handleEditName(name: string) {
    if (!walletAddress || !name.trim()) return
    setDisplayName(name.trim())
    await fetch(`${BACKEND_URL}/api/players/${walletAddress}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: name.trim() }),
    }).catch(() => {})
  }

  function handleCreateGame(_wallet: string, name: string, type: 'public' | 'private', stakeAmount: string, describeRounds: number, impostorCount: number) {
    setDisplayName(name)
    game.createGame(type, stakeAmount, describeRounds, impostorCount)
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

  function renderScreen() {
    if (showProfile) {
      return (
        <Profile
          walletAddress={walletAddress}
          displayName={displayName}
          playerStats={playerStats}
          onEditName={handleEditName}
          onBack={() => setShowProfile(false)}
          onDisconnect={() => { disconnect(); setShowProfile(false) }}
        />
      )
    }

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
          describeRounds={game.describeRounds}
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
      phase === 'chat_buffer' ||
      phase === 'vote_announce' ||
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
          isHost={game.isHost}
          currentTurnWallet={game.currentTurnWallet}
          currentTurnIndex={game.currentTurnIndex}
          describeRoundNumber={game.describeRoundNumber}
          totalDescribeRounds={game.totalDescribeRounds}
          totalInRound={game.totalInRound}
          turnDescriptions={game.turnDescriptions}
          chatBufferSeconds={game.chatBufferSeconds}
          voteTimeoutSeconds={game.voteTimeoutSeconds}
          chatMessages={game.chatMessages}
          typingUsers={game.typingUsers}
          hasVoted={game.hasVoted}
          voteOptions={game.voteOptions}
          voteProgress={game.voteProgress}
          tiebreakPlayers={game.tiebreakPlayers}
          eliminatedPlayer={game.eliminatedPlayer}
          walletAddress={walletAddress}
          error={game.error}
          clearError={game.clearError}
          onSendMessage={game.sendChatMessage}
          onTyping={game.sendTyping}
          onTypingStop={game.sendTypingStop}
          onReaction={game.sendReaction}
          onSubmitDescription={game.submitDescription}
          onSubmitVote={game.submitVote}
        />
      )
    }

    // Default: home
    return (
      <>
        {isFirstTime && walletAddress && phase === 'idle' && (
          <FirstTimeModal
            onConfirm={name => {
              setIsFirstTime(false)
              handleEditName(name)
            }}
          />
        )}
        <Home
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
          connectedWallet={walletAddress}
          displayName={displayName}
          onOpenProfile={() => setShowProfile(true)}
          error={game.error}
          clearError={game.clearError}
        />
      </>
    )
  }

  return (
    <>
      {renderScreen()}
      <button
        className="music-fab"
        onClick={toggleMute}
        title={isMuted ? 'Unmute music' : 'Mute music'}
      >
        {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
    </>
  )
}
