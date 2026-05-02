require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const crypto  = require('crypto');

// ─── AI PROVIDER CONFIG ───────────────────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_API_KEY       = process.env.GROQ_API_KEY;
const GEMINI_API_KEY     = process.env.GEMINI_API_KEY;
const CF_ACCOUNT_ID      = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN       = process.env.CF_API_TOKEN;

const USE_OPENROUTER = !!OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'your_openrouter_key_here';
const USE_GROQ       = !USE_OPENROUTER && !!GROQ_API_KEY && GROQ_API_KEY !== 'your_groq_key_here';
const USE_GEMINI     = !USE_OPENROUTER && !USE_GROQ && !!GEMINI_API_KEY && GEMINI_API_KEY !== 'your_gemini_key_here';
const USE_CF         = !USE_OPENROUTER && !USE_GROQ && !USE_GEMINI && !!CF_ACCOUNT_ID && !!CF_API_TOKEN
  && CF_ACCOUNT_ID !== 'your_account_id_here'
  && CF_API_TOKEN  !== 'your_api_token_here';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── AUTH + FEEDBACK ──────────────────────────────────────────────────────────
const sessions     = new Map(); // token → { user, createdAt }
const feedbackStore = [];       // [{ id, category, text, user, createdAt }]

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  if (!sessions.has(token)) return res.status(401).json({ error: 'Session expired' });
  req.user = sessions.get(token);
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const validUser = process.env.APP_USERNAME || 'akash';
  const validPass = process.env.APP_PASSWORD || 'edgelab2024';
  if (!username || !password || username !== validUser || password !== validPass) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = generateToken();
  sessions.set(token, { user: username, createdAt: Date.now() });
  res.json({ token, user: username });
});

app.post('/api/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization.slice(7);
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/verify', authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.user.user });
});

app.post('/api/feedback', authMiddleware, (req, res) => {
  const { category, text } = req.body || {};
  if (!text || text.trim().length < 3) return res.status(400).json({ error: 'Feedback too short' });
  const entry = {
    id: Date.now(),
    category: category || 'General',
    text: text.trim(),
    user: req.user.user,
    createdAt: new Date().toISOString(),
  };
  feedbackStore.push(entry);
  console.log(`[Feedback] ${entry.category}: ${entry.text.slice(0, 80)}`);
  res.json({ ok: true, id: entry.id });
});

app.get('/api/feedback', authMiddleware, (_req, res) => {
  res.json({ feedback: feedbackStore });
});

const DEMO_MODE = !USE_OPENROUTER && !USE_GROQ && !USE_GEMINI && !USE_CF;

// ─── ESPN LIVE FIXTURE FEED (no API key needed) ───────────────────────────────
const fixtureCache = { data: null, ts: 0 };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

const ESPN_ENDPOINTS = [
  { label: '⚽ LA LIGA',          url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard' },
  { label: '⚽ PREMIER LEAGUE',   url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard' },
  { label: '⚽ CHAMPIONS LEAGUE', url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard' },
  { label: '⚽ EUROPA LEAGUE',    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard' },
  { label: '⚽ BUNDESLIGA',       url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard' },
  { label: '⚽ SERIE A',          url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard' },
  { label: '⚽ LIGUE 1',          url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard' },
  { label: '⚽ MLS',              url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard' },
  { label: '🏀 NBA',              url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard' },
  { label: '🎾 ATP TENNIS',       url: 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard' },
  { label: '🎾 WTA TENNIS',       url: 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard' },
  { label: '🥊 UFC / MMA',        url: 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard' },
];

function parseESPNEvent(e) {
  const comp   = e.competitions?.[0];
  const home   = comp?.competitors?.find(c => c.homeAway === 'home');
  const away   = comp?.competitors?.find(c => c.homeAway === 'away');
  const status = e.status?.type?.description || 'Scheduled';
  const time   = e.date
    ? new Date(e.date).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' })
    : '??:??';

  // Odds if available
  const odds      = comp?.odds?.[0];
  const homeOdds  = odds?.homeTeamOdds?.moneyLine;
  const awayOdds  = odds?.awayTeamOdds?.moneyLine;
  const overUnder = odds?.overUnder;

  return {
    name:       e.name || '',
    home:       home?.team?.displayName || home?.team?.name || '',
    away:       away?.team?.displayName || away?.team?.name || '',
    homeRecord: home?.records?.[0]?.summary || '',
    awayRecord: away?.records?.[0]?.summary || '',
    homeScore:  home?.score ?? '',
    awayScore:  away?.score ?? '',
    time,
    status,
    homeOdds,
    awayOdds,
    overUnder,
    venue:      comp?.venue?.fullName || '',
  };
}

async function fetchESPN(endpoint) {
  const res = await fetch(endpoint.url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) return { label: endpoint.label, events: [] };
  const json   = await res.json();
  const events = (json.events || []).map(parseESPNEvent).filter(e => e.home && e.away);
  return { label: endpoint.label, events };
}

async function getLiveFixtures() {
  if (fixtureCache.data && Date.now() - fixtureCache.ts < CACHE_TTL_MS) {
    return fixtureCache.data;
  }

  const results = await Promise.allSettled(ESPN_ENDPOINTS.map(fetchESPN));
  const data = results
    .filter(r => r.status === 'fulfilled' && r.value.events.length > 0)
    .map(r => r.value);

  fixtureCache.data = data;
  fixtureCache.ts   = Date.now();
  return data;
}

function buildFixtureContext(fixtures) {
  const today = new Date().toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Toronto',
  });

  if (!fixtures || fixtures.length === 0) {
    return `\n\n=== ESPN FIXTURE DATA — ${today} ===\nNo events found for today. Base picks on general knowledge but clearly state no live data is available.\n=== END ===`;
  }

  const lines = [
    `\n=== LIVE ESPN DATA — ${today} (EST) ===`,
    'IMPORTANT: Use ONLY these real fixtures. Never invent or guess team names.',
    '',
  ];

  for (const league of fixtures) {
    lines.push(league.label);
    for (const e of league.events) {
      let line = `  ${e.time}  ${e.home}`;
      if (e.homeRecord) line += ` (${e.homeRecord})`;
      line += ` vs ${e.away}`;
      if (e.awayRecord) line += ` (${e.awayRecord})`;
      if (e.homeOdds)   line += `  |  ML: ${e.homeOdds > 0 ? '+' : ''}${e.homeOdds} / ${e.awayOdds > 0 ? '+' : ''}${e.awayOdds}`;
      if (e.overUnder)  line += `  |  O/U: ${e.overUnder}`;
      if (e.status !== 'Scheduled') line += `  [${e.status}]`;
      lines.push(line);
    }
    lines.push('');
  }

  lines.push('=== END ESPN FIXTURE DATA ===');
  return lines.join('\n');
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const EDGELAB_SYSTEM_PROMPT = `You are EdgeLab, an elite AI sports betting analyst. You deliver professional-grade, deeply researched picks with precise formatting every single time.

═══════════════════════════════════════
IDENTITY & STYLE
═══════════════════════════════════════
- Sharp, direct, data-driven — like a professional quant analyst managing client money
- Always use REAL fixture data provided. Never invent teams, scores, or matches.
- Every pick must be backed by stats, form, and logic — not guesswork
- Client location: Ontario, Canada (EST timezone) | Platform: Bet365

═══════════════════════════════════════
MANDATORY OUTPUT FORMAT — NEVER DEVIATE
═══════════════════════════════════════

For EVERY match analysis, use this EXACT structure:

### [EMOJI] [Home Team] vs [Away Team] — [Competition] | [Time] EST
**Form:** [Home Team]: W3 D1 L1 (last 5) | [Away Team]: W1 D2 L2 (last 5)
**H2H:** [e.g. "Last 5 meetings: Home wins 3, Draws 1, Away wins 1"]

| Market | Bet | Odds | Prob | Risk |
|--------|-----|------|------|------|
| [market] | [specific bet] | [1.XX] | [XX%] | ✅ Safe / ⚠️ Moderate / 🔴 Risky |

**COMBO:** [Bet A] + [Bet B] = **[combined odds]**
💰 Stake **$10** → Profit **$[X.XX]** | Win probability: **[XX%]**

**Why this works:**
• [Stat-backed reason 1]
• [Stat-backed reason 2]
• [Stat-backed reason 3]

**⚠️ Avoid:** [specific market] — [exact reason with stats]

---

═══════════════════════════════════════
SPORT-SPECIFIC DEEP ANALYSIS RULES
═══════════════════════════════════════

FOOTBALL / SOCCER:
- Always analyze: team form last 5-10 games, home/away record, goals scored/conceded avg, H2H
- Safe markets: Double Chance (covers 2 of 3 outcomes), Over 0.5 Goals (96%+ in top leagues), First Half Over 0.5
- Risky markets: BTTS (only 55-60% in most leagues), Exact Score, Under 1.5 (risky for attacking teams)
- Under 3.5 goals is RISKY for high-scoring teams — always flag it
- Double Chance + Over 0.5 goals = most reliable combo (~88-92% combined)
- Example: PSG vs Lens: Double Chance (PSG/Draw) + Over 0.5 Goals = 1.25 combined | Stake $10 → $2.50 profit

CRICKET T20 / IPL:
- NEVER suggest individual centuries (player scoring 100+) — probability <2%, it's a trap
- Team totals: "Both teams to score 100+" is safe (~85-88% in balanced T20 matchups)
- "Team NOT to score 100" only if team is clearly weak or conditions heavily favor bowlers
- Safe markets: No individual century (98%), Both teams 100+ runs (85-88%), Over 0.5 fours in first 10 overs (97%), Powerplay over 45.5 runs (79%)
- Analyze: team batting lineup strength, pitch conditions (batting/bowling friendly), toss impact, recent T20 form
- Example — RCB vs MI: Both teams 100+ = 1.58 | "RCB not to score 100" is RISKY unless MI pace attack dominated recently

NBA:
- Alt total over (line minus 12 pts) hits 85% — always offer this
- Alt ceiling under (line plus 8 pts) hits 91%
- Favorite alt spread +8.5 hits ~82%
- Analyze: pace of play, home/away splits, back-to-back games (massive fatigue factor), injury report

TENNIS:
- Top 5 seed ML in R1/R2 slam: 90%+ — near certain
- Favorite wins 1+ set: 96% — best safe tennis bet
- Over 19.5 total games: 74% — moderate
- Always check: surface (clay/grass/hard), head-to-head on that surface, recent form, ranking gap

UFC / BOXING:
- Only back heavy favorites with 70%+ implied probability
- Fight goes over 1.5 rounds (durable chins): 78%
- Decision specialist fight over 2.5 rounds: 72%
- AVOID: exact round, method of victory — these are sucker bets (<15% prob each)

═══════════════════════════════════════
SESSION TRACKER — Update after every bet
═══════════════════════════════════════
─────────────────────────────
EDGELAB LIVE DASHBOARD
─────────────────────────────
Date: [today]
Bankroll: $[starting] → $[current]
Daily target: $20 CAD
Target achieved: [YES / NO — $X remaining]
Bets placed: [N]
Won: [N] | Lost: [N] | Pending: [N]
P&L today: +$X / -$X
Suggested next stake: $[X]
Session status: [ON TRACK / BEHIND / TARGET HIT]
─────────────────────────────

STAKE FORMULA:
- Suggested stake = target remaining / (combo odds - 1)
- Never suggest more than 20% of current bankroll
- Always show: Stake $X → Profit $Y for a $10 base stake

═══════════════════════════════════════
SAFETY & QUALITY RULES
═══════════════════════════════════════
- Max 4 legs per parlay — more legs = compounding risk
- PASS if no stats support the pick
- PASS if key injury reported within 24hrs
- Always label each leg: ✅ Safe (85%+) | ⚠️ Moderate (70-84%) | 🔴 Risky (<70%)
- TILT ALERT: if 3 consecutive losses or 30%+ bankroll lost — tell client to stop immediately
- WEEKEND MODE: build morning / afternoon / evening splits for Saturday and Sunday

═══════════════════════════════════════
NATURAL LANGUAGE UNDERSTANDING — CRITICAL
═══════════════════════════════════════
You MUST understand casual, abbreviated, and imperfect messages exactly like Google search does.
Never ask the user to rephrase. Always interpret intent and respond fully.

Examples of casual messages and what they mean:
- "rcb vs mi" / "rcb mi" / "rcb today" → Analyse RCB vs MI IPL match with full picks table
- "la liga" / "la liga today" / "laliga" / "spain" → Show La Liga fixtures and picks
- "psg" / "psg today" / "psg lens" → Analyse PSG's next match
- "best bet tonight" / "tonight?" / "what to bet" → Show tonight's top opportunities
- "won!" / "win" / "got it" / "yes" → Last bet won — update dashboard
- "lost" / "nope" / "missed" / "lost it" → Last bet lost — update dashboard
- "how much" / "how much for 20?" / "stake?" → Calculate stake for $20 target
- "parlay" / "combo" / "build one" → Build cross-sport parlay
- "safe" / "safe plays" / "low risk" → Only safe 85%+ probability bets
- "fav" / "favorites" / "sure thing" → Strong favorites with 75%+ win probability
- "weekend" / "sat" / "sun" → Weekend card
- "cricket" / "ipl" / "t20" → IPL/cricket picks
- "nba" / "basketball" → NBA picks
- "tennis" → Tennis picks
- "ufc" / "mma" / "fight" → UFC picks
- "start" / "I have 100" / "100 dollars" / "starting with 50" → Start session
- "what's left" / "left?" / "remaining" / "target" → Dashboard + remaining target
- Any team name (e.g. "arsenal", "celtics", "kohli") → Analyse that team/player's match

Always infer sport from context. Always respond with a full analysis, never just "I don't understand."

Use REAL fixture data provided at the top of each request.
Never promise guaranteed wins. Always acknowledge variance.
If client chases losses, flag it hard and tell them to stop.`;

// ─── DEMO FALLBACK (no API key) ───────────────────────────────────────────────
const DEMO_RESPONSES = [
  {
    keywords: ['have', 'bankroll', 'today', 'mode', 'starting'],
    reply: (msg) => {
      const amount = msg.match(/\$?(\d+)/);
      const bank   = amount ? amount[1] : '100';
      return `─────────────────────────────
EDGELAB LIVE DASHBOARD
─────────────────────────────
Date: ${new Date().toLocaleDateString('en-CA')}
Bankroll: $${bank} → $${bank}
Daily target: $20 CAD
Target achieved: NO — $20.00 remaining
Bets placed: 0
Won: 0 | Lost: 0 | Pending: 0
P&L today: $0.00
Suggested next stake: $${(20 / (2.05 - 1)).toFixed(2)}
Session status: ON TRACK
─────────────────────────────

Session started. Bankroll locked at $${bank}.

⚠️ DEMO MODE — Add Cloudflare credentials to .env to get real AI picks + live SofaScore fixtures.
Free at: developers.cloudflare.com (no credit card needed)
Paste CF_ACCOUNT_ID and CF_API_TOKEN into the .env file, then restart.

Here's a sample card for now:

⚽ FOOTBALL — Premier League
• Arsenal vs Chelsea — Arsenal Win + Over 0.5 goals
  Odds: 1.72 | Prob: ~88% | Stake: $19.51 → Profit: $14.07

🏀 NBA
• Denver Nuggets ML (home fav) + Alt Total Over 198.5
  Odds: 1.85 | Prob: ~84% | Stake: $16.80 → Profit: $14.28

🎾 TENNIS
• Top-5 seed Alcaraz ML (R2)
  Odds: 1.22 | Prob: ~93% | Stake: $25.00 → Profit: $5.50`;
    }
  },
  {
    keywords: ["what's on", "today's card", "what is on", 'football', 'nba', 'tennis', 'cricket', 'ufc'],
    reply: () => `TODAY'S CARD — ${new Date().toLocaleDateString('en-CA')} (EST)

⚠️ DEMO MODE — Enable Groq for real SofaScore fixtures.

⚽ FOOTBALL
• 12:30 Arsenal vs Chelsea → Arsenal Win + O0.5 [1.68] 89%
• 15:00 Man City vs Liverpool → DC + O0.5 [1.45] 91%
• 17:30 Real Madrid vs Atletico → Real Win + O1.5 [1.72] 83%

🏏 IPL
• MI vs CSK — Both teams 100+ runs [1.62] 88%

🏀 NBA Playoffs
• Celtics vs Heat — Celtics Alt -3.5 [1.78] 84%

🎾 TENNIS
• Alcaraz to win 1+ set [1.05] 98%

─────────────
TOP PICK: Arsenal combo @ 1.68
Suggested stake for $20 target: $29.41`
  },
  {
    keywords: ['strong favorite', 'favorites'],
    reply: () => `STRONG FAVORITES — 75%+ WIN PROB

⚽ 91% — Arsenal (home) vs Chelsea
  Odds: 1.52 | Best combo: Win + O0.5 → 1.68

⚽ 88% — Man City vs Wolves
  Odds: 1.38 | Best combo: DC + O0.5 → 1.45

🎾 93% — Alcaraz vs qualifier (R2)
  Odds: 1.18 | Win 1+ set → 1.05

🏀 84% — Celtics (home) vs Heat
  Odds: 1.62 | Alt -3.5 → 1.78

─────────────
BEST COMBO: Arsenal Win + Alcaraz ML
Combined: 1.52 × 1.18 = 1.79 | ~85% prob
Stake $28.99 → Profit $22.53 ✓`
  },
  {
    keywords: ['parlay', 'cross-sport', 'combo'],
    reply: () => `CROSS-SPORT PARLAY — 4 LEGS

Leg 1 ⚽ Arsenal Win (home) .............. 1.52 [89%]
Leg 2 🏀 Celtics Alt -3.5 ................. 1.78 [84%]
Leg 3 🎾 Alcaraz wins 1+ set .............. 1.05 [98%]
Leg 4 🏏 IPL Over 0.5 fours (first 10 ov) . 1.18 [97%]

Combined odds: 2.99
Combined prob: ~71%
─────────────────────────────
Stake needed to hit $20: $10.05
Potential profit: $20.05 ✓

RISK: Medium-low. Biggest risk is the Arsenal result.
Recommendation: Place if Arsenal team news is clean.`
  },
  {
    keywords: ['won', 'win', 'bet won'],
    reply: () => {
      const pl  = (Math.random() * 18 + 5).toFixed(2);
      const rem = Math.max(0, 20 - parseFloat(pl)).toFixed(2);
      return `Bet won. Dashboard updated.

─────────────────────────────
EDGELAB LIVE DASHBOARD
─────────────────────────────
P&L today: +$${pl}
Target achieved: ${parseFloat(rem) <= 0 ? 'YES ✓' : `NO — $${rem} remaining`}
Bets placed: 1 | Won: 1 | Lost: 0
Session status: ${parseFloat(rem) <= 0 ? 'TARGET HIT' : 'ON TRACK'}
─────────────────────────────

${parseFloat(rem) <= 0
  ? '🎯 Target hit. Stop here. Lock in the $20. Come back tomorrow fresh.'
  : `$${rem} left. Next move:\n\n⚽ Man City DC + O0.5\nOdds: 1.45 | Stake: $${(parseFloat(rem) / 0.45).toFixed(2)} → Profit: $${rem}`}`;
    }
  },
  {
    keywords: ['lost', 'bet lost'],
    reply: () => `Bet lost. Dashboard updated.

─────────────────────────────
EDGELAB LIVE DASHBOARD
─────────────────────────────
P&L today: -$14.00
Target achieved: NO — $34.00 remaining
Bets placed: 1 | Won: 0 | Lost: 1
Session status: BEHIND — ADJUST
─────────────────────────────

One loss. Normal variance — do NOT chase.

⚠️ RULE: Stick to max 5% bankroll per bet.

Recovery pick:
🏀 Celtics vs Heat — Celtics ML
Odds: 1.62 | Scale stake to 5% bankroll max.`
  },
  {
    keywords: ["what's left", 'remaining', 'target', 'maximize'],
    reply: () => `DASHBOARD SNAPSHOT

P&L today: +$6.40
Remaining to target: $13.60
─────────────────────────────

To hit $20:

Option A — Single bet
• Arsenal Win + O1.5 (1.88)
  Stake: $15.56 → Profit: $13.61 ✓

Option B — 2-leg parlay
• Celtics ML (1.62) + Djokovic ML (1.15)
  Combined: 1.86 | Stake: $15.80 → Profit: $13.69 ✓

Option C — Conservative
• Man City DC + O0.5 (1.45)
  Stake: $30.22 → Profit: $13.60 ✓

Recommendation: Option A.`
  },
  {
    keywords: ['weekend', 'saturday', 'sunday'],
    reply: () => `WEEKEND CARD

─── SATURDAY ───────────────
MORNING
⚽ Bundesliga: Bayern vs Dortmund — Bayern Win + O1.5 [1.78] 83%

AFTERNOON
⚽ PL: Arsenal vs Chelsea — Arsenal [1.52] 89%
🎾 Wimbledon R2: Alcaraz ML [1.15] 93%

EVENING
🏀 NBA: Celtics vs Heat [1.62] 84%

─── SUNDAY ─────────────────
MORNING
🏏 IPL: MI vs CSK — Both 100+ [1.62] 88%

AFTERNOON
⚽ La Liga: Real Madrid vs Atletico [1.58] 85%

─────────────────────────────
Parlay 1 (Sat): Bayern + Arsenal + Alcaraz → 3.15 | Stake $8.45 → +$18.18
Parlay 2 (Sun): Real Madrid + MI combo   → 2.49 | Stake $9.80 → +$14.40`
  },
];

function getDemoReply(msg) {
  const lower = msg.toLowerCase();
  for (const item of DEMO_RESPONSES) {
    if (item.keywords.some(k => lower.includes(k))) {
      return typeof item.reply === 'function' ? item.reply(msg) : item.reply;
    }
  }
  return `EdgeLab received: "${msg}"

⚠️ DEMO MODE — real AI is one step away.

To unlock real AI answers powered by live SofaScore fixtures:

1. Go to dash.cloudflare.com → right sidebar → copy your Account ID
2. Go to dash.cloudflare.com/profile/api-tokens → Create Token → "Workers AI" template
3. Open the .env file and fill in:
   CF_ACCOUNT_ID=your_account_id_here
   CF_API_TOKEN=your_api_token_here
4. Restart the server

Uses Llama 3.3-70b — free, 10,000 requests/day, no credit card.`;
}

// ─── FOOTYBITE LINK GENERATOR ────────────────────────────────────────────────
function footybiteLink(home, away) {
  const slug = s => s
    .toLowerCase()
    .replace(/\s+(fc|sc|cf|ac|rc|sd|cd|ud|rcd|afc|bfc|sfc|utd|united|city|town|athletic|atletico)$/i, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
  return `https://www.footybite.do/${slug(home)}-vs-${slug(away)}/`
}

const LEAGUE_FOOTYBITE = {
  'LA LIGA':          'https://www.footybite.do/la-liga/',
  'PREMIER LEAGUE':   'https://www.footybite.do/premier-league/',
  'CHAMPIONS LEAGUE': 'https://www.footybite.do/champions-league/',
  'EUROPA LEAGUE':    'https://www.footybite.do/europa-league/',
  'BUNDESLIGA':       'https://www.footybite.do/bundesliga/',
  'SERIE A':          'https://www.footybite.do/serie-a/',
  'LIGUE 1':          'https://www.footybite.do/ligue-1/',
  'MLS':              'https://www.footybite.do/mls/',
}

// ─── FIXTURES ENDPOINT ───────────────────────────────────────────────────────
app.get('/api/fixtures', authMiddleware, async (_req, res) => {
  try {
    const raw = await getLiveFixtures()
    const enriched = raw.map(league => {
      const isSoccer = league.label.includes('⚽')
      const leagueKey = Object.keys(LEAGUE_FOOTYBITE).find(k => league.label.toUpperCase().includes(k))
      return {
        label:    league.label,
        sport:    isSoccer ? 'football' : league.label.includes('🏀') ? 'basketball' : league.label.includes('🎾') ? 'tennis' : league.label.includes('🥊') ? 'mma' : league.label.includes('🏏') ? 'cricket' : 'other',
        leagueUrl: isSoccer ? (LEAGUE_FOOTYBITE[leagueKey] || 'https://www.footybite.do/') : null,
        events: league.events.map(e => ({
          ...e,
          watchUrl: isSoccer ? footybiteLink(e.home, e.away) : null,
        })),
      }
    })
    res.json({ fixtures: enriched, ts: Date.now() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── AI CALL FUNCTIONS ────────────────────────────────────────────────────────

async function callOpenRouter(systemPrompt, messages) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://web-production-4aaf7.up.railway.app',
      'X-Title': 'EdgeLab',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      max_tokens: 2048,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'OpenRouter error');
  return data.choices[0].message.content;
}

async function callGroq(systemPrompt, messages) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2048,
      temperature: 0.7,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Groq error');
  return data.choices[0].message.content;
}

async function callGemini(systemPrompt, messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  // Gemini needs alternating user/model turns
  const geminiMsgs = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = geminiMsgs[geminiMsgs.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += '\n' + m.content;
    } else {
      geminiMsgs.push({ role, parts: [{ text: m.content }] });
    }
  }
  if (geminiMsgs[0]?.role === 'model') {
    geminiMsgs.unshift({ role: 'user', parts: [{ text: '(start)' }] });
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: geminiMsgs,
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Gemini error');
  return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
}

async function callCloudflare(systemPrompt, messages) {
  const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`;
  const res = await fetch(cfUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 2048,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.errors?.[0]?.message || 'Cloudflare AI error');
  return data.result.response;
}

// ─── CHAT ENDPOINT ────────────────────────────────────────────────────────────
app.post('/api/chat', authMiddleware, async (req, res) => {
  try {
    const { messages } = req.body;
    const lastMsg = messages[messages.length - 1]?.content || '';

    if (DEMO_MODE) {
      await new Promise(r => setTimeout(r, 700 + Math.random() * 500));
      return res.json({ message: getDemoReply(lastMsg) });
    }

    // ESPN fixture context
    let fixtureContext = '';
    const wantsFixtures = /today|card|fixture|match|game|on now|pick|parlay|favor|recommend|weekend|saturday|sunday/i.test(lastMsg);
    if (wantsFixtures) {
      try {
        const fixtures = await getLiveFixtures();
        fixtureContext = '\n\n' + buildFixtureContext(fixtures);
      } catch (e) {
        console.error('Fixture fetch error:', e.message);
      }
    }

    // User feedback suggestions
    let feedbackContext = '';
    if (feedbackStore.length > 0) {
      const recent = feedbackStore.slice(-8).map(f => `- [${f.category}] ${f.text}`).join('\n');
      feedbackContext = `\n\n═══════════════════════════════════════\nUSER IMPROVEMENT REQUESTS (apply these always):\n${recent}\n═══════════════════════════════════════`;
    }

    const systemPrompt = EDGELAB_SYSTEM_PROMPT + fixtureContext + feedbackContext;
    let reply = '';

    if (USE_OPENROUTER) {
      reply = await callOpenRouter(systemPrompt, messages);
    } else if (USE_GROQ) {
      reply = await callGroq(systemPrompt, messages);
    } else if (USE_GEMINI) {
      reply = await callGemini(systemPrompt, messages);
    } else {
      reply = await callCloudflare(systemPrompt, messages);
    }

    res.json({ message: reply });

  } catch (error) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: 'AI error: ' + error.message });
  }
});

// ─── STATUS ENDPOINT ──────────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  const model = DEMO_MODE        ? 'demo'
    : USE_OPENROUTER ? 'Gemini 2.0 Flash (OpenRouter)'
    : USE_GROQ       ? 'Llama 3.3-70b (Groq)'
    : USE_GEMINI     ? 'Gemini 2.0 Flash + Google Search'
    : 'Llama 3.3-70b (Cloudflare AI)';
  res.json({ demo: DEMO_MODE, model });
});

app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`EdgeLab running on http://localhost:${PORT}`);
  if (DEMO_MODE)           console.log('⚠️  Demo mode — add OPENROUTER_API_KEY to .env');
  else if (USE_OPENROUTER) console.log('✅  Gemini 2.0 Flash via OpenRouter + ESPN live fixtures');
  else if (USE_GROQ)       console.log('✅  Groq Llama 3.3-70b + ESPN live fixtures');
  else if (USE_GEMINI)     console.log('✅  Gemini 2.0 Flash + Google Search + ESPN live fixtures');
  else                     console.log('✅  Cloudflare Workers AI + ESPN live fixtures');
});
