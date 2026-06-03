// ─── Player ───────────────────────────────────────────────────────────────────

export interface Player {
  id: string
  walletAddress: string
  displayName: string
  gamesPlayed: number
  gamesWon: number
  createdAt: Date
}

// ─── Word Bank ────────────────────────────────────────────────────────────────

export type Category =
  | 'animals'
  | 'food'
  | 'sports'
  | 'places'
  | 'objects'
  | 'professions'
  | 'nature'
  | 'technology'
  | 'movies'
  | 'music'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface WordEntry {
  word: string
  hint: string // single word only
  category: Category
  difficulty: Difficulty
}

// ─── Game ─────────────────────────────────────────────────────────────────────

export type GameType = 'public' | 'private'

export type GameStatus =
  | 'lobby'       // waiting for players
  | 'active'      // clue rounds in progress
  | 'voting'      // vote phase
  | 'tiebreak'    // sudden death round
  | 'completed'   // game over

export interface GamePlayer {
  playerId: string
  walletAddress: string
  displayName: string
  role: 'crewmate' | 'impostor'
  hasSubmittedClue: boolean
  isEliminated: boolean
  socketId: string
}

export interface Game {
  id: string
  roomCode: string
  type: GameType
  status: GameStatus
  word: string
  hint: string
  stakeAmount: string      // in wei
  potAmount: string        // in wei
  contractGameId: string | null
  currentRound: number
  maxRounds: number
  discussionSeconds: number
  impostorCount: number
  createdBy: string        // playerId
  players: Record<string, GamePlayer>  // keyed by playerId
  clues: ClueRound[]
  votes: VoteRound[]
  createdAt: Date
  completedAt?: Date
}

// ─── Rounds ───────────────────────────────────────────────────────────────────

export interface Clue {
  playerId: string
  displayName: string
  clueText: string
  submittedAt: Date
}

export interface ClueRound {
  roundNumber: number
  clues: Clue[]
  completedAt?: Date
}

export interface Vote {
  voterId: string
  votedForId: string
}

export interface VoteRound {
  roundNumber: number
  votes: Vote[]
  eliminated: string | null   // playerId
  isTie: boolean
  completedAt?: Date
}

// ─── Socket Event Payloads ────────────────────────────────────────────────────

// Client → Server
export interface CreateGamePayload {
  walletAddress: string
  displayName: string
  type: GameType
  stakeAmount: string
  discussionSeconds: number
  impostorCount?: number
}

export interface JoinGamePayload {
  walletAddress: string
  displayName: string
  roomCode?: string   // required for private games
}

export interface RejoinGamePayload {
  walletAddress: string
  roomCode: string
}

export interface StartGamePayload {
  roomCode: string
  hostWalletAddress: string
}

export interface ChatMessagePayload {
  roomCode: string
  walletAddress: string
  text: string
  replyToId?: string
  mentionWalletAddresses?: string[]
}

export interface ChatTypingPayload {
  roomCode: string
  walletAddress: string
}

export interface ChatReactionPayload {
  roomCode: string
  messageId: string
  walletAddress: string
  emoji: string
}

export interface SubmitVotePayload {
  roomCode: string
  voterWalletAddress: string
  votedForWalletAddress: string
}

// Server → Client
export interface LobbyUpdatedPayload {
  players: LobbyPlayer[]
  hostWalletAddress: string
  roomCode: string
  type: GameType
  stakeAmount: string
}

export interface LobbyPlayer {
  walletAddress: string
  displayName: string
  isHost: boolean
}

export interface GameStartedPayload {
  roomCode: string
  word: string          // actual word for crewmates, 'IMPOSTOR' for impostors
  hint: string          // single word hint (for impostors only, crewmates get empty string)
  role: 'crewmate' | 'impostor'
  players: PublicPlayer[]
  totalRounds: number
}

export interface PublicPlayer {
  walletAddress: string
  displayName: string
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
  outcome: 'crewmates_win' | 'impostor_wins' | 'draw'
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

export interface PlayerDisconnectedPayload {
  walletAddress: string
  displayName: string
}

export interface ErrorPayload {
  code: string
  message: string
}

// ─── Game Resolution ──────────────────────────────────────────────────────────

export interface GameResolution {
  outcome: 'crewmates_win' | 'impostor_wins' | 'draw'
  winners: string[]        // walletAddresses
  eliminatedPlayerId: string | null
  impostorIds: string[]
}
