import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, PublicPlayer, TypingUser } from '../types'
import './GameChat.css'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🔥'] as const

interface Props {
  word: string
  hint: string
  role: 'crewmate' | 'impostor' | null
  players: PublicPlayer[]
  messages: ChatMessage[]
  typingUsers: TypingUser[]
  walletAddress: string
  isClosed: boolean
  timeLeft: number
  error: string | null
  clearError: () => void
  onSendMessage: (
    text: string,
    opts?: { replyToId?: string; mentionWalletAddresses?: string[] }
  ) => void
  onTyping: () => void
  onTypingStop: () => void
  onReaction: (messageId: string, emoji: string) => void
}

export function GameChat({
  word,
  hint,
  role,
  players,
  messages,
  typingUsers,
  walletAddress,
  isClosed,
  timeLeft,
  error,
  clearError,
  onSendMessage,
  onTyping,
  onTypingStop,
  onReaction,
}: Props) {
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [reactionTarget, setReactionTarget] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [atBottom, setAtBottom] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const typingEmittedRef = useRef(false)
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  const messageMap = new Map(messages.map(m => [m.id, m]))

  const mentionCandidates = mentionQuery !== null
    ? players.filter(
        p =>
          p.walletAddress.toLowerCase() !== walletAddress.toLowerCase() &&
          p.displayName.toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : []

  const scrollToBottom = useCallback((smooth = true) => {
    endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' })
    setUnreadCount(0)
    setAtBottom(true)
  }, [])

  const prevMsgCountRef = useRef(0)

  useEffect(() => {
    if (messages.length <= prevMsgCountRef.current) return
    prevMsgCountRef.current = messages.length

    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (nearBottom) {
      requestAnimationFrame(() => scrollToBottom(messages.length > 2))
    } else {
      setUnreadCount(c => c + 1)
    }
  }, [messages.length, scrollToBottom])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    function onScroll() {
      const el = scrollRef.current
      if (!el) return
      const threshold = 48
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      setAtBottom(nearBottom)
      if (nearBottom) setUnreadCount(0)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    return () => {
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
    }
  }, [])

  function handleInputChange(value: string) {
    setText(value)

    const atMatch = value.match(/@(\w*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }

    if (isClosed) return

    if (value.trim()) {
      if (!typingEmittedRef.current) {
        typingEmittedRef.current = true
        onTyping()
      }
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
      typingDebounceRef.current = setTimeout(() => {
        typingEmittedRef.current = false
        onTypingStop()
      }, 2000)
    } else {
      typingEmittedRef.current = false
      onTypingStop()
    }
  }

  function insertMention(player: PublicPlayer) {
    const replaced = text.replace(/@\w*$/, `@${player.displayName} `)
    setText(replaced)
    setMentionQuery(null)
  }

  function parseMentions(messageText: string): string[] {
    const found: string[] = []
    const sorted = [...players].sort((a, b) => b.displayName.length - a.displayName.length)
    for (const p of sorted) {
      const escaped = p.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`@${escaped}(?:\\s|$)`, 'i').test(messageText)) {
        found.push(p.walletAddress.toLowerCase())
      }
    }
    return found
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || isClosed) return

    onSendMessage(trimmed, {
      replyToId: replyTo?.id,
      mentionWalletAddresses: parseMentions(trimmed),
    })
    setText('')
    setReplyTo(null)
    setMentionQuery(null)
    typingEmittedRef.current = false
    onTypingStop()
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
    requestAnimationFrame(() => scrollToBottom(true))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(i => (i + 1) % mentionCandidates.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(i => (i - 1 + mentionCandidates.length) % mentionCandidates.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionCandidates[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const othersTyping = typingUsers.filter(
    t => t.walletAddress.toLowerCase() !== walletAddress.toLowerCase()
  )

  const typingLabel =
    othersTyping.length === 1
      ? `${othersTyping[0].displayName} is typing`
      : othersTyping.length === 2
        ? `${othersTyping[0].displayName} and ${othersTyping[1].displayName} are typing`
        : othersTyping.length > 2
          ? 'Several people are typing'
          : ''

  return (
    <>
      <div className="chat-word-bar">
        {role === 'crewmate'
          ? <span>Word: <strong>{word}</strong></span>
          : <span>Hint: <strong>{hint}</strong> · Impostor</span>}
      </div>

      {timeLeft > 0 && (
        <div className="game-header">
          <span className="round-badge">Discussion</span>
          <Timer seconds={timeLeft} warn={timeLeft <= 10 && !isClosed} />
        </div>
      )}

      {error && (
        <div className="error-banner" onClick={clearError}>{error}</div>
      )}

      <div className="chat-shell">
        <div className="chat-glass-panel">
          <div className="chat-presence" aria-label="Players in discussion">
            {players.map(p => {
              const online = !p.disconnected
              const isMe = p.walletAddress.toLowerCase() === walletAddress.toLowerCase()
              return (
                <div key={p.walletAddress} className="chat-presence-item">
                  <div className="chat-presence-avatar">
                    {p.displayName[0]?.toUpperCase() ?? '?'}
                    <span
                      className={`chat-presence-dot ${online ? '' : 'offline'}`}
                      title={online ? 'Online' : 'Away'}
                    />
                  </div>
                  <span className="chat-presence-name">
                    {isMe ? 'You' : p.displayName}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="chat-scroll" ref={scrollRef} role="log" aria-live="polite">
            {messages.map((msg, i) => (
              <ChatMessageBubble
                key={msg.id}
                msg={msg}
                isMine={msg.walletAddress.toLowerCase() === walletAddress.toLowerCase()}
                replySource={msg.replyToId ? messageMap.get(msg.replyToId) : undefined}
                walletAddress={walletAddress}
                players={players}
                showPicker={reactionTarget === msg.id}
                onTogglePicker={() =>
                  setReactionTarget(reactionTarget === msg.id ? null : msg.id)
                }
                onReply={() => {
                  setReplyTo(msg)
                  setReactionTarget(null)
                }}
                onReaction={emoji => {
                  onReaction(msg.id, emoji)
                  setReactionTarget(null)
                }}
                style={{ animationDelay: `${Math.min(i * 0.04, 0.4)}s` }}
              />
            ))}

            {othersTyping.length > 0 && (
              <div className="chat-typing" aria-label="Typing">
                <div className="chat-typing-dots">
                  <span /><span /><span />
                </div>
                <span className="chat-typing-text">{typingLabel}</span>
              </div>
            )}

            <div ref={endRef} />
          </div>
        </div>

        <button
          type="button"
          className={`chat-unread-pill ${!atBottom && unreadCount > 0 ? 'visible' : ''}`}
          onClick={() => scrollToBottom(true)}
          aria-label={`${unreadCount} new messages`}
        >
          ↓ {unreadCount} new
        </button>

        <div className="chat-dock">
          {isClosed ? (
            <div className="chat-closed-banner">Chat closed · Voting soon…</div>
          ) : (
            <div className="chat-dock-glass">
              {replyTo && (
                <div className="chat-reply-bar">
                  <span className="chat-reply-bar-text">
                    Replying to <strong>{replyTo.displayName}</strong>: {replyTo.text}
                  </span>
                  <button
                    type="button"
                    className="chat-reply-cancel"
                    onClick={() => setReplyTo(null)}
                    aria-label="Cancel reply"
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="chat-input-row">
                <div className="chat-input-wrap">
                  {mentionQuery !== null && mentionCandidates.length > 0 && (
                    <div className="chat-mention-dropdown" role="listbox">
                      {mentionCandidates.map((p, idx) => (
                        <button
                          key={p.walletAddress}
                          type="button"
                          role="option"
                          aria-selected={idx === mentionIndex}
                          className={`chat-mention-option ${idx === mentionIndex ? 'highlighted' : ''}`}
                          onMouseDown={e => {
                            e.preventDefault()
                            insertMention(p)
                          }}
                        >
                          <span className="chat-mention-option-avatar">
                            {p.displayName[0]?.toUpperCase()}
                          </span>
                          @{p.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    className="chat-input-field"
                    placeholder="Say something… Use @ to tag"
                    value={text}
                    rows={1}
                    maxLength={200}
                    onChange={e => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => {
                      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
                      typingEmittedRef.current = false
                      onTypingStop()
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary chat-send-btn"
                  disabled={!text.trim()}
                  onClick={handleSend}
                  aria-label="Send message"
                >
                  ↑
                </button>
              </div>
              <p className="chat-tag-hint">@ mention · Tap ↩ on a message to reply</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ChatMessageBubble({
  msg,
  isMine,
  replySource,
  walletAddress,
  players,
  showPicker,
  onTogglePicker,
  onReply,
  onReaction,
  style,
}: {
  msg: ChatMessage
  isMine: boolean
  replySource?: ChatMessage
  walletAddress: string
  players: PublicPlayer[]
  showPicker: boolean
  onTogglePicker: () => void
  onReply: () => void
  onReaction: (emoji: string) => void
  style?: React.CSSProperties
}) {
  const reactions = msg.reactions ?? {}
  const hasReactions = Object.keys(reactions).length > 0

  return (
    <div
      className={`chat-msg-row ${isMine ? 'mine' : 'theirs'}`}
      style={style}
    >
      {!isMine && (
        <div className="chat-msg-meta">
          <span className="chat-msg-name">{msg.displayName}</span>
          <span className="chat-msg-time">{formatTime(msg.timestamp)}</span>
        </div>
      )}

      <div className="chat-msg-wrap">
        {replySource && (
          <div className="chat-msg-reply-preview">
            {replySource.displayName}: {replySource.text}
          </div>
        )}

        <div className={`chat-bubble-float ${isMine ? 'mine' : 'theirs'}`}>
          <MessageText
            text={msg.text}
            mentionWalletAddresses={msg.mentionWalletAddresses ?? []}
            players={players}
          />
        </div>

        {isMine && (
          <div className="chat-msg-meta">
            <span className="chat-msg-time">{formatTime(msg.timestamp)}</span>
          </div>
        )}

        {hasReactions && (
          <div className="chat-reactions">
            {Object.entries(reactions).map(([emoji, wallets]) => {
              const mine = wallets.some(w => w.toLowerCase() === walletAddress.toLowerCase())
              return (
                <button
                  key={emoji}
                  type="button"
                  className={`chat-reaction-chip ${mine ? 'mine' : ''}`}
                  onClick={() => onReaction(emoji)}
                >
                  {emoji} {wallets.length}
                </button>
              )
            })}
          </div>
        )}

        <div className="chat-msg-actions">
          <button type="button" className="chat-msg-action-btn" onClick={onReply}>
            Reply
          </button>
          <button type="button" className="chat-msg-action-btn" onClick={onTogglePicker}>
            React
          </button>
        </div>

        {showPicker && (
          <div className="chat-reaction-picker">
            {REACTION_EMOJIS.map(emoji => (
              <button key={emoji} type="button" onClick={() => onReaction(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MessageText({
  text,
  mentionWalletAddresses,
  players,
}: {
  text: string
  mentionWalletAddresses: string[]
  players: PublicPlayer[]
}) {
  const mentionedNames = new Set(
    mentionWalletAddresses
      .map(w => players.find(p => p.walletAddress.toLowerCase() === w.toLowerCase())?.displayName)
      .filter(Boolean) as string[]
  )

  if (mentionedNames.size === 0) return <>{text}</>

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const pattern = /@(\w+(?:\s\w+)*?)(?=\s|$|[.,!?])/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const name = match[1]
    const isMention = [...mentionedNames].some(
      n => n.toLowerCase() === name.toLowerCase()
    )
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (isMention) {
      parts.push(
        <span key={match.index} className="chat-mention">@{name}</span>
      )
    } else {
      parts.push(match[0])
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))

  return <>{parts}</>
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()

  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function Timer({ seconds, warn }: { seconds: number; warn: boolean }) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const label = mins > 0
    ? `${mins}:${secs.toString().padStart(2, '0')}`
    : `${secs}s`
  return <span className={`timer ${warn ? 'timer-warn' : ''}`}>{label}</span>
}
