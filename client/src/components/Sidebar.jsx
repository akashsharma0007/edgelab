import { useState, useEffect } from 'react'

const QUICK_NAV = [
  { icon: '⭐', label: 'Strong Favorites', query: 'Strong favorites today' },
  { icon: '🔗', label: 'Build Parlay',     query: 'Build me a cross-sport parlay' },
  { icon: '🎯', label: "What's Left?",     query: "What's left to hit my target?" },
  { icon: '🚀', label: 'Maximize Today',   query: 'Maximize today' },
  { icon: '🛡',  label: 'Safe Plays Only',  query: 'Safe play only' },
  { icon: '📅', label: 'Weekend Card',     query: 'Weekend card' },
]

function LiveDot() {
  return <span style={{
    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
    background: 'var(--red)', animation: 'pulse 1.2s infinite', flexShrink: 0,
  }} />
}

function MatchCard({ event, isSoccer, onSend }) {
  const isLive = /progress|live|half/i.test(event.status)
  const isFinished = /final|finished|ended/i.test(event.status)

  return (
    <div
      className="match-card"
      onClick={() => onSend(`Analyse ${event.home} vs ${event.away} and give me picks`)}
      title={`Click to analyse ${event.home} vs ${event.away}`}
    >
      <div className="match-card-top">
        <div className="match-card-time">
          {isLive ? (
            <span className="match-live-tag"><LiveDot /> LIVE</span>
          ) : isFinished ? (
            <span className="match-finished-tag">FT</span>
          ) : (
            <span className="match-time-text">{event.time}</span>
          )}
        </div>
        {isSoccer && event.watchUrl && !isFinished && (
          <a
            href={event.watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="watch-btn"
            onClick={e => e.stopPropagation()}
            title="Watch on Footybite"
          >
            ▶ Watch
          </a>
        )}
      </div>

      <div className="match-teams">
        <span className="match-team home">{event.home}</span>
        {isLive || isFinished ? (
          <span className="match-score-inline">
            {event.homeScore ?? 0} – {event.awayScore ?? 0}
          </span>
        ) : (
          <span className="match-vs-text">vs</span>
        )}
        <span className="match-team away">{event.away}</span>
      </div>

      {event.homeOdds && (
        <div className="match-odds-row">
          <span className="mOdd">{event.homeOdds > 0 ? '+' : ''}{event.homeOdds}</span>
          <span className="mOdd-label">1</span>
          {event.drawOdds && <><span className="mOdd">{event.drawOdds > 0 ? '+' : ''}{event.drawOdds}</span><span className="mOdd-label">X</span></>}
          <span className="mOdd">{event.awayOdds > 0 ? '+' : ''}{event.awayOdds}</span>
          <span className="mOdd-label">2</span>
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ session, onSend }) {
  const [fixtures, setFixtures] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    loadFixtures()
    const iv = setInterval(loadFixtures, 10 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])

  async function loadFixtures() {
    try {
      const res  = await fetch('/api/fixtures')
      const data = await res.json()
      setFixtures(data.fixtures || [])
      // auto-expand first two leagues
      const initial = {}
      ;(data.fixtures || []).slice(0, 2).forEach(l => { initial[l.label] = true })
      setExpanded(prev => ({ ...initial, ...prev }))
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  function toggle(label) {
    setExpanded(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const totalMatches = fixtures.reduce((n, l) => n + l.events.length, 0)
  const liveCount    = fixtures.reduce((n, l) =>
    n + l.events.filter(e => /progress|live|half/i.test(e.status)).length, 0)

  const wonCount  = session.bets.won
  const lostCount = session.bets.lost

  return (
    <aside className="sidebar">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="sidebar-matches-header">
        <span className="sidebar-matches-title">Today's Matches</span>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {liveCount > 0 && (
            <span className="sidebar-live-count"><LiveDot /> {liveCount} live</span>
          )}
          <span className="sidebar-total-count">{totalMatches}</span>
        </div>
      </div>

      {/* ── Match list ─────────────────────────────────────── */}
      <div className="sidebar-matches-scroll">
        {loading && (
          <div className="sidebar-loading">Loading fixtures…</div>
        )}

        {!loading && fixtures.length === 0 && (
          <div className="sidebar-loading">No matches found today.</div>
        )}

        {fixtures.map(league => {
          const isSoccer  = league.sport === 'football'
          const isOpen    = expanded[league.label]
          const liveInLeague = league.events.filter(e => /progress|live|half/i.test(e.status)).length

          return (
            <div key={league.label} className="match-league-group">
              <div className="match-league-header" onClick={() => toggle(league.label)}>
                <span className="match-league-name">
                  {league.label}
                  {liveInLeague > 0 && <span className="league-live-badge">{liveInLeague} live</span>}
                </span>
                <span className="league-toggle">{isOpen ? '▾' : '▸'}</span>
              </div>

              {isOpen && (
                <div className="match-league-events">
                  {league.events.map((e, i) => (
                    <MatchCard
                      key={i}
                      event={e}
                      isSoccer={isSoccer}
                      onSend={onSend}
                    />
                  ))}
                  {isSoccer && league.leagueUrl && (
                    <a
                      href={league.leagueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="league-all-streams"
                    >
                      ▶ All {league.label.replace(/^[^ ]+ /, '')} streams on Footybite ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Quick access ──────────────────────────────────── */}
      <div className="sidebar-quick-section">
        <div className="sidebar-label">Quick Access</div>
        {QUICK_NAV.map(item => (
          <div key={item.query} className="nav-item" onClick={() => onSend(item.query)}>
            <div className="nav-icon">{item.icon}</div>
            <span className="nav-label">{item.label}</span>
          </div>
        ))}
      </div>

      {/* ── Session mini ──────────────────────────────────── */}
      <div className="sidebar-footer">
        <div className="session-mini">
          <div className="session-mini-title">Current Session</div>
          <div className="session-mini-stats">
            <div className="session-mini-stat">
              <div className="val green">{session.bankroll > 0 ? '$' + session.bankroll.toFixed(0) : '—'}</div>
              <div className="lbl">Bankroll</div>
            </div>
            <div className="session-mini-stat">
              <div className={`val ${session.pl > 0 ? 'green' : session.pl < 0 ? 'red' : ''}`}>
                {session.pl === 0 ? '$0' : (session.pl > 0 ? '+' : '') + '$' + Math.abs(session.pl).toFixed(2)}
              </div>
              <div className="lbl">P&L</div>
            </div>
            <div className="session-mini-stat">
              <div className="val amber">${Math.max(0, session.target - session.pl).toFixed(0)}</div>
              <div className="lbl">Left</div>
            </div>
            <div className="session-mini-stat">
              <div className="val">{wonCount + lostCount + session.bets.pending}</div>
              <div className="lbl">Bets</div>
            </div>
          </div>
        </div>
      </div>

    </aside>
  )
}
