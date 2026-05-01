import { useState } from 'react'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        localStorage.setItem('edgelab_token', data.token)
        localStorage.setItem('edgelab_user', data.user)
        onLogin(data.token, data.user)
      }
    } catch {
      setError('Connection error — server may be offline')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-mark" style={{ width: 48, height: 48, fontSize: 22 }}>E</div>
          <div>
            <div className="logo-text" style={{ fontSize: 24 }}>EdgeLab</div>
            <div className="logo-sub">Personal AI Bookmaker</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading || !username || !password}>
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <span className="typing-dot" /> Signing in...
              </span>
            ) : 'Sign In →'}
          </button>
        </form>

        <div className="login-footer">
          🔒 Private access only
        </div>
      </div>
    </div>
  )
}
