import { v4 as uuidv4 } from 'uuid'
import {
  Game,
  GamePlayer,
  GameStatus,
  GameType,
  ClueRound,
  VoteRound,
  GameResolution,
} from '../types'
import { selectWord } from '../services/wordService'
import { db } from '../db'

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
  }): Promise<Game> {
    // Upsert player
    await db.query(`
      INSERT INTO players (wallet_address, display_name)
      VALUES ($1, $2)
      ON CONFLICT (wallet_address)
      DO UPDATE SET display_name = EXCLUDED.display_name
    `, [params.walletAddress.toLowerCase(), params.displayName])

    const playerResult = await db.query(
      'SELECT id FROM players WHERE wallet_address = $1',
      [params.walletAddress.toLowerCase()]
    )
    const playerId = playerResult.rows[0].id

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
      role: 'crewmate',     // role assigned at game start
      isFirstGame: false,   // checked at join time
      hasSubmittedClue: false,
      isEliminated: false,
      socketId: '',         // set when socket connects
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
      maxRounds: parseInt(process.env.MAX_ROUNDS || '3'),
      createdBy: playerId,
      players: { [playerId]: hostPlayer },
      clues: [],
      votes: [],
      createdAt: new Date(),
    }

    activeGames.set(roomCode, game)
    playerGameMap.set(params.walletAddress.toLowerCase(), roomCode)

    // Persist skeleton to DB
    await db.query(`
      INSERT INTO games (id, room_code, type, status, stake_amount, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [gameId, roomCode, params.type, 'lobby', params.stakeAmount, playerId])

    await db.query(`
      INSERT INTO game_players (game_id, player_id)
      VALUES ($1, $2)
    `, [gameId, playerId])

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
    await db.query(`
      INSERT INTO players (wallet_address, display_name)
      VALUES ($1, $2)
      ON CONFLICT (wallet_address)
      DO UPDATE SET display_name = EXCLUDED.display_name
    `, [params.walletAddress.toLowerCase(), params.displayName])

    const playerResult = await db.query(
      'SELECT id, games_played FROM players WHERE wallet_address = $1',
      [params.walletAddress.toLowerCase()]
    )
    const { id: playerId, games_played } = playerResult.rows[0]

    // Check if already in game
    if (game.players[playerId]) throw new Error('ALREADY_IN_GAME')

    const isFirstGame = games_played === 0

    const newPlayer: GamePlayer = {
      playerId,
      walletAddress: params.walletAddress.toLowerCase(),
      displayName: params.displayName,
      role: 'crewmate',
      isFirstGame,
      hasSubmittedClue: false,
      isEliminated: false,
      socketId: '',
    }

    game.players[playerId] = newPlayer
    playerGameMap.set(params.walletAddress.toLowerCase(), game.roomCode)

    await db.query(`
      INSERT INTO game_players (game_id, player_id, is_first_game)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, [game.id, playerId, isFirstGame])

    return game
  },

  // ── Start game — assign roles and word ──────────────────────────────────────
  async startGame(roomCode: string, hostWalletAddress: string): Promise<Game> {
    const game = activeGames.get(roomCode)
    if (!game) throw new Error('GAME_NOT_FOUND')
    if (game.status !== 'lobby') throw new Error('GAME_ALREADY_STARTED')

    const playerList = Object.values(game.players)
    if (playerList.length < 3) throw new Error('NOT_ENOUGH_PLAYERS')

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
    const impostorCount = getImpostorCount(playerList.length)
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

    // Persist to DB
    await db.query(`
      UPDATE games
      SET status = 'active', word = $1, hint = $2, current_round = 1
      WHERE id = $3
    `, [game.word, game.hint, game.id])

    for (const player of playerList) {
      await db.query(`
        UPDATE game_players SET role = $1
        WHERE game_id = $2 AND player_id = $3
      `, [game.players[player.playerId].role, game.id, player.playerId])
    }

    return game
  },

  // ── Submit a clue ────────────────────────────────────────────────────────────
  async submitClue(params: {
    roomCode: string
    walletAddress: string
    clueText: string
  }): Promise<{ game: Game; roundComplete: boolean }> {
    const game = activeGames.get(params.roomCode)
    if (!game) throw new Error('GAME_NOT_FOUND')
    if (game.status !== 'active') throw new Error('NOT_IN_CLUE_PHASE')

    const player = Object.values(game.players).find(
      p => p.walletAddress === params.walletAddress.toLowerCase()
    )
    if (!player) throw new Error('PLAYER_NOT_IN_GAME')
    if (player.isEliminated) throw new Error('PLAYER_ELIMINATED')
    if (player.hasSubmittedClue) throw new Error('CLUE_ALREADY_SUBMITTED')

    // Validate: single word only
    const trimmed = params.clueText.trim()
    if (!trimmed || trimmed.includes(' ')) throw new Error('CLUE_MUST_BE_SINGLE_WORD')

    // Add clue
    const currentRoundClues = game.clues.find(r => r.roundNumber === game.currentRound)
    if (!currentRoundClues) throw new Error('ROUND_NOT_FOUND')

    currentRoundClues.clues.push({
      playerId: player.playerId,
      displayName: player.displayName,
      clueText: trimmed,
      submittedAt: new Date(),
    })

    game.players[player.playerId].hasSubmittedClue = true

    // Persist
    await db.query(`
      INSERT INTO clues (game_id, player_id, round_number, clue_text)
      VALUES ($1, $2, $3, $4)
    `, [game.id, player.playerId, game.currentRound, trimmed])

    await db.query(`
      UPDATE game_players SET has_submitted_clue = TRUE
      WHERE game_id = $1 AND player_id = $2
    `, [game.id, player.playerId])

    // Check if all active players have submitted
    const activePlayers = Object.values(game.players).filter(p => !p.isEliminated)
    const allSubmitted = activePlayers.every(p => p.hasSubmittedClue)

    return { game, roundComplete: allSubmitted }
  },

  // ── Advance to next round or voting ─────────────────────────────────────────
  advanceRound(roomCode: string): { game: Game; phase: 'next_round' | 'voting' } {
    const game = activeGames.get(roomCode)
    if (!game) throw new Error('GAME_NOT_FOUND')

    // Reset clue submission flags
    for (const playerId of Object.keys(game.players)) {
      game.players[playerId].hasSubmittedClue = false
    }

    if (game.currentRound >= game.maxRounds) {
      // Move to voting
      game.status = 'voting'
      game.votes.push({ roundNumber: 1, votes: [], eliminated: null, isTie: false })
      return { game, phase: 'voting' }
    }

    // Next round
    game.currentRound++
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
    await db.query(`
      INSERT INTO votes (game_id, voter_id, voted_for_id, vote_round)
      VALUES ($1, $2, $3, $4)
    `, [game.id, voter.playerId, votedFor.playerId, currentVoteRound.roundNumber])

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

    await db.query(`
      UPDATE games
      SET status = 'completed', completed_at = NOW()
      WHERE id = $1
    `, [game.id])

    // Update player stats
    const players = Object.values(game.players)
    for (const player of players) {
      const isWinner = resolution.winners.includes(player.walletAddress)
      await db.query(`
        UPDATE players
        SET games_played = games_played + 1,
            games_won = games_won + $1
        WHERE id = $2
      `, [isWinner ? 1 : 0, player.playerId])
    }

    // Clean up in-memory state after a delay (allow clients to read result)
    setTimeout(() => {
      for (const player of players) {
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

  // ── Helpers ──────────────────────────────────────────────────────────────────
  getGame: (roomCode: string): Game | undefined =>
    activeGames.get(roomCode.toUpperCase()),

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
