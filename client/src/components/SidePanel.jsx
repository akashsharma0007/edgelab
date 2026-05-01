import React from 'react'

function ProgressRing({ pct }) {
  const r = 36
  const stroke = 4
  const circ = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(1, pct / 100)) * circ
  const cx = r + stroke
  const size = (r + stroke) * 2

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle
        cx={cx} cy={cx} r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth={stroke}
      />
      <circle
        cx={cx} cy={cx} r={r}
        fill="none"
        stroke={pct >= 100 ? 'var(--green)' : pct > 50 ? 'var(--green)' : pct > 25 ? 'var(--amber)' : 'var(--red)'}
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.4s ease' }}
      />
      <text
        x={cx} y={cx}
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          fill: 'var(--text)',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
          transform: 'rotate(90deg)',
          transformOrigin: `${cx}px ${cx}px`,
        }}
      >
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

export default function SidePanel({ session, betHistory, onSend }) {
  const remaining = Math.max(0, session.target - session.pl)
  const pct = session.target > 0
    ? Math.min(100, (session.pl / session.target) * 100)
    : 0

  const statusLabel =
    session.status === 'hit'      ? '🎯 Target Hit'      :
    session.status === 'tilt'     ? '⚠️ Tilt Alert — Stop' :
    session.status === 'behind'   ? '📉 Behind — Adjust'  :
    session.status === 'on-track' ? '✅ On Track'         :
    '⏳ Ready to start'

  const plColor = session.pl > 0 ? 'green' : session.pl < 0 ? 'red' : ''

  return (
    <aside className="side-panel">
      {/* Stats */}
      <div className="panel-section">
        <div className="panel-title">Session Stats</div>
        <div className="stats-grid">
          <div className="stat-card green">
            <div className="stat-card-val green">
              {session.bankroll > 0 ? '$' + session.bankroll.toFixed(0) : '—'}
            </div>
            <div className="stat-card-lbl">Bankroll</div>
          </div>
          <div className={`stat-card ${plColor || 'blue'}`}>
            <div className={`stat-card-val ${plColor || 'blue'}`}>
              {session.pl === 0
                ? '$0.00'
                : (session.pl > 0 ? '+' : '') + '$' + Math.abs(session.pl).toFixed(2)}
            </div>
            <div className="stat-card-lbl">P&L Today</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-card-val amber">${remaining.toFixed(2)}</div>
            <div className="stat-card-lbl">Target Left</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-val">
              {session.bets.won + session.bets.lost + session.bets.pending}
            </div>
            <div className="stat-card-lbl">Total Bets</div>
          </div>
        </div>

        <div className="progress-ring-wrap">
          <ProgressRing pct={pct} />
          <div className="progress-ring-labels">
            <div className="progress-ring-title">
              {pct >= 100 ? 'Daily target reached!' : `${Math.round(pct)}% of $${session.target} target`}
            </div>
            <div className="progress-ring-sub">
              W: {session.bets.won} · L: {session.bets.lost} · P: {session.bets.pending}
            </div>
          </div>
        </div>

        <div className={`status-badge ${session.status || 'ready'}`}>
          {statusLabel}
        </div>
      </div>

      {/* Bet outcome controls */}
      <div className="panel-section">
        <div className="panel-title">Update Last Bet</div>
        <div className="bet-controls">
          <button className="bet-ctrl-btn won" onClick={() => onSend('Last bet won')}>
            <span className="btn-icon">✅</span>
            Bet Won
          </button>
          <button className="bet-ctrl-btn pending" onClick={() => onSend('Last bet still pending')}>
            <span className="btn-icon">⏳</span>
            Pending
          </button>
          <button className="bet-ctrl-btn lost" onClick={() => onSend('Last bet lost')}>
            <span className="btn-icon">❌</span>
            Bet Lost
          </button>
        </div>
      </div>

      {/* Bet history */}
      <div className="panel-section" style={{ flex: 1 }}>
        <div className="panel-title">Bet History</div>
        <div className="bet-history">
          {betHistory.length === 0 ? (
            <div className="empty-history">
              No bets placed yet.<br />Start your session to track bets.
            </div>
          ) : (
            betHistory.map((bet, i) => (
              <div key={i} className="bet-item">
                <div className={`bet-item-dot ${bet.outcome}`} />
                <div className="bet-item-info">
                  <div className="bet-item-label">{bet.label}</div>
                  <div className="bet-item-time">{bet.time}</div>
                </div>
                <div className={`bet-item-result ${bet.outcome}`}>
                  {bet.outcome === 'won' ? '+' : bet.outcome === 'lost' ? '-' : ''}
                  {bet.amount ? `$${bet.amount}` : '—'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick prompts */}
      <div className="panel-section">
        <div className="panel-title">Quick Analysis</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { label: '📈 Maximize remaining target', q: "What's left to hit my target?" },
            { label: '🧠 Analyze last result',       q: 'Analyze my last bet result' },
            { label: '🔁 Reset session',             q: 'Reset session and start fresh' },
          ].map(item => (
            <button
              key={item.q}
              onClick={() => onSend(item.q)}
              style={{
                padding: '8px 12px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--text-2)',
                fontSize: 11.5,
                fontWeight: 500,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.13s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--green)'
                e.currentTarget.style.color = 'var(--green)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--text-2)'
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
