import { useState, useCallback, useEffect } from 'react'
import Header       from './components/Header.jsx'
import Sidebar      from './components/Sidebar.jsx'
import ChatArea     from './components/ChatArea.jsx'
import SidePanel    from './components/SidePanel.jsx'
import LoginPage    from './components/LoginPage.jsx'
import FeedbackPanel from './components/FeedbackPanel.jsx'

const DEFAULT_SESSION = {
  bankroll: 0,
  pl: 0,
  target: 20,
  bets: { won: 0, lost: 0, pending: 0 },
  status: 'ready',
}

function parseSessionUpdate(text, current) {
  const next = { ...current, bets: { ...current.bets } }

  const brMatch = text.match(/Bankroll:\s*\$(\d+(?:\.\d+)?)/)
    || text.match(/I have \$(\d+)/i)
  if (brMatch && next.bankroll === 0) {
    next.bankroll = parseFloat(brMatch[1])
  }

  const plMatch = text.match(/P&L today:\s*([+-]?\$?[\d.]+)/i)
  if (plMatch) {
    const raw = plMatch[1].replace('$', '')
    next.pl = parseFloat(raw)
  }

  const wonMatch = text.match(/Won:\s*(\d+)/i)
  if (wonMatch) next.bets.won = parseInt(wonMatch[1])

  const lostMatch = text.match(/Lost:\s*(\d+)/i)
  if (lostMatch) next.bets.lost = parseInt(lostMatch[1])

  const pendingMatch = text.match(/Pending:\s*(\d+)/i)
  if (pendingMatch) next.bets.pending = parseInt(pendingMatch[1])

  const textLow = text.toLowerCase()
  if (textLow.includes('target hit') || textLow.includes('target achieved') || textLow.includes('target reached')) {
    next.status = 'hit'
  } else if (textLow.includes('tilt alert') || textLow.includes('stop immediately') || textLow.includes('stop here')) {
    next.status = 'tilt'
  } else if (textLow.includes('behind')) {
    next.status = 'behind'
  } else if (next.bankroll > 0) {
    next.status = 'on-track'
  }

  return next
}

function getTime() {
  return new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
}

export default function App() {
  const [messages, setMessages]     = useState([])
  const [session, setSession]       = useState(DEFAULT_SESSION)
  const [loading, setLoading]       = useState(false)
  const [activeSport, setActiveSport] = useState('all')
  const [betHistory, setBetHistory] = useState([])
  const [token, setToken]           = useState(null)
  const [user, setUser]             = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)

  // Restore session from localStorage and verify with server
  useEffect(() => {
    const saved = localStorage.getItem('edgelab_token')
    const savedUser = localStorage.getItem('edgelab_user')
    if (!saved) { setAuthChecked(true); return }

    fetch('/api/verify', { headers: { 'Authorization': `Bearer ${saved}` } })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setToken(saved)
          setUser(savedUser || d.user)
        } else {
          localStorage.removeItem('edgelab_token')
          localStorage.removeItem('edgelab_user')
        }
      })
      .catch(() => {
        // Server offline — still allow cached token to proceed
        setToken(saved)
        setUser(savedUser)
      })
      .finally(() => setAuthChecked(true))
  }, [])

  function handleLogin(t, u) {
    setToken(t)
    setUser(u)
  }

  function handleLogout() {
    fetch('/api/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }).catch(() => {})
    setToken(null)
    setUser(null)
    setMessages([])
    setSession(DEFAULT_SESSION)
    setBetHistory([])
    localStorage.removeItem('edgelab_token')
    localStorage.removeItem('edgelab_user')
  }

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return

    const userMsg = { role: 'user', content: text, time: getTime() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    const historyForAPI = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: historyForAPI }),
      })

      if (res.status === 401) {
        handleLogout()
        return
      }

      const data = await res.json()

      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Error: ' + data.error,
          time: getTime(),
        }])
      } else {
        const aiMsg = { role: 'assistant', content: data.message, time: getTime() }
        setMessages(prev => [...prev, aiMsg])
        setSession(prev => parseSessionUpdate(data.message, prev))

        const lower = text.toLowerCase()
        if (lower.includes('bet won') || lower.includes('last bet won')) {
          setBetHistory(prev => [{ label: 'Bet won', outcome: 'won', amount: null, time: getTime() }, ...prev].slice(0, 10))
        } else if (lower.includes('bet lost') || lower.includes('last bet lost')) {
          setBetHistory(prev => [{ label: 'Bet lost', outcome: 'lost', amount: null, time: getTime() }, ...prev].slice(0, 10))
        } else if (lower.includes('pending')) {
          setBetHistory(prev => [{ label: 'Bet pending', outcome: 'pending', amount: null, time: getTime() }, ...prev].slice(0, 10))
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connection error — make sure the server is running.',
        time: getTime(),
      }])
    } finally {
      setLoading(false)
    }
  }, [messages, loading, token])

  function handleSportClick(sport) {
    const queries = {
      football: "What football matches are on today? Show picks.",
      cricket:  "Any IPL or cricket matches today? Show picks.",
      nba:      "What NBA games are on today? Show picks.",
      tennis:   "Any tennis matches today? Show picks.",
      ufc:      "Any UFC or boxing events today? Show picks.",
    }
    const q = queries[sport.id]
    if (q) sendMessage(q)
  }

  // Show blank while verifying stored token
  if (!authChecked) return null

  if (!token) return <LoginPage onLogin={handleLogin} />

  return (
    <div className="app">
      <Header
        session={session}
        activeSport={activeSport}
        setActiveSport={setActiveSport}
        onSportClick={handleSportClick}
        user={user}
        onLogout={handleLogout}
        onFeedback={() => setShowFeedback(true)}
      />
      <div className="layout">
        <Sidebar session={session} onSend={sendMessage} token={token} />
        <ChatArea messages={messages} loading={loading} onSend={sendMessage} />
        <SidePanel session={session} betHistory={betHistory} onSend={sendMessage} />
      </div>

      {showFeedback && (
        <FeedbackPanel token={token} onClose={() => setShowFeedback(false)} />
      )}
    </div>
  )
}
