import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type {
  ChatMessage,
  GamePhase,
  GameResultPayload,
  LobbyPlayer,
  LobbyState,
  PublicPlayer,
  TiebreakPayload,
  TypingUser,
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
  discussionSeconds: number
  lobbyPlayers: LobbyPlayer[]
  hostWalletAddress: string

  // Active game
  role: 'crewmate' | 'impostor' | null
  word: string
  hint: string
  players: PublicPlayer[]
  totalRounds: number
  currentRound: number

  // Discussion phase
  roundTimeoutSeconds: number
  chatMessages: ChatMessage[]
  typingUsers: TypingUser[]

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
  discussionSeconds: 120,
  lobbyPlayers: [],
  hostWalletAddress: '',
  role: null,
  word: '',
  hint: '',
  players: [],
  totalRounds: 1,
  currentRound: 1,
  roundTimeoutSeconds: 120,
  chatMessages: [],
  typingUsers: [],
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
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const voteAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const walletRef = useRef(walletAddress)
  walletRef.current = walletAddress
  const stateRef = useRef(state)
  stateRef.current = state

  function patch(updates: Partial<GameState>) {
    setState(prev => ({ ...prev, ...updates }))
  }

  // ── Persist roomCode across page refreshes ─────────────────────────────────
  useEffect(() => {
    if (state.roomCode) {
      sessionStorage.setItem('fakeout_room', state.roomCode)
    } else {
      sessionStorage.removeItem('fakeout_room')
    }
  }, [state.roomCode])

  // ── Connect socket ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!walletAddress) return

    const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      patch({ connected: true, error: null })
      // Auto-rejoin if we were mid-game or in a lobby when the connection dropped
      const { roomCode, phase } = stateRef.current
      const storedRoom = roomCode || sessionStorage.getItem('fakeout_room') || ''
      if (storedRoom && phase !== 'results') {
        socket.emit('game:rejoin', { walletAddress: walletRef.current, roomCode: storedRoom })
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
        discussionSeconds: lobby.discussionSeconds,
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
        discussionSeconds: lobby.discussionSeconds,
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
        discussionSeconds: lobby.discussionSeconds,
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
      voteOptions?: Array<{ walletAddress: string; displayName: string }>
      voteTimeoutSeconds?: number
      phaseEndsAt?: number | null
    }) => {
      const phase: GamePhase =
        data.status === 'lobby' ? 'lobby'
        : data.status === 'active' ? 'clue_phase'
        : data.status === 'voting' || data.status === 'tiebreak' ? 'vote_phase'
        : data.status === 'completed' ? 'results'
        : 'lobby'

      const remainingSeconds = data.phaseEndsAt
        ? Math.max(0, Math.round((data.phaseEndsAt - Date.now()) / 1000))
        : undefined

      patch({
        phase,
        roomCode: data.roomCode,
        word: data.word,
        hint: data.hint,
        role: data.role,
        players: data.players,
        currentRound: data.currentRound,
        totalRounds: data.maxRounds,
        ...(data.voteOptions ? {
          voteOptions: data.voteOptions,
          voteTimeoutSeconds: remainingSeconds ?? data.voteTimeoutSeconds ?? 60,
          hasVoted: false,
          voteProgress: null,
        } : {}),
        ...(remainingSeconds !== undefined && phase === 'clue_phase' ? {
          roundTimeoutSeconds: remainingSeconds,
        } : {}),
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
        chatMessages: [],
        typingUsers: [],
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
        turnDescriptions: [],
        currentTurnWallet: data.firstTurnWalletAddress,
        describeRoundNumber: 1,
        totalDescribeRounds: data.totalDescribeRounds,
        totalInRound: data.totalInRound,
        ...(data.roundNumber === 1 ? { chatMessages: [] } : {}),
        typingUsers: [],
      })
    })

    socket.on('chat:message', (data: ChatMessage) => {
      setState(prev => ({
        ...prev,
        chatMessages: [...prev.chatMessages, data],
        typingUsers: prev.typingUsers.filter(
          t => t.walletAddress !== data.walletAddress.toLowerCase()
        ),
      }))
    })

    socket.on('chat:typing', (data: TypingUser) => {
      const addr = data.walletAddress.toLowerCase()
      if (addr === walletRef.current.toLowerCase()) return

      setState(prev => {
        if (prev.typingUsers.some(t => t.walletAddress === addr)) return prev
        return { ...prev, typingUsers: [...prev.typingUsers, data] }
      })

      const existing = typingTimeoutsRef.current.get(addr)
      if (existing) clearTimeout(existing)
      typingTimeoutsRef.current.set(
        addr,
        setTimeout(() => {
          setState(prev => ({
            ...prev,
            typingUsers: prev.typingUsers.filter(t => t.walletAddress !== addr),
          }))
          typingTimeoutsRef.current.delete(addr)
        }, 4000)
      )
    })

    socket.on('chat:typing_stop', (data: { walletAddress: string }) => {
      const addr = data.walletAddress.toLowerCase()
      const t = typingTimeoutsRef.current.get(addr)
      if (t) clearTimeout(t)
      typingTimeoutsRef.current.delete(addr)
      setState(prev => ({
        ...prev,
        typingUsers: prev.typingUsers.filter(t => t.walletAddress !== addr),
      }))
    })

    socket.on('chat:reaction', (data: { messageId: string; reactions: Record<string, string[]> }) => {
      setState(prev => ({
        ...prev,
        chatMessages: prev.chatMessages.map(m =>
          m.id === data.messageId ? { ...m, reactions: data.reactions } : m
        ),
      }))
    })

    // ── Vote events ───────────────────────────────────────────────────────────
    socket.on('vote:started', (data: VoteStartedPayload) => {
      patch({
        phase: 'vote_announce',
        voteOptions: data.players,
        voteTimeoutSeconds: data.timeoutSeconds,
        hasVoted: false,
        voteProgress: null,
        tiebreakPlayers: null,
      })
      if (voteAnnounceTimerRef.current) clearTimeout(voteAnnounceTimerRef.current)
      voteAnnounceTimerRef.current = setTimeout(() => {
        voteAnnounceTimerRef.current = null
        patch({ phase: 'vote_phase' })
      }, 3000)
    })

    socket.on('vote:accepted', () => {
      patch({ hasVoted: true })
    })

    socket.on('vote:updated', (data: { votesIn: number; totalVoters: number }) => {
      patch({ voteProgress: data })
    })

    socket.on('game:tiebreak', (data: TiebreakPayload) => {
      if (voteAnnounceTimerRef.current) {
        clearTimeout(voteAnnounceTimerRef.current)
        voteAnnounceTimerRef.current = null
      }
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

    socket.on('player:reconnected', (data: { walletAddress: string; displayName: string }) => {
      setState(prev => ({
        ...prev,
        lobbyPlayers: prev.lobbyPlayers.some(p => p.walletAddress === data.walletAddress)
          ? prev.lobbyPlayers.map(p => p.walletAddress === data.walletAddress ? { ...p, disconnected: false } : p)
          : [...prev.lobbyPlayers, { walletAddress: data.walletAddress, displayName: data.displayName, isHost: false, disconnected: false }],
        players: prev.players.some(p => p.walletAddress === data.walletAddress)
          ? prev.players.map(p => p.walletAddress === data.walletAddress ? { ...p, disconnected: false } : p)
          : [...prev.players, { walletAddress: data.walletAddress, displayName: data.displayName, disconnected: false }],
      }))
    })

    socket.on('player:eliminated', (data: PublicPlayer) => {
      setState(prev => ({
        ...prev,
        phase: 'eliminated_notice',
        eliminatedPlayer: data,
        players: prev.players.filter(p => p.walletAddress !== data.walletAddress),
      }))
    })

    // ── Game result ───────────────────────────────────────────────────────────
    socket.on('game:result', (data: GameResultPayload) => {
      if (voteAnnounceTimerRef.current) {
        clearTimeout(voteAnnounceTimerRef.current)
        voteAnnounceTimerRef.current = null
      }
      sessionStorage.removeItem('fakeout_room')
      patch({ phase: 'results', result: data })
    })

    // ── Errors ────────────────────────────────────────────────────────────────
    socket.on('error', (data: { code: string; message: string }) => {
      patch({ error: data.message })
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      if (voteAnnounceTimerRef.current) clearTimeout(voteAnnounceTimerRef.current)
      typingTimeoutsRef.current.forEach(t => clearTimeout(t))
      typingTimeoutsRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress])

  // ── Actions ────────────────────────────────────────────────────────────────

  const createGame = useCallback((type: 'public' | 'private', stakeAmount: string, discussionSeconds: number, impostorCount: number) => {
    patch({ error: null })
    socketRef.current?.emit('game:create', {
      walletAddress: walletRef.current,
      displayName,
      type,
      stakeAmount,
      discussionSeconds,
      impostorCount,
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

  const sendChatMessage = useCallback((
    text: string,
    opts?: { replyToId?: string; mentionWalletAddresses?: string[] }
  ) => {
    patch({ error: null })
    socketRef.current?.emit('chat:message', {
      roomCode: state.roomCode,
      walletAddress: walletRef.current,
      text,
      replyToId: opts?.replyToId,
      mentionWalletAddresses: opts?.mentionWalletAddresses,
    })
  }, [state.roomCode])

  const sendTyping = useCallback(() => {
    if (!state.roomCode) return
    socketRef.current?.emit('chat:typing', {
      roomCode: state.roomCode,
      walletAddress: walletRef.current,
    })
  }, [state.roomCode])

  const sendTypingStop = useCallback(() => {
    if (!state.roomCode) return
    socketRef.current?.emit('chat:typing_stop', {
      roomCode: state.roomCode,
      walletAddress: walletRef.current,
    })
  }, [state.roomCode])

  const sendReaction = useCallback((messageId: string, emoji: string) => {
    if (!state.roomCode) return
    socketRef.current?.emit('chat:reaction', {
      roomCode: state.roomCode,
      messageId,
      walletAddress: walletRef.current,
      emoji,
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
    if (state.roomCode && state.phase !== 'idle') {
      socketRef.current?.emit('game:leave', {
        walletAddress: walletRef.current,
        roomCode: state.roomCode,
      })
    }
    sessionStorage.removeItem('fakeout_room')
    setState(INITIAL_STATE)
  }, [state.roomCode, state.phase])

  return {
    ...state,
    isHost: state.hostWalletAddress?.toLowerCase() === walletAddress?.toLowerCase(),
    createGame,
    joinGame,
    rejoinGame,
    startGame,
    sendChatMessage,
    sendTyping,
    sendTypingStop,
    sendReaction,
    submitVote,
    clearError,
    resetGame,
  }
}
