import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type {
  GamePhase,
  GameResultPayload,
  LobbyPlayer,
  LobbyState,
  PublicPlayer,
  RoundCluesPayload,
  TiebreakPayload,
  VoteStartedPayload,
} from '../types'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'

// ─── State shape ──────────────────────────────────────────────────────────────

interface GameState {
  phase: GamePhase
  connected: boolean
  error: string | null

  // Lobby
  roomCode: string
  stakeAmount: string
  lobbyPlayers: LobbyPlayer[]
  hostWalletAddress: string

  // Active game
  role: 'crewmate' | 'impostor' | null
  word: string
  hint: string
  players: PublicPlayer[]
  totalRounds: number
  currentRound: number

  // Clue phase
  hasSubmittedClue: boolean
  clueProgress: { submitted: number; total: number } | null
  roundClues: RoundCluesPayload | null
  roundTimeoutSeconds: number
  chatClues: Array<{ walletAddress: string; displayName: string; clueText: string }>

  // Vote phase
  hasVoted: boolean
  voteOptions: PublicPlayer[]
  voteProgress: { votesIn: number; totalVoters: number } | null
  voteTimeoutSeconds: number
  tiebreakPlayers: PublicPlayer[] | null

  // Eliminated notice
  eliminatedPlayer: PublicPlayer | null

  // Result
  result: GameResultPayload | null
}

const INITIAL_STATE: GameState = {
  phase: 'idle',
  connected: false,
  error: null,
  roomCode: '',
  stakeAmount: '0',
  lobbyPlayers: [],
  hostWalletAddress: '',
  role: null,
  word: '',
  hint: '',
  players: [],
  totalRounds: 3,
  currentRound: 1,
  hasSubmittedClue: false,
  clueProgress: null,
  roundClues: null,
  roundTimeoutSeconds: 60,
  chatClues: [],
  hasVoted: false,
  voteOptions: [],
  voteProgress: null,
  voteTimeoutSeconds: 60,
  tiebreakPlayers: null,
  eliminatedPlayer: null,
  result: null,
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGame(walletAddress: string, displayName: string) {
  const [state, setState] = useState<GameState>(INITIAL_STATE)
  const socketRef = useRef<Socket | null>(null)
  const walletRef = useRef(walletAddress)
  walletRef.current = walletAddress
  const stateRef = useRef(state)
  stateRef.current = state

  function patch(updates: Partial<GameState>) {
    setState(prev => ({ ...prev, ...updates }))
  }

  // ── Connect socket ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!walletAddress) return

    const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      patch({ connected: true, error: null })
      // Auto-rejoin if we were mid-game when the connection dropped
      const { roomCode, phase } = stateRef.current
      if (roomCode && phase !== 'idle' && phase !== 'results') {
        socket.emit('game:rejoin', { walletAddress: walletRef.current })
      }
    })
    socket.on('disconnect', () => patch({ connected: false }))
    socket.on('connect_error', () =>
      patch({ error: 'Cannot reach server. Check your connection.' })
    )

    // ── Lobby events ─────────────────────────────────────────────────────────
    socket.on('game:created', ({ roomCode, lobby }: { roomCode: string; lobby: LobbyState }) => {
      patch({
        phase: 'lobby',
        roomCode,
        stakeAmount: lobby.stakeAmount,
        lobbyPlayers: lobby.players,
        hostWalletAddress: lobby.hostWalletAddress,
        error: null,
      })
    })

    socket.on('game:joined', ({ roomCode, lobby }: { roomCode: string; lobby: LobbyState }) => {
      patch({
        phase: 'lobby',
        roomCode,
        stakeAmount: lobby.stakeAmount,
        lobbyPlayers: lobby.players,
        hostWalletAddress: lobby.hostWalletAddress,
        error: null,
      })
    })

    socket.on('lobby:updated', (lobby: LobbyState) => {
      patch({
        lobbyPlayers: lobby.players,
        hostWalletAddress: lobby.hostWalletAddress,
        stakeAmount: lobby.stakeAmount,
      })
    })

    socket.on('game:rejoined', (data: {
      roomCode: string
      status: string
      currentRound: number
      maxRounds: number
      word: string
      hint: string
      role: 'crewmate' | 'impostor'
      clues: unknown[]
      players: Array<{ walletAddress: string; displayName: string }>
    }) => {
      const phase: GamePhase =
        data.status === 'lobby' ? 'lobby'
        : data.status === 'active' ? 'clue_phase'
        : data.status === 'voting' || data.status === 'tiebreak' ? 'vote_phase'
        : data.status === 'completed' ? 'results'
        : 'lobby'

      patch({
        phase,
        roomCode: data.roomCode,
        word: data.word,
        hint: data.hint,
        role: data.role,
        players: data.players,
        currentRound: data.currentRound,
        totalRounds: data.maxRounds,
      })
    })

    // ── Game started ──────────────────────────────────────────────────────────
    socket.on('game:started', (data: {
      roomCode: string
      word: string
      hint: string
      role: 'crewmate' | 'impostor'
      players: PublicPlayer[]
      totalRounds: number
    }) => {
      patch({
        phase: 'word_reveal',
        word: data.word,
        hint: data.hint,
        role: data.role,
        players: data.players,
        totalRounds: data.totalRounds,
        hasSubmittedClue: false,
        clueProgress: null,
        roundClues: null,
        chatClues: [],
        hasVoted: false,
        voteOptions: [],
        voteProgress: null,
        tiebreakPlayers: null,
        eliminatedPlayer: null,
        result: null,
      })
    })

    // ── Round events ──────────────────────────────────────────────────────────
    socket.on('round:started', (data: { roundNumber: number; totalRounds: number; timeoutSeconds: number }) => {
      patch({
        phase: 'clue_phase',
        currentRound: data.roundNumber,
        totalRounds: data.totalRounds,
        roundTimeoutSeconds: data.timeoutSeconds,
        hasSubmittedClue: false,
        clueProgress: null,
        roundClues: null,
        chatClues: [],
      })
    })

    socket.on('clue:accepted', () => {
      patch({ hasSubmittedClue: true })
    })

    socket.on('clue:progress', (data: { submitted: number; total: number }) => {
      patch({ clueProgress: data })
    })

    socket.on('clue:broadcast', (data: { walletAddress: string; displayName: string; clueText: string }) => {
      setState(prev => ({ ...prev, chatClues: [...prev.chatClues, data] }))
    })

    socket.on('round:clues', (data: RoundCluesPayload) => {
      patch({ phase: 'reviewing_clues', roundClues: data })
    })

    // ── Vote events ───────────────────────────────────────────────────────────
    socket.on('vote:started', (data: VoteStartedPayload) => {
      patch({
        phase: 'vote_phase',
        voteOptions: data.players,
        voteTimeoutSeconds: data.timeoutSeconds,
        hasVoted: false,
        voteProgress: null,
        tiebreakPlayers: null,
      })
    })

    socket.on('vote:accepted', () => {
      patch({ hasVoted: true })
    })

    socket.on('vote:updated', (data: { votesIn: number; totalVoters: number }) => {
      patch({ voteProgress: data })
    })

    socket.on('game:tiebreak', (data: TiebreakPayload) => {
      patch({
        phase: 'tiebreak',
        tiebreakPlayers: data.tiedPlayers,
        voteOptions: data.tiedPlayers,
        voteTimeoutSeconds: data.timeoutSeconds,
        hasVoted: false,
        voteProgress: null,
      })
    })

    socket.on('player:disconnected', (data: { walletAddress: string }) => {
      setState(prev => ({
        ...prev,
        lobbyPlayers: prev.lobbyPlayers.map(p =>
          p.walletAddress === data.walletAddress ? { ...p, disconnected: true } : p
        ),
        players: prev.players.map(p =>
          p.walletAddress === data.walletAddress ? { ...p, disconnected: true } : p
        ),
      }))
    })

    socket.on('player:removed', (data: { walletAddress: string }) => {
      setState(prev => ({
        ...prev,
        lobbyPlayers: prev.lobbyPlayers.filter(p => p.walletAddress !== data.walletAddress),
        players: prev.players.filter(p => p.walletAddress !== data.walletAddress),
      }))
    })

    socket.on('player:reconnected', (data: { walletAddress: string }) => {
      setState(prev => ({
        ...prev,
        lobbyPlayers: prev.lobbyPlayers.map(p =>
          p.walletAddress === data.walletAddress ? { ...p, disconnected: false } : p
        ),
        players: prev.players.map(p =>
          p.walletAddress === data.walletAddress ? { ...p, disconnected: false } : p
        ),
      }))
    })

    socket.on('player:eliminated', (data: PublicPlayer) => {
      patch({
        phase: 'eliminated_notice',
        eliminatedPlayer: data,
        players: state.players.filter(p => p.walletAddress !== data.walletAddress),
      })
    })

    // ── Game result ───────────────────────────────────────────────────────────
    socket.on('game:result', (data: GameResultPayload) => {
      patch({ phase: 'results', result: data })
    })

    // ── Errors ────────────────────────────────────────────────────────────────
    socket.on('error', (data: { code: string; message: string }) => {
      patch({ error: data.message })
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress])

  // ── Actions ────────────────────────────────────────────────────────────────

  const createGame = useCallback((type: 'public' | 'private', stakeAmount: string) => {
    patch({ error: null })
    socketRef.current?.emit('game:create', {
      walletAddress: walletRef.current,
      displayName,
      type,
      stakeAmount,
    })
  }, [displayName])

  const joinGame = useCallback((roomCode?: string) => {
    patch({ error: null })
    socketRef.current?.emit('game:join', {
      walletAddress: walletRef.current,
      displayName,
      roomCode,
    })
  }, [displayName])

  const rejoinGame = useCallback((roomCode: string) => {
    socketRef.current?.emit('game:rejoin', {
      walletAddress: walletRef.current,
      roomCode,
    })
  }, [])

  const startGame = useCallback(() => {
    socketRef.current?.emit('game:start', {
      roomCode: state.roomCode,
      hostWalletAddress: walletRef.current,
    })
  }, [state.roomCode])

  const submitClue = useCallback((clueText: string) => {
    patch({ error: null })
    socketRef.current?.emit('clue:submit', {
      roomCode: state.roomCode,
      walletAddress: walletRef.current,
      clueText,
    })
  }, [state.roomCode])

  const submitVote = useCallback((votedForWalletAddress: string) => {
    patch({ error: null })
    socketRef.current?.emit('vote:submit', {
      roomCode: state.roomCode,
      voterWalletAddress: walletRef.current,
      votedForWalletAddress,
    })
  }, [state.roomCode])

  const clearError = useCallback(() => patch({ error: null }), [])

  const resetGame = useCallback(() => {
    if (state.roomCode && state.phase === 'lobby') {
      socketRef.current?.emit('game:leave', {
        walletAddress: walletRef.current,
        roomCode: state.roomCode,
      })
    }
    setState(INITIAL_STATE)
  }, [state.roomCode, state.phase])

  return {
    ...state,
    isHost: state.hostWalletAddress?.toLowerCase() === walletAddress?.toLowerCase(),
    createGame,
    joinGame,
    rejoinGame,
    startGame,
    submitClue,
    submitVote,
    clearError,
    resetGame,
  }
}
