import { useState } from 'react'

const CATEGORIES = [
  'Pick Improvement',
  'New Feature',
  'UI / Design',
  'Bug Report',
  'General',
]

export default function FeedbackPanel({ token, onClose }) {
  const [category, setCategory]   = useState(CATEGORIES[0])
  const [text, setText]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError]         = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ category, text }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else { setSubmitted(true); setText('') }
    } catch {
      setError('Connection error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="feedback-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="feedback-panel">
        <div className="feedback-header">
          <div className="feedback-title">💡 Improve EdgeLab</div>
          <button className="feedback-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="feedback-desc">
          Your suggestions are fed directly into the AI — it applies them from your next message onwards.
        </p>

        {submitted ? (
          <div className="feedback-success">
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Suggestion received!</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              The AI will apply it going forward.
            </div>
            <button
              className="login-btn"
              style={{ width: '100%' }}
              onClick={() => setSubmitted(false)}
            >
              Send another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="feedback-form">
            <div className="login-field">
              <label>Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="feedback-select"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="login-field">
              <label>Your suggestion</label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="e.g. Always include injury reports before recommending a bet. Show more cricket markets. Make combo odds bigger in the table..."
                rows={5}
                className="feedback-textarea"
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="login-btn"
              style={{ width: '100%' }}
              disabled={submitting || !text.trim()}
            >
              {submitting ? 'Submitting...' : '📤 Submit Suggestion'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
