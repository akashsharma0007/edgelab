import React from 'react'

// ── inline highlight: odds, money, % ─────────────────────────────────────────
function Inline({ text }) {
  const parts = text.split(/(\[[\d.]+\]|\$[\d,.]+(?:\s*CAD)?|~?[\d]+\.?\d*%|\b\d\.\d+\b(?=\s*odds|\s*combined|\s*\|))/gi)
  return (
    <>
      {parts.map((p, i) => {
        if (/^\[[\d.]+\]$/.test(p))   return <span key={i} className="odds-badge">{p.slice(1,-1)}</span>
        if (/^\$[\d,.]+/.test(p))      return <span key={i} className="money-val">{p}</span>
        if (/^~?[\d]+\.?\d*%$/.test(p)) return <span key={i} className="prob-val">{p}</span>
        return p
      })}
    </>
  )
}

// ── bold / italic inline ──────────────────────────────────────────────────────
function RichText({ text }) {
  // Replace **bold** and *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}><Inline text={p.slice(2,-2)} /></strong>
        if (/^\*[^*]+\*$/.test(p))     return <em key={i}><Inline text={p.slice(1,-1)} /></em>
        return <Inline key={i} text={p} />
      })}
    </>
  )
}

// ── risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({ text }) {
  const t = text.trim()
  if (t.includes('Safe') || t.includes('✅'))      return <span className="risk-safe">{t}</span>
  if (t.includes('Moderate') || t.includes('⚠️'))  return <span className="risk-moderate">{t}</span>
  if (t.includes('Risky') || t.includes('🔴') || t.includes('Never')) return <span className="risk-risky">{t}</span>
  return <span>{t}</span>
}

// ── markdown table → HTML table ───────────────────────────────────────────────
function PicksTable({ lines, startIdx }) {
  const headerCells = lines[startIdx].split('|').map(s => s.trim()).filter(Boolean)
  // lines[startIdx+1] is the separator row — skip it
  const rows = []
  let i = startIdx + 2
  while (i < lines.length) {
    const l = lines[i].trim()
    if (!l.startsWith('|')) break
    const cells = l.split('|').map(s => s.trim()).filter(Boolean)
    if (cells.length > 0) rows.push(cells)
    i++
  }

  const riskColIdx = headerCells.findIndex(h => /risk/i.test(h))
  const oddsColIdx = headerCells.findIndex(h => /odds/i.test(h))
  const probColIdx = headerCells.findIndex(h => /prob/i.test(h))

  return { el: (
    <div className="picks-table-wrap" key={`tbl-${startIdx}`}>
      <table className="picks-table">
        <thead>
          <tr>
            {headerCells.map((h, j) => <th key={j}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => {
                if (ci === riskColIdx) return <td key={ci}><RiskBadge text={cell} /></td>
                if (ci === oddsColIdx) return <td key={ci} className="td-odds">{cell}</td>
                if (ci === probColIdx) return <td key={ci} className="td-prob">{cell}</td>
                return <td key={ci}><RichText text={cell} /></td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ), nextIdx: i }
}

// ── combo / stake highlight ───────────────────────────────────────────────────
function ComboLine({ text }) {
  return (
    <div className="combo-line">
      <span className="combo-label">COMBO</span>
      <RichText text={text.replace(/^\*\*COMBO:\*\*\s*/i, '').replace(/^COMBO:\s*/i, '')} />
    </div>
  )
}

function StakeLine({ text }) {
  return (
    <div className="stake-line">
      <RichText text={text.replace(/^💰\s*/, '')} />
    </div>
  )
}

// ── main parser ───────────────────────────────────────────────────────────────
export default function MessageBubble({ content, role }) {
  if (role === 'user') {
    return <div className="bubble">{content}</div>
  }

  const lines  = content.split('\n')
  const result = []
  let i = 0

  while (i < lines.length) {
    const raw  = lines[i]
    const line = raw.trim()

    // empty
    if (!line) { result.push(<div key={i} className="msg-spacer" />); i++; continue }

    // --- horizontal rule
    if (/^---+$/.test(line)) { result.push(<hr key={i} className="msg-divider" />); i++; continue }

    // ═══ section header
    if (/^═{3,}/.test(line)) { i++; continue }

    // ### Match heading
    if (line.startsWith('### ')) {
      result.push(
        <div key={i} className="match-heading">
          <RichText text={line.slice(4)} />
        </div>
      )
      i++; continue
    }

    // ## heading
    if (line.startsWith('## ')) {
      result.push(<div key={i} className="msg-heading"><RichText text={line.slice(3)} /></div>)
      i++; continue
    }

    // # heading
    if (line.startsWith('# ')) {
      result.push(<div key={i} className="msg-heading"><RichText text={line.slice(2)} /></div>)
      i++; continue
    }

    // markdown table
    if (line.startsWith('|') && i + 1 < lines.length && /^\|[\s\-:|]+\|/.test(lines[i+1]?.trim())) {
      const { el, nextIdx } = PicksTable({ lines, startIdx: i })
      result.push(el)
      i = nextIdx
      continue
    }

    // COMBO line
    if (/^\*?\*?COMBO:/i.test(line)) {
      result.push(<ComboLine key={i} text={line} />)
      i++; continue
    }

    // Stake line
    if (/^💰|^Stake\s+\$|^stake\s+\$/i.test(line)) {
      result.push(<StakeLine key={i} text={line} />)
      i++; continue
    }

    // **Bold label:** like **Form:** or **H2H:** or **Why this works:** etc.
    if (/^\*\*[^*]+\*\*/.test(line)) {
      const isSection = /^\*\*(Why|Avoid|Form|H2H|Analysis|Note|Warning|Alert|Recommendation)/i.test(line)
      result.push(
        <div key={i} className={isSection ? 'msg-section-label' : 'msg-rich-line'}>
          <RichText text={line} />
        </div>
      )
      i++; continue
    }

    // bullet • or → or -
    if (/^[•·→\-]\s/.test(line) || /^\*\s/.test(line)) {
      const text = line.replace(/^[•·→\-\*]\s+/, '')
      result.push(
        <div key={i} className="msg-bullet">
          <span className="bullet-dot">•</span>
          <span><RichText text={text} /></span>
        </div>
      )
      i++; continue
    }

    // Dashboard block detection
    if (line.includes('EDGELAB LIVE DASHBOARD') || line.includes('LIVE DASHBOARD')) {
      // collect dashboard lines until next ─── block ends
      const dashLines = []
      i++
      while (i < lines.length && !(/^─{3,}$/.test(lines[i].trim()) && dashLines.length > 3)) {
        if (!/^─{3,}$/.test(lines[i].trim())) dashLines.push(lines[i])
        i++
      }
      i++ // skip closing ───

      const rows = dashLines
        .map(l => { const idx = l.indexOf(':'); return idx > 0 ? [l.slice(0,idx).trim(), l.slice(idx+1).trim()] : null })
        .filter(Boolean)

      result.push(
        <div key={`db-${i}`} className="dashboard-card">
          <div className="dashboard-card-title">EdgeLab Live Dashboard</div>
          <div className="dashboard-card-rows">
            {rows.map(([label, value], ri) => {
              const cls = value.startsWith('+') ? 'green' : value.startsWith('-') ? 'red' : value.includes('TARGET HIT') ? 'green' : value.includes('BEHIND') ? 'amber' : ''
              return (
                <div key={ri} className="dashboard-row">
                  <span className="label">{label}</span>
                  <span className={`value ${cls}`}>{value}</span>
                </div>
              )
            })}
          </div>
        </div>
      )
      continue
    }

    // ─── divider
    if (/^─{3,}$/.test(line)) { result.push(<hr key={i} className="msg-divider" />); i++; continue }

    // All-caps section title (COMMANDS, SESSION, etc.)
    if (/^[A-Z][A-Z\s&\/\-:]+$/.test(line) && line.length > 4 && !line.includes('$')) {
      result.push(<div key={i} className="msg-heading">{line}</div>)
      i++; continue
    }

    // Sport icon line
    if (/^[⚽🏀🎾🏏🥊🏈⛳🎱🏒]/.test(line)) {
      result.push(
        <div key={i} className="msg-sport-line"><RichText text={line} /></div>
      )
      i++; continue
    }

    // default text
    result.push(
      <div key={i} className="msg-text"><RichText text={line} /></div>
    )
    i++
  }

  return <div className="bubble">{result}</div>
}
