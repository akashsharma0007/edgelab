import React, { useRef, useEffect, useState } from 'react'
import MessageBubble from './MessageBubble.jsx'

const QUICK_CHIPS = [
  { label: "Today's card",    query: "What's on today?" },
  { label: 'Strong favorites', query: 'Strong favorites today' },
  { label: 'Cross-sport parlay', query: 'Build me a cross-sport parlay' },
  { label: 'Weekend card',    query: 'Weekend card' },
  { label: "What's left?",   query: "What's left to hit my target?" },
  { label: 'Maximize today', query: 'Maximize today' },
  { label: 'Safe plays',     query: 'Safe play only' },
]

const WELCOME_STARTERS = [
  'I have $100 today, balanced mode',
  'I have $200 today, aggressive mode',
  'I have $50 today, conservative mode',
]

function getTime() {
  return new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatArea({ messages, loading, onSend }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    onSend(text)
  }

  function autoResize(e) {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const isEmpty = messages.length === 0

  return (
    <main className="chat">
      <div className="chat-messages">
        {isEmpty ? (
          <div className="welcome-screen">
            <div className="welcome-icon">📊</div>
            <div className="welcome-title">EdgeLab is ready</div>
            <div className="welcome-sub">
              Your personal AI bookmaker. Start by telling me your bankroll
              and I'll manage the full session — picks, stakes, targets, and adjustments.
            </div>
            <div className="welcome-chips">
              {WELCOME_STARTERS.map(s => (
                <button key={s} className="welcome-chip" onClick={() => onSend(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.role}`}>
                <div className="message-row">
                  {msg.role === 'assistant' && (
                    <div className="avatar">E</div>
                  )}
                  <MessageBubble content={msg.content} role={msg.role} />
                </div>
                <div className="msg-time">{msg.time || getTime()}</div>
              </div>
            ))}
            {loading && (
              <div className="typing-message">
                <div className="avatar">E</div>
                <div className="typing-bubble">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <div className="quick-chips-bar">
        {QUICK_CHIPS.map(c => (
          <button
            key={c.query}
            className="chip"
            onClick={() => onSend(c.query)}
            disabled={loading}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="chat-input-area">
        <div className="input-row">
          <div className="input-wrap">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              rows={1}
              value={input}
              placeholder="Ask EdgeLab anything — picks, parlays, session management…"
              onChange={e => { setInput(e.target.value); autoResize(e) }}
              onKeyDown={handleKey}
              disabled={loading}
            />
          </div>
          <button
            className="send-btn"
            onClick={submit}
            disabled={!input.trim() || loading}
          >
            <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
          </button>
        </div>
      </div>
    </main>
  )
}
