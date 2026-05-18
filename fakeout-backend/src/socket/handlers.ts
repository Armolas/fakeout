import { Server, Socket } from 'socket.io'
import { GameManager } from '../game/GameManager'
import {
  CreateGamePayload,
  JoinGamePayload,
  StartGamePayload,
  SubmitCluePayload,
  SubmitVotePayload,
  RejoinGamePayload,
  Game,
  GamePlayer,
} from '../types'

const CLUE_TIMEOUT = parseInt(process.env.CLUE_TIMEOUT_SECONDS || '60') * 1000
const VOTE_TIMEOUT = parseInt(process.env.VOTE_TIMEOUT_SECONDS || '60') * 1000

// Track round timers so we can clear them
const roundTimers = new Map<string, NodeJS.Timeout>()

// socket.id → walletAddress (for disconnect lookup)
const socketWalletMap = new Map<string, string>()
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
          timeoutSeconds: CLUE_TIMEOUT / 1000,
        })

        // Auto-advance if clue timeout expires
        setRoundTimer(io, game.roomCode, 1)
      }, 3000) // 3s buffer after word reveal

      if (game.type === 'public') {
        io.emit('lobby:list_updated', GameManager.getPublicLobbies().map(serializeLobby))
      }
    } catch (err: any) {
      socket.emit('error', { code: err.message, message: err.message })
    }
  })

  // ── clue:submit ─────────────────────────────────────────────────────────────
  socket.on('clue:submit', async (payload: SubmitCluePayload) => {
    try {
      const { game, roundComplete } = await GameManager.submitClue({
        roomCode: payload.roomCode,
        walletAddress: payload.walletAddress,
        clueText: payload.clueText,
      })

      // Acknowledge to submitter
      socket.emit('clue:accepted', { clueText: payload.clueText })

      // Broadcast live submission count (not the clue itself yet)
      const activePlayers = Object.values(game.players).filter(p => !p.isEliminated)
      const submitted = activePlayers.filter(p => p.hasSubmittedClue).length

      io.to(payload.roomCode).emit('clue:progress', {
        submitted,
        total: activePlayers.length,
      })

      if (roundComplete) {
        clearTimer(`${payload.roomCode}:round:${game.currentRound}`)
        handleRoundComplete(io, game.roomCode)
      }
    } catch (err: any) {
      socket.emit('error', { code: err.message, message: err.message })
    }
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

  // Reveal all clues for this round
  const currentRoundClues = game.clues.find(r => r.roundNumber === game.currentRound)
  io.to(roomCode).emit('round:clues', {
    roundNumber: game.currentRound,
    clues: currentRoundClues?.clues.map(c => ({
      displayName: c.displayName,
      walletAddress: Object.values(game.players).find(
        p => p.playerId === c.playerId
      )?.walletAddress,
      clueText: c.clueText,
    })) ?? [],
  })

  // Wait 5s for players to read clues, then advance
  setTimeout(() => {
    const { phase } = GameManager.advanceRound(roomCode)

    if (phase === 'next_round') {
      const updatedGame = GameManager.getGame(roomCode)!
      io.to(roomCode).emit('round:started', {
        roundNumber: updatedGame.currentRound,
        totalRounds: updatedGame.maxRounds,
        timeoutSeconds: CLUE_TIMEOUT / 1000,
      })
      setRoundTimer(io, roomCode, updatedGame.currentRound)
    } else {
      // Voting phase
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
  }, 5000)
}

// ─── Vote complete handler ────────────────────────────────────────────────────
function handleVoteComplete(io: Server, roomCode: string) {
  const resolution = GameManager.resolveVotes(roomCode)
  const game = GameManager.getGame(roomCode)
  if (!game) return

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
    const { game: updatedGame } = GameManager.advanceRound(roomCode)
    // Actually we go straight to new clue round after an elimination
    io.to(roomCode).emit('player:eliminated', {
      walletAddress: game.players[resolution.eliminatedPlayerId!].walletAddress,
      displayName: game.players[resolution.eliminatedPlayerId!].displayName,
    })

    setTimeout(() => {
      io.to(roomCode).emit('round:started', {
        roundNumber: updatedGame.currentRound,
        totalRounds: updatedGame.maxRounds,
        timeoutSeconds: CLUE_TIMEOUT / 1000,
      })
      setRoundTimer(io, roomCode, updatedGame.currentRound)
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

  // TODO: call smart contract distributeRewards() here
  // contractService.distributeRewards(game.contractGameId, winResolution.winners)

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

function setRoundTimer(io: Server, roomCode: string, roundNumber: number) {
  clearTimer(`${roomCode}:round:${roundNumber}`)
  const timer = setTimeout(() => {
    // Force-advance even if not everyone submitted
    const game = GameManager.getGame(roomCode)
    if (!game || game.status !== 'active') return
    handleRoundComplete(io, roomCode)
  }, CLUE_TIMEOUT)
  roundTimers.set(`${roomCode}:round:${roundNumber}`, timer)
}

function setVoteTimer(io: Server, roomCode: string) {
  clearTimer(`${roomCode}:vote`)
  const timer = setTimeout(() => {
    const game = GameManager.getGame(roomCode)
    if (!game) return
    if (game.status !== 'voting' && game.status !== 'tiebreak') return
    handleVoteComplete(io, roomCode)
  }, VOTE_TIMEOUT)
  roundTimers.set(`${roomCode}:vote`, timer)
}
