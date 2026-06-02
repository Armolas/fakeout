// ─── Shared with backend ──────────────────────────────────────────────────────

export type GameType = 'public' | 'private'

export type GameStatus =
  | 'lobby'
  | 'active'
  | 'voting'
  | 'tiebreak'
  | 'completed'

export interface LobbyPlayer {
  walletAddress: string
  displayName: string
  isHost: boolean
  disconnected?: boolean
}

export interface PublicPlayer {
  walletAddress: string
  displayName: string
  disconnected?: boolean
}

// ─── Socket payloads (server → client) ───────────────────────────────────────

export interface GameCreatedPayload {
  roomCode: string
  lobby: LobbyState
}

export interface LobbyState {
  roomCode: string
  type: GameType
  stakeAmount: string
  discussionSeconds: number
  hostWalletAddress: string
  players: LobbyPlayer[]
}

export interface GameStartedPayload {
  roomCode: string
  word: string        // actual word for crewmates, 'IMPOSTOR' for impostors
  hint: string        // single-word hint (impostors only; '' for crewmates)
  role: 'crewmate' | 'impostor'
  players: PublicPlayer[]
  totalRounds: number
}

export interface RoundStartedPayload {
  roundNumber: number
  totalRounds: number
  timeoutSeconds: number
}

export interface RoundCluesPayload {
  roundNumber: number
  clues: Array<{
    displayName: string
    walletAddress: string
    clueText: string
  }>
}

export interface VoteStartedPayload {
  players: PublicPlayer[]
  timeoutSeconds: number
  voteRoundNumber: number
}

export interface VoteUpdatedPayload {
  votesIn: number
  totalVoters: number
}

export interface GameResultPayload {
  outcome: 'crewmates_win' | 'impostor_wins'
  eliminatedPlayer: PublicPlayer | null
  impostors: PublicPlayer[]
  word: string
  winners: PublicPlayer[]
  potAmount: string
  perWinnerAmount: string
}

export interface TiebreakPayload {
  tiedPlayers: PublicPlayer[]
  voteRoundNumber: number
  timeoutSeconds: number
}

export interface ClueProgressPayload {
  submitted: number
  total: number
}

// ─── Frontend-only ────────────────────────────────────────────────────────────

export type AppScreen = 'home' | 'lobby' | 'game' | 'results'

export type GamePhase =
  | 'idle'
  | 'lobby'
  | 'word_reveal'
  | 'clue_phase'
  | 'reviewing_clues'
  | 'vote_announce'
  | 'vote_phase'
  | 'tiebreak'
  | 'eliminated_notice'
  | 'results'

export interface PublicLobby {
  roomCode: string
  playerCount: number
  maxPlayers: number
  stakeAmount: string
  createdAt: string
}

export interface ChatMessage {
  id: string
  walletAddress: string
  displayName: string
  text: string
  timestamp: number
  replyToId?: string
  mentionWalletAddresses?: string[]
  reactions?: Record<string, string[]>
}

export interface TypingUser {
  walletAddress: string
  displayName: string
}
