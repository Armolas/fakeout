import { v4 as uuidv4 } from 'uuid'
import { eq, and, sql } from 'drizzle-orm'
import {
  Game,
  GamePlayer,
  GameType,
  GameResolution,
} from '../types'
import { contractService } from '../services/contractService'
import { selectWord } from '../services/wordService'
import { db } from '../db'
import {
  players as playersTable,
  games as gamesTable,
  gamePlayers as gamePlayersTable,
  clues as cluesTable,
  votes as votesTable,
} from '../db/schema'

// ─── Impostor count by player count ──────────────────────────────────────────
function getImpostorCount(playerCount: number): number {
  if (playerCount <= 6) return 1
  if (playerCount <= 8) return 2
  return 3
}

// ─── Room code generator ──────────────────────────────────────────────────────
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no confusing chars
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// ─── In-memory game store ─────────────────────────────────────────────────────
// Games live here during active play. Completed games are flushed to DB.
const activeGames = new Map<string, Game>()          // roomCode → Game
const playerGameMap = new Map<string, string>()      // walletAddress → roomCode

// ─── GameManager ─────────────────────────────────────────────────────────────

export const GameManager = {

  // ── Create a new game ───────────────────────────────────────────────────────
  async createGame(params: {
    walletAddress: string
    displayName: string
    type: GameType
    stakeAmount: string
    discussionSeconds: number
    impostorCount?: number
  }): Promise<Game> {
    // Upsert player
    await db.insert(playersTable)
      .values({ walletAddress: params.walletAddress.toLowerCase(), displayName: params.displayName })
      .onConflictDoUpdate({
        target: playersTable.walletAddress,
        set: { displayName: params.displayName },
      })

    const [playerRow] = await db
      .select({ id: playersTable.id })
      .from(playersTable)
      .where(eq(playersTable.walletAddress, params.walletAddress.toLowerCase()))
    const playerId = playerRow.id

    // Generate unique room code
    let roomCode = generateRoomCode()
    while (activeGames.has(roomCode)) {
      roomCode = generateRoomCode()
    }

    const gameId = uuidv4()

    const hostPlayer: GamePlayer = {
      playerId,
      walletAddress: params.walletAddress.toLowerCase(),
      displayName: params.displayName,
      role: 'crewmate',
      hasSubmittedClue: false,
      isEliminated: false,
      socketId: '',
    }

    const game: Game = {
      id: gameId,
      roomCode,
      type: params.type,
      status: 'lobby',
      word: '',
      hint: '',
      stakeAmount: params.stakeAmount,
      potAmount: '0',
      contractGameId: null,
      currentRound: 0,
      maxRounds: 1,
      discussionSeconds: Math.min(600, Math.max(30, params.discussionSeconds)),
      impostorCount: Math.min(3, Math.max(1, params.impostorCount ?? 1)),
      createdBy: playerId,
      players: { [playerId]: hostPlayer },
      clues: [],
      votes: [],
      createdAt: new Date(),
    }

    activeGames.set(roomCode, game)
    playerGameMap.set(params.walletAddress.toLowerCase(), roomCode)

    // Register on-chain (staked games only — free games need no contract)
    if (BigInt(params.stakeAmount) > 0n) {
      contractService.createGame(gameId, params.stakeAmount)
    }

    // Persist skeleton to DB
    await db.insert(gamesTable).values({
      id: gameId,
      roomCode,
      type: params.type,
      status: 'lobby',
      stakeAmount: params.stakeAmount,
      createdBy: playerId,
    })

    await db.insert(gamePlayersTable).values({ gameId, playerId })

    return game
  },

  // ── Join a game ─────────────────────────────────────────────────────────────
  async joinGame(params: {
    walletAddress: string
    displayName: string
    roomCode?: string       // undefined = join random public game
  }): Promise<Game> {
    let game: Game | undefined

    if (params.roomCode) {
      game = activeGames.get(params.roomCode.toUpperCase())
      if (!game) throw new Error('GAME_NOT_FOUND')
      if (game.type === 'private' && !params.roomCode) throw new Error('ROOM_CODE_REQUIRED')
    } else {
      // Find a public lobby with space
      game = [...activeGames.values()].find(
        g => g.type === 'public' &&
             g.status === 'lobby' &&
             Object.keys(g.players).length < 10
      )
      if (!game) throw new Error('NO_PUBLIC_GAME')
    }

    if (game.status !== 'lobby') throw new Error('GAME_ALREADY_STARTED')
    if (Object.keys(game.players).length >= 10) throw new Error('GAME_FULL')

    // Upsert player
    await db.insert(playersTable)
      .values({ walletAddress: params.walletAddress.toLowerCase(), displayName: params.displayName })
      .onConflictDoUpdate({
        target: playersTable.walletAddress,
        set: { displayName: params.displayName },
      })

    const [playerRow] = await db
      .select({ id: playersTable.id })
      .from(playersTable)
      .where(eq(playersTable.walletAddress, params.walletAddress.toLowerCase()))
    const { id: playerId } = playerRow

    // Check if already in game
    if (game.players[playerId]) throw new Error('ALREADY_IN_GAME')

    // Pull stake on-chain before adding player to state.
    // Throws if player hasn't approved enough G$ — join is rejected.
    if (BigInt(game.stakeAmount) > 0n) {
      await contractService.joinGame(game.id, params.walletAddress.toLowerCase())
    }

    const newPlayer: GamePlayer = {
      playerId,
      walletAddress: params.walletAddress.toLowerCase(),
      displayName: params.displayName,
      role: 'crewmate',
      hasSubmittedClue: false,
      isEliminated: false,
      socketId: '',
    }

    game.players[playerId] = newPlayer
    playerGameMap.set(params.walletAddress.toLowerCase(), game.roomCode)

    await db.insert(gamePlayersTable)
      .values({ gameId: game.id, playerId })
      .onConflictDoNothing()

    return game
  },

  // ── Start game — assign roles and word ──────────────────────────────────────
  async startGame(roomCode: string, hostWalletAddress: string): Promise<Game> {
    const game = activeGames.get(roomCode)
    if (!game) throw new Error('GAME_NOT_FOUND')
    if (game.status !== 'lobby') throw new Error('GAME_ALREADY_STARTED')

    const playerList = Object.values(game.players)
    if (playerList.length < 3) throw new Error('NOT_ENOUGH_PLAYERS')

    const requestedImpostors = game.impostorCount ?? getImpostorCount(playerList.length)
    if (requestedImpostors >= playerList.length) throw new Error('NOT_ENOUGH_PLAYERS_FOR_IMPOSTORS')

    // Verify host
    const host = playerList.find(
      p => p.walletAddress === hostWalletAddress.toLowerCase()
    )
    if (!host || host.playerId !== game.createdBy) throw new Error('NOT_HOST')

    // Select word
    const wordEntry = selectWord()
    game.word = wordEntry.word
    game.hint = wordEntry.hint

    // Assign impostors randomly
    const impostorCount = requestedImpostors
    const shuffled = [...playerList].sort(() => Math.random() - 0.5)
    const impostorIds = new Set(
      shuffled.slice(0, impostorCount).map(p => p.playerId)
    )

    for (const player of playerList) {
      game.players[player.playerId].role =
        impostorIds.has(player.playerId) ? 'impostor' : 'crewmate'
    }

    game.status = 'active'
    game.currentRound = 1
    game.clues = [{ roundNumber: 1, clues: [] }]

    // Lock the game on-chain (staked games only)
    if (BigInt(game.stakeAmount) > 0n) {
      contractService.startGame(game.id)
    }

    // Persist to DB
    await db.update(gamesTable)
      .set({ status: 'active', word: game.word, hint: game.hint, currentRound: 1 })
      .where(eq(gamesTable.id, game.id))

    for (const player of playerList) {
      await db.update(gamePlayersTable)
        .set({ role: game.players[player.playerId].role })
        .where(and(eq(gamePlayersTable.gameId, game.id), eq(gamePlayersTable.playerId, player.playerId)))
    }

    return game
  },

  // ── Send a chat message during the discussion phase ──────────────────────────
  async sendChatMessage(params: {
    roomCode: string
    walletAddress: string
    text: string
  }): Promise<{ game: Game }> {
    const game = activeGames.get(params.roomCode)
    if (!game) throw new Error('GAME_NOT_FOUND')
    if (game.status !== 'active') throw new Error('NOT_IN_CLUE_PHASE')

    const player = Object.values(game.players).find(
      p => p.walletAddress === params.walletAddress.toLowerCase()
    )
    if (!player) throw new Error('PLAYER_NOT_IN_GAME')
    if (player.isEliminated) throw new Error('PLAYER_ELIMINATED')

    const trimmed = params.text.trim()
    if (!trimmed) throw new Error('EMPTY_MESSAGE')

    const currentRoundClues = game.clues.find(r => r.roundNumber === game.currentRound)
    if (currentRoundClues) {
      currentRoundClues.clues.push({
        playerId: player.playerId,
        displayName: player.displayName,
        clueText: trimmed,
        submittedAt: new Date(),
      })
    }

    await db.insert(cluesTable).values({
      gameId: game.id,
      playerId: player.playerId,
      roundNumber: game.currentRound,
      clueText: trimmed,
    })

    return { game }
  },

  // ── Start a new discussion round after elimination (always active, ignores maxRounds) ───
  startDiscussionRound(roomCode: string): Game {
    const game = activeGames.get(roomCode)
    if (!game) throw new Error('GAME_NOT_FOUND')
    game.currentRound++
    game.status = 'active'
    game.clues.push({ roundNumber: game.currentRound, clues: [] })
    return game
  },

  // ── Advance to voting (single round, always goes to voting) ──────────────────
  advanceRound(roomCode: string): { game: Game; phase: 'next_round' | 'voting' } {
    const game = activeGames.get(roomCode)
    if (!game) throw new Error('GAME_NOT_FOUND')

    if (game.currentRound >= game.maxRounds) {
      // Move to voting
      game.status = 'voting'
      game.votes.push({ roundNumber: 1, votes: [], eliminated: null, isTie: false })
      return { game, phase: 'voting' }
    }

    // Next round
    game.currentRound++
    game.status = 'active'
    game.clues.push({ roundNumber: game.currentRound, clues: [] })
    return { game, phase: 'next_round' }
  },

  // ── Submit a vote ────────────────────────────────────────────────────────────
  async submitVote(params: {
    roomCode: string
    voterWalletAddress: string
    votedForWalletAddress: string
  }): Promise<{ game: Game; voteComplete: boolean }> {
    const game = activeGames.get(params.roomCode)
    if (!game) throw new Error('GAME_NOT_FOUND')
    if (game.status !== 'voting' && game.status !== 'tiebreak') {
      throw new Error('NOT_IN_VOTE_PHASE')
    }

    const voter = Object.values(game.players).find(
      p => p.walletAddress === params.voterWalletAddress.toLowerCase()
    )
    const votedFor = Object.values(game.players).find(
      p => p.walletAddress === params.votedForWalletAddress.toLowerCase()
    )

    if (!voter) throw new Error('VOTER_NOT_FOUND')
    if (!votedFor) throw new Error('VOTED_FOR_NOT_FOUND')
    if (voter.isEliminated) throw new Error('ELIMINATED_PLAYERS_CANNOT_VOTE')

    const currentVoteRound = game.votes[game.votes.length - 1]
    const alreadyVoted = currentVoteRound.votes.find(
      v => v.voterId === voter.playerId
    )
    if (alreadyVoted) throw new Error('ALREADY_VOTED')

    currentVoteRound.votes.push({
      voterId: voter.playerId,
      votedForId: votedFor.playerId,
    })

    // Persist
    await db.insert(votesTable).values({
      gameId: game.id,
      voterId: voter.playerId,
      votedForId: votedFor.playerId,
      voteRound: currentVoteRound.roundNumber,
    })

    // Check if all active non-eliminated players voted
    const eligibleVoters = Object.values(game.players).filter(p => !p.isEliminated)
    const allVoted = eligibleVoters.every(p =>
      currentVoteRound.votes.some(v => v.voterId === p.playerId)
    )

    return { game, voteComplete: allVoted }
  },

  // ── Resolve votes ────────────────────────────────────────────────────────────
  resolveVotes(roomCode: string): {
    game: Game
    result: 'eliminated' | 'tiebreak'
    eliminatedPlayerId?: string
    tiedPlayerIds?: string[]
  } {
    const game = activeGames.get(roomCode)
    if (!game) throw new Error('GAME_NOT_FOUND')

    const currentVoteRound = game.votes[game.votes.length - 1]

    // Tally
    const tally = new Map<string, number>()
    for (const vote of currentVoteRound.votes) {
      tally.set(vote.votedForId, (tally.get(vote.votedForId) || 0) + 1)
    }

    let maxVotes = 0
    let topCandidates: string[] = []

    for (const [playerId, count] of tally.entries()) {
      if (count > maxVotes) {
        maxVotes = count
        topCandidates = [playerId]
      } else if (count === maxVotes) {
        topCandidates.push(playerId)
      }
    }

    // Tie
    if (topCandidates.length > 1) {
      currentVoteRound.isTie = true
      game.status = 'tiebreak'

      // Add new tiebreak vote round — only tied players can be voted for
      game.votes.push({
        roundNumber: currentVoteRound.roundNumber + 1,
        votes: [],
        eliminated: null,
        isTie: false,
      })

      return { game, result: 'tiebreak', tiedPlayerIds: topCandidates }
    }

    // Eliminate
    const eliminatedId = topCandidates[0]
    currentVoteRound.eliminated = eliminatedId
    game.players[eliminatedId].isEliminated = true

    return { game, result: 'eliminated', eliminatedPlayerId: eliminatedId }
  },

  // ── Check if game is over after elimination ──────────────────────────────────
  checkWinCondition(roomCode: string): GameResolution | null {
    const game = activeGames.get(roomCode)
    if (!game) throw new Error('GAME_NOT_FOUND')

    const players = Object.values(game.players)
    const impostors = players.filter(p => p.role === 'impostor')
    const crewmates = players.filter(p => p.role === 'crewmate')

    const activeImpostors = impostors.filter(p => !p.isEliminated)
    const activeCrewmates = crewmates.filter(p => !p.isEliminated)

    // All impostors eliminated → crewmates win
    if (activeImpostors.length === 0) {
      return {
        outcome: 'crewmates_win',
        winners: activeCrewmates.map(p => p.walletAddress),
        eliminatedPlayerId: impostors.find(p => p.isEliminated)?.playerId ?? null,
        impostorIds: impostors.map(p => p.playerId),
      }
    }

    // Impostors outnumber or equal crewmates → impostors win
    if (activeImpostors.length >= activeCrewmates.length) {
      return {
        outcome: 'impostor_wins',
        winners: activeImpostors.map(p => p.walletAddress),
        eliminatedPlayerId: null,
        impostorIds: impostors.map(p => p.playerId),
      }
    }

    // Game continues
    return null
  },

  // ── Complete game ────────────────────────────────────────────────────────────
  async completeGame(roomCode: string, resolution: GameResolution): Promise<void> {
    const game = activeGames.get(roomCode)
    if (!game) throw new Error('GAME_NOT_FOUND')

    game.status = 'completed'
    game.completedAt = new Date()

    await db.update(gamesTable)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(gamesTable.id, game.id))

    // Update player stats
    const playerList = Object.values(game.players)
    const stakeWei = BigInt(game.stakeAmount)
    const perWinnerWei = resolution.winners.length > 0
      ? BigInt(game.potAmount) / BigInt(resolution.winners.length)
      : 0n
    for (const player of playerList) {
      const isWinner = resolution.winners.includes(player.walletAddress)
      await db.update(playersTable)
        .set({
          gamesPlayed: sql`${playersTable.gamesPlayed} + 1`,
          gamesWon: isWinner
            ? sql`${playersTable.gamesWon} + 1`
            : playersTable.gamesWon,
          ...(stakeWei > 0n && isWinner && {
            totalAmountWon: sql`(${playersTable.totalAmountWon})::numeric + ${perWinnerWei.toString()}`,
          }),
          ...(stakeWei > 0n && !isWinner && {
            totalAmountLost: sql`(${playersTable.totalAmountLost})::numeric + ${stakeWei.toString()}`,
          }),
        })
        .where(eq(playersTable.id, player.playerId))
    }

    // Clean up in-memory state after a delay (allow clients to read result)
    setTimeout(() => {
      for (const player of playerList) {
        playerGameMap.delete(player.walletAddress)
      }
      activeGames.delete(roomCode)
    }, 30000) // 30s grace period
  },

  // ── Reconnect player socket ──────────────────────────────────────────────────
  reconnectPlayer(walletAddress: string, socketId: string): Game | null {
    const roomCode = playerGameMap.get(walletAddress.toLowerCase())
    if (!roomCode) return null

    const game = activeGames.get(roomCode)
    if (!game) return null

    const player = Object.values(game.players).find(
      p => p.walletAddress === walletAddress.toLowerCase()
    )
    if (player) {
      game.players[player.playerId].socketId = socketId
    }

    return game
  },

  // ── Leave a lobby ────────────────────────────────────────────────────────────
  leaveGame(walletAddress: string, roomCode: string): { game: Game | null; wasHost: boolean } {
    const game = activeGames.get(roomCode.toUpperCase())
    if (!game || game.status !== 'lobby') {
      playerGameMap.delete(walletAddress.toLowerCase())
      return { game: null, wasHost: false }
    }

    const player = Object.values(game.players).find(
      p => p.walletAddress === walletAddress.toLowerCase()
    )
    if (!player) return { game: null, wasHost: false }

    const wasHost = player.playerId === game.createdBy
    delete game.players[player.playerId]
    playerGameMap.delete(walletAddress.toLowerCase())

    // Refund stake on-chain if this was a paid game
    if (BigInt(game.stakeAmount) > 0n) {
      contractService.removePlayer(game.id, walletAddress.toLowerCase())
    }

    // If lobby is now empty, close out on-chain and remove it entirely
    if (Object.keys(game.players).length === 0) {
      if (BigInt(game.stakeAmount) > 0n) {
        contractService.cancelGame(game.id)
      }
      activeGames.delete(roomCode.toUpperCase())
      return { game: null, wasHost }
    }

    // If the host left, transfer host to the next player
    if (wasHost) {
      const nextPlayer = Object.values(game.players)[0]
      game.createdBy = nextPlayer.playerId
    }

    return { game, wasHost }
  },

  // ── Helpers ──────────────────────────────────────────────────────────────────
  getGame: (roomCode: string): Game | undefined =>
    activeGames.get(roomCode.toUpperCase()),

  getGameByWallet: (walletAddress: string): Game | undefined => {
    const roomCode = playerGameMap.get(walletAddress.toLowerCase())
    if (!roomCode) return undefined
    return activeGames.get(roomCode)
  },

  getPublicLobbies: (): Game[] =>
    [...activeGames.values()].filter(
      g => g.type === 'public' && g.status === 'lobby'
    ),

  setPlayerSocket(walletAddress: string, socketId: string): void {
    const roomCode = playerGameMap.get(walletAddress.toLowerCase())
    if (!roomCode) return
    const game = activeGames.get(roomCode)
    if (!game) return
    const player = Object.values(game.players).find(
      p => p.walletAddress === walletAddress.toLowerCase()
    )
    if (player) {
      game.players[player.playerId].socketId = socketId
    }
  },
}
