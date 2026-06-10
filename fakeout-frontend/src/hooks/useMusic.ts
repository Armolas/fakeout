import { useEffect, useRef, useState } from 'react'
import type { GamePhase } from '../types'

// Replace these with your chosen royalty-free track URLs (mp3 recommended)
const LOBBY_TRACK    = 'https://cdn.pixabay.com/audio/2025/12/30/audio_6477e71e4c.mp3'
const GAMEPLAY_TRACK = 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_1dbc62c1e9.mp3'
const VOTE_TRACK     = 'https://cdn.pixabay.com/download/audio/2021/11/25/audio_bff8e8edd5.mp3'
const RESULTS_TRACK  = 'https://cdn.pixabay.com/download/audio/2022/02/07/audio_d1718ab41a.mp3'

function trackForPhase(phase: GamePhase): string {
  switch (phase) {
    case 'word_reveal':
    case 'clue_phase':
    case 'chat_buffer':
      return GAMEPLAY_TRACK
    case 'vote_announce':
    case 'vote_phase':
    case 'tiebreak':
    case 'eliminated_notice':
      return VOTE_TRACK
    case 'results':
      return RESULTS_TRACK
    default:
      return LOBBY_TRACK
  }
}

export function useMusic(phase: GamePhase) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('fakeout_muted') === 'true')

  // Init audio element once
  useEffect(() => {
    const audio = new Audio()
    audio.loop = true
    audio.volume = 0.3
    audioRef.current = audio
    return () => {
      audio.pause()
      audio.src = ''
    }
  }, [])

  // Swap track on phase change
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const url = trackForPhase(phase)
    if (audio.src !== url) {
      audio.src = url
      audio.load()
    }
    if (!isMuted) audio.play().catch(() => {})
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply mute/unmute
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    localStorage.setItem('fakeout_muted', String(isMuted))
    if (isMuted) {
      audio.pause()
    } else {
      audio.play().catch(() => {})
    }
  }, [isMuted])

  return { isMuted, toggleMute: () => setIsMuted(m => !m) }
}
