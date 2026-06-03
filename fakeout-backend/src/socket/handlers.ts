import { Server, Socket } from 'socket.io'
import { GameManager } from '../game/GameManager'
import { contractService } from '../services/contractService'
import {
  CreateGamePayload,
  JoinGamePayload,
  StartGamePayload,
  ChatMessagePayload,
  ChatTypingPayload,
  ChatReactionPayload,
  SubmitVotePayload,
  RejoinGamePayload,
  Game,
} from '../types'

const CLUE_TIMEOUT = parseInt(process.env.CLUE_TIMEOUT_SECONDS || '60') * 1000
const VOTE_TIMEOUT = parseInt(process.env.VOTE_TIMEOUT_SECONDS || '60') * 1000

// Track round timers so we can clear them
const roundTimers = new Map<string, NodeJS.Timeout>()
// Track phase end times for reconnecting players (roomCode → unix ms)
const phaseEndTimes = new Map<string, number>()

// socket.id → walletAddress (for disconnect lookup)
const socketWalletMap = new Map<string, string>()
// roomCode:messageId → emoji → Set<walletAddress>
const messageReactions = new Map<string, Map<string, Set<string>>>()

function reactionKey(roomCode: string, messageId: string) {
  return `${roomCode}:${messageId}`
}

function serializeReactions(roomCode: string, messageId: string): Record<string, string[]> {
  const map = messageReactions.get(reactionKey(roomCode, messageId))
  if (!map) return {}
  const out: Record<string, string[]> = {}
  for (const [emoji, wallets] of map.entries()) {
    out[emoji] = [...wallets]
  }
  return out
}
// walletAddress → reconnect timer
const reconnectTimers = new Map<string, NodeJS.Timeout>()

const RECONNECT_TIMEOUT_MS = 30_000

function clearTimer(key: string) {
  const t = roundTimers.get(key)
  if (t) {
    clearTimeout(t)
    roundTimers.delete(key)
  }
}

// ─── Serialize game for client ────────────────────────────────────────────────
// Never send roles/word in bulk — those go in targeted private events
function serializeLobby(game: Game) {
  return {
    roomCode: game.roomCode,
    type: game.type,
    stakeAmount: game.stakeAmount,
    discussionSeconds: game.discussionSeconds,
    hostWalletAddress: Object.values(game.players).find(
      p => p.playerId === game.createdBy
    )?.walletAddress,
    players: Object.values(game.players).map(p => ({
      walletAddress: p.walletAddress,
      displayName: p.displayName,
      isHost: p.playerId === game.createdBy,
    })),
  }
}

// ─── Register all socket events ───────────────────────────────────────────────
export function registerSocketHandlers(io: Server, socket: Socket) {

  // ── game:create ─────────────────────────────────────────────────────────────
  socket.on('game:create', async (payload: CreateGamePayload) => {
    try {
      const game = await GameManager.createGame({
        walletAddress: payload.walletAddress,
        displayName: payload.displayName,
        type: payload.type,
        stakeAmount: payload.stakeAmount,
        discussionSeconds: payload.discussionSeconds ?? 120,
        impostorCount: payload.impostorCount ?? 1,
      })

      GameManager.setPlayerSocket(payload.walletAddress, socket.id)
      socketWalletMap.set(socket.id, payload.walletAddress.toLowerCase())
      socket.join(game.roomCode)

      socket.emit('game:created', {
        roomCode: game.roomCode,
        lobby: serializeLobby(game),
      })

      if (game.type === 'public') {
        io.emit('lobby:list_updated', GameManager.getPublicLobbies().map(serializeLobby))
      }
    } catch (err: any) {
      socket.emit('error', { code: err.message, message: err.message })
    }
  })

  // ── game:join ───────────────────────────────────────────────────────────────
  socket.on('game:join', async (payload: JoinGamePayload) => {
    try {
      const game = await GameManager.joinGame({
        walletAddress: payload.walletAddress,
        displayName: payload.displayName,
        roomCode: payload.roomCode,
      })

      GameManager.setPlayerSocket(payload.walletAddress, socket.id)
      socketWalletMap.set(socket.id, payload.walletAddress.toLowerCase())
      socket.join(game.roomCode)

      // Tell everyone in the lobby
      io.to(game.roomCode).emit('lobby:updated', serializeLobby(game))

      // Confirm to the joining player
      socket.emit('game:joined', {
        roomCode: game.roomCode,
        lobby: serializeLobby(game),
      })

      if (game.type === 'public') {
        io.emit('lobby:list_updated', GameManager.getPublicLobbies().map(serializeLobby))
      }
    } catch (err: any) {
      socket.emit('error', { code: err.message, message: err.message })
    }
  })

  // ── game:rejoin ─────────────────────────────────────────────────────────────
  socket.on('game:rejoin', (payload: RejoinGamePayload) => {
    try {
      const wallet = payload.walletAddress.toLowerCase()

      // Cancel any pending disconnect timeout
      const existing = reconnectTimers.get(wallet)
      if (existing) {
        clearTimeout(existing)
        reconnectTimers.delete(wallet)
      }

      const game = GameManager.reconnectPlayer(wallet, socket.id)
      if (!game) {
        socket.emit('error', { code: 'GAME_NOT_FOUND', message: 'No active game found' })
        return
      }

      socketWalletMap.set(socket.id, wallet)
      socket.join(game.roomCode)
      const player = Object.values(game.players).find(
        p => p.walletAddress === payload.walletAddress.toLowerCase()
      )

      const inVotePhase = game.status === 'voting' || game.status === 'tiebreak'

      // Send them current game state privately
      socket.emit('game:rejoined', {
        roomCode: game.roomCode,
        status: game.status,
        currentRound: game.currentRound,
        maxRounds: game.maxRounds,
        word: player?.role === 'crewmate' ? game.word : 'IMPOSTOR',
        hint: player?.role === 'impostor' ? game.hint : '',
        role: player?.role,
        clues: game.clues,
        players: Object.values(game.players).map(p => ({
          walletAddress: p.walletAddress,
          displayName: p.displayName,
          isEliminated: p.isEliminated,
          hasSubmittedClue: p.hasSubmittedClue,
        })),
        voteOptions: inVotePhase
          ? Object.values(game.players)
              .filter(p => !p.isEliminated)
              .map(p => ({ walletAddress: p.walletAddress, displayName: p.displayName }))
          : undefined,
        voteTimeoutSeconds: VOTE_TIMEOUT / 1000,
        phaseEndsAt: phaseEndTimes.get(game.roomCode) ?? null,
      })

      io.to(game.roomCode).emit('player:reconnected', {
        walletAddress: payload.walletAddress,
        displayName: player?.displayName,
      })
    } catch (err: any) {
      socket.emit('error', { code: err.message, message: err.message })
    }
  })

  // ── game:start ──────────────────────────────────────────────────────────────
  socket.on('game:start', async (payload: StartGamePayload) => {
    try {
      const game = await GameManager.startGame(payload.roomCode, payload.hostWalletAddress)

      // Send each player their private word assignment
      for (const player of Object.values(game.players)) {
        const targetSocket = io.sockets.sockets.get(player.socketId)
        if (!targetSocket) continue

        const isImpostor = player.role === 'impostor'

        targetSocket.emit('game:started', {
          roomCode: game.roomCode,
          word: isImpostor ? 'IMPOSTOR' : game.word,
          hint: isImpostor ? game.hint : '',
          role: player.role,
          players: Object.values(game.players).map(p => ({
            walletAddress: p.walletAddress,
            displayName: p.displayName,
          })),
          totalRounds: game.maxRounds,
        })
      }

      // Start round 1
      setTimeout(() => {
        io.to(game.roomCode).emit('round:started', {
          roundNumber: 1,
          totalRounds: game.maxRounds,
          timeoutSeconds: game.discussionSeconds,
        })

        // Auto-advance when discussion timer expires
        setRoundTimer(io, game.roomCode, 1, game.discussionSeconds * 1000)
      }, 3000) // 3s buffer after word reveal

      if (game.type === 'public') {
        io.emit('lobby:list_updated', GameManager.getPublicLobbies().map(serializeLobby))
      }
    } catch (err: any) {
      socket.emit('error', { code: err.message, message: err.message })
    }
  })

  // ── chat:message ─────────────────────────────────────────────────────────────
  socket.on('chat:message', async (payload: ChatMessagePayload) => {
    try {
      const { game } = await GameManager.sendChatMessage({
        roomCode: payload.roomCode,
        walletAddress: payload.walletAddress,
        text: payload.text,
      })

      const sender = Object.values(game.players).find(
        p => p.walletAddress === payload.walletAddress.toLowerCase()
      )

      const messageId = crypto.randomUUID()
      messageReactions.set(reactionKey(payload.roomCode, messageId), new Map())

      io.to(payload.roomCode).emit('chat:message', {
        id: messageId,
        walletAddress: payload.walletAddress.toLowerCase(),
        displayName: sender!.displayName,
        text: payload.text.trim(),
        timestamp: Date.now(),
        replyToId: payload.replyToId,
        mentionWalletAddresses: payload.mentionWalletAddresses ?? [],
        reactions: {},
      })
    } catch (err: any) {
      socket.emit('error', { code: err.message, message: err.message })
    }
  })

  socket.on('chat:typing', (payload: ChatTypingPayload) => {
    const game = GameManager.getGame(payload.roomCode)
    if (!game || game.status !== 'active') return
    const player = Object.values(game.players).find(
      p => p.walletAddress === payload.walletAddress.toLowerCase()
    )
    if (!player) return
    socket.to(payload.roomCode).emit('chat:typing', {
      walletAddress: payload.walletAddress.toLowerCase(),
      displayName: player.displayName,
    })
  })

  socket.on('chat:typing_stop', (payload: ChatTypingPayload) => {
    socket.to(payload.roomCode).emit('chat:typing_stop', {
      walletAddress: payload.walletAddress.toLowerCase(),
    })
  })

  socket.on('chat:reaction', (payload: ChatReactionPayload) => {
    const allowed = ['👍', '❤️', '😂', '😮', '🔥']
    if (!allowed.includes(payload.emoji)) return

    const key = reactionKey(payload.roomCode, payload.messageId)
    let map = messageReactions.get(key)
    if (!map) {
      map = new Map()
      messageReactions.set(key, map)
    }

    const wallet = payload.walletAddress.toLowerCase()
    let set = map.get(payload.emoji)
    if (!set) {
      set = new Set()
      map.set(payload.emoji, set)
    }
    if (set.has(wallet)) {
      set.delete(wallet)
      if (set.size === 0) map.delete(payload.emoji)
    } else {
      set.add(wallet)
    }

    io.to(payload.roomCode).emit('chat:reaction', {
      messageId: payload.messageId,
      reactions: serializeReactions(payload.roomCode, payload.messageId),
    })
  })

  // ── vote:submit ─────────────────────────────────────────────────────────────
  socket.on('vote:submit', async (payload: SubmitVotePayload) => {
    try {
      const { game, voteComplete } = await GameManager.submitVote({
        roomCode: payload.roomCode,
        voterWalletAddress: payload.voterWalletAddress,
        votedForWalletAddress: payload.votedForWalletAddress,
      })

      socket.emit('vote:accepted')

      // Broadcast vote count (anonymous — no names)
      const eligibleVoters = Object.values(game.players).filter(p => !p.isEliminated)
      const currentVoteRound = game.votes[game.votes.length - 1]
      io.to(payload.roomCode).emit('vote:updated', {
        votesIn: currentVoteRound.votes.length,
        totalVoters: eligibleVoters.length,
      })

      if (voteComplete) {
        clearTimer(`${payload.roomCode}:vote`)
        handleVoteComplete(io, game.roomCode)
      }
    } catch (err: any) {
      socket.emit('error', { code: err.message, message: err.message })
    }
  })

  // ── game:leave ──────────────────────────────────────────────────────────────
  socket.on('game:leave', (payload: { walletAddress: string; roomCode: string }) => {
    const { game, wasHost } = GameManager.leaveGame(payload.walletAddress, payload.roomCode)
    socket.leave(payload.roomCode)

    if (!game) return // lobby was empty and deleted

    const lobby = serializeLobby(game)
    io.to(payload.roomCode).emit('lobby:updated', lobby)

    if (wasHost) {
      io.to(payload.roomCode).emit('host:changed', {
        newHostWalletAddress: lobby.hostWalletAddress,
      })
    }

    if (game.type === 'public') {
      io.emit('lobby:list_updated', GameManager.getPublicLobbies().map(serializeLobby))
    }
  })

  // ── disconnect ──────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const wallet = socketWalletMap.get(socket.id)
    socketWalletMap.delete(socket.id)
    if (!wallet) return

    const game = GameManager.getGameByWallet(wallet)
    if (!game || game.status === 'completed') return

    io.to(game.roomCode).emit('player:disconnected', { walletAddress: wallet })

    // Give them RECONNECT_TIMEOUT_MS to reconnect before removing from lobby
    const timer = setTimeout(() => {
      reconnectTimers.delete(wallet)
      const current = GameManager.getGame(game.roomCode)
      if (!current) return

      if (current.status === 'lobby') {
        const { game: updated } = GameManager.leaveGame(wallet, game.roomCode)
        io.to(game.roomCode).emit('player:removed', { walletAddress: wallet })
        if (updated) {
          io.to(game.roomCode).emit('lobby:updated', serializeLobby(updated))
          if (updated.type === 'public') {
            io.emit('lobby:list_updated', GameManager.getPublicLobbies().map(serializeLobby))
          }
        }
      } else {
        // Active game — notify but keep them in (they can still rejoin)
        io.to(game.roomCode).emit('player:removed', { walletAddress: wallet })
      }
    }, RECONNECT_TIMEOUT_MS)

    reconnectTimers.set(wallet, timer)
  })
}

// ─── Round complete handler ───────────────────────────────────────────────────
function handleRoundComplete(io: Server, roomCode: string) {
  const game = GameManager.getGame(roomCode)
  if (!game) return

  // Discussion time is over — advance immediately
  const { phase } = GameManager.advanceRound(roomCode)

  if (phase === 'next_round') {
    const updatedGame = GameManager.getGame(roomCode)!
    io.to(roomCode).emit('round:started', {
      roundNumber: updatedGame.currentRound,
      totalRounds: updatedGame.maxRounds,
      timeoutSeconds: updatedGame.discussionSeconds,
    })
    setRoundTimer(io, roomCode, updatedGame.currentRound, updatedGame.discussionSeconds * 1000)
  } else {
    const updatedGame = GameManager.getGame(roomCode)!
    io.to(roomCode).emit('vote:started', {
      players: Object.values(updatedGame.players)
        .filter(p => !p.isEliminated)
        .map(p => ({
          walletAddress: p.walletAddress,
          displayName: p.displayName,
        })),
      timeoutSeconds: VOTE_TIMEOUT / 1000,
      voteRoundNumber: 1,
    })
    setVoteTimer(io, roomCode)
  }
}

// ─── Vote complete handler ────────────────────────────────────────────────────
function handleVoteComplete(io: Server, roomCode: string) {
  const resolution = GameManager.resolveVotes(roomCode)
  const game = GameManager.getGame(roomCode)
  if (!game) return

  if (resolution.result === 'draw') {
    const allPlayers = Object.values(game.players)
    const impostors = allPlayers.filter(p => p.role === 'impostor').map(p => ({
      walletAddress: p.walletAddress,
      displayName: p.displayName,
    }))
    const drawResolution = {
      outcome: 'draw' as const,
      winners: [],
      eliminatedPlayerId: null,
      impostorIds: allPlayers.filter(p => p.role === 'impostor').map(p => p.playerId),
    }
    GameManager.completeGame(roomCode, drawResolution)
    io.to(roomCode).emit('game:result', {
      outcome: 'draw',
      eliminatedPlayer: null,
      impostors,
      word: game.word,
      winners: [],
      potAmount: game.potAmount,
      perWinnerAmount: '0',
    })
    return
  }

  if (resolution.result === 'tiebreak') {
    // Sudden death round
    io.to(roomCode).emit('game:tiebreak', {
      tiedPlayers: resolution.tiedPlayerIds!.map(id => ({
        walletAddress: game.players[id].walletAddress,
        displayName: game.players[id].displayName,
      })),
      voteRoundNumber: game.votes.length,
      timeoutSeconds: VOTE_TIMEOUT / 1000,
    })
    setVoteTimer(io, roomCode)
    return
  }

  // Someone eliminated — check win condition
  const winResolution = GameManager.checkWinCondition(roomCode)

  if (!winResolution) {
    // Game continues — back to clue rounds
    const updatedGame = GameManager.startDiscussionRound(roomCode)
    io.to(roomCode).emit('player:eliminated', {
      walletAddress: game.players[resolution.eliminatedPlayerId!].walletAddress,
      displayName: game.players[resolution.eliminatedPlayerId!].displayName,
    })

    setTimeout(() => {
      io.to(roomCode).emit('round:started', {
        roundNumber: updatedGame.currentRound,
        totalRounds: updatedGame.maxRounds,
        timeoutSeconds: 120,
      })
      setRoundTimer(io, roomCode, updatedGame.currentRound, 120 * 1000)
    }, 4000)
    return
  }

  // Game over
  GameManager.completeGame(roomCode, winResolution)

  const impostors = winResolution.impostorIds.map(id => ({
    walletAddress: game.players[id].walletAddress,
    displayName: game.players[id].displayName,
  }))

  const winners = winResolution.winners.map(addr => {
    const p = Object.values(game.players).find(pl => pl.walletAddress === addr)!
    return { walletAddress: p.walletAddress, displayName: p.displayName }
  })

  // Distribute rewards on-chain (staked games only)
  if (BigInt(game.stakeAmount) > 0n) {
    contractService.distributeRewards(game.id, winResolution.winners)
  }

  io.to(roomCode).emit('game:result', {
    outcome: winResolution.outcome,
    eliminatedPlayer: resolution.eliminatedPlayerId
      ? {
          walletAddress: game.players[resolution.eliminatedPlayerId].walletAddress,
          displayName: game.players[resolution.eliminatedPlayerId].displayName,
        }
      : null,
    impostors,
    word: game.word,
    winners,
    potAmount: game.potAmount,
    perWinnerAmount: winners.length > 0
      ? (BigInt(game.potAmount) / BigInt(winners.length)).toString()
      : '0',
  })
}

// ─── Timers ───────────────────────────────────────────────────────────────────

function setRoundTimer(io: Server, roomCode: string, roundNumber: number, timeoutMs = CLUE_TIMEOUT) {
  clearTimer(`${roomCode}:round:${roundNumber}`)
  phaseEndTimes.set(roomCode, Date.now() + timeoutMs)
  const timer = setTimeout(() => {
    const game = GameManager.getGame(roomCode)
    if (!game || game.status !== 'active') return
    handleRoundComplete(io, roomCode)
  }, timeoutMs)
  roundTimers.set(`${roomCode}:round:${roundNumber}`, timer)
}

function setVoteTimer(io: Server, roomCode: string) {
  clearTimer(`${roomCode}:vote`)
  phaseEndTimes.set(roomCode, Date.now() + VOTE_TIMEOUT)
  const timer = setTimeout(() => {
    const game = GameManager.getGame(roomCode)
    if (!game) return
    if (game.status !== 'voting' && game.status !== 'tiebreak') return
    handleVoteComplete(io, roomCode)
  }, VOTE_TIMEOUT)
  roundTimers.set(`${roomCode}:vote`, timer)
}
