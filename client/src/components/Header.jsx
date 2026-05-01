import { useEffect, useState } from 'react'

const SPORTS = [
  { id: 'all',      label: 'All Sports',    icon: '🏆' },
  { id: 'football', label: 'Football',      icon: '⚽' },
  { id: 'cricket',  label: 'Cricket',       icon: '🏏' },
  { id: 'nba',      label: 'NBA',           icon: '🏀' },
  { id: 'tennis',   label: 'Tennis',        icon: '🎾' },
  { id: 'ufc',      label: 'UFC / Boxing',  icon: '🥊' },
]

export default function Header({ session, activeSport, setActiveSport, onSportClick }) {
  const [serverStatus, setServerStatus] = useState(null)

  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then(d => setServerStatus(d))
      .catch(() => {})
  }, [])

  const plPositive = session.pl >= 0
  const plText = session.pl === 0
    ? '$0.00'
    : (plPositive ? '+' : '') + '$' + Math.abs(session.pl).toFixed(2)

  const isDemo = !serverStatus || serverStatus.demo

  return (
    <header className="header">
      <div className="header-logo">
        <div className="logo-mark">E</div>
        <div>
          <div className="logo-text">EdgeLab</div>
          <div className="logo-sub">Personal Bookmaker</div>
        </div>
      </div>

      <nav className="header-sports">
        {SPORTS.map(s => (
          <button
            key={s.id}
            className={`sport-tab${activeSport === s.id ? ' active' : ''}`}
            onClick={() => {
              setActiveSport(s.id)
              if (s.id !== 'all') onSportClick(s)
            }}
          >
            <span className="sport-icon">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="header-right">
        {isDemo ? (
          <div
            className="demo-badge"
            title="Add GROQ_API_KEY to .env for free live AI — console.groq.com"
            style={{ cursor: 'help' }}
          >
            ⚡ Demo · Get Free AI ↗
          </div>
        ) : (
          <div className="demo-badge" style={{
            background: 'var(--green-dim)',
            borderColor: 'rgba(0,230,118,0.25)',
            color: 'var(--green)',
          }}>
            🤖 Cloudflare AI · ESPN Live
          </div>
        )}

        <div className="live-badge">
          <div className="live-dot" />
          Live
        </div>

        {session.bankroll > 0 && (
          <div className="header-bankroll">
            <div className="bankroll-val">
              ${session.bankroll.toFixed(0)}
              {session.pl !== 0 && (
                <span style={{
                  fontSize: 11,
                  marginLeft: 4,
                  color: plPositive ? 'var(--green)' : 'var(--red)',
                  fontWeight: 600,
                }}>
                  {plText}
                </span>
              )}
            </div>
            <div className="bankroll-lbl">Session bankroll</div>
          </div>
        )}
      </div>
    </header>
  )
}
