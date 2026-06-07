import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

// ── Animated field lines background ─────────────────────────
function FieldLines() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1200 800"
    >
      {Array.from({ length: 11 }, (_, i) => (
        <line key={i} x1="0" y1={i * 80} x2="1200" y2={i * 80} stroke="white" strokeWidth="1.5" />
      ))}
      {Array.from({ length: 11 }, (_, i) =>
        Array.from({ length: 20 }, (_, j) => (
          <line key={`h-${i}-${j}`}
            x1={j * 60 + 30} y1={i * 80 - 8}
            x2={j * 60 + 30} y2={i * 80 + 8}
            stroke="white" strokeWidth="1" />
        ))
      )}
      <line x1="600" y1="0" x2="600" y2="800" stroke="white" strokeWidth="2" />
      <rect x="0" y="0" width="100" height="800" fill="white" fillOpacity="0.03" />
      <rect x="1100" y="0" width="100" height="800" fill="white" fillOpacity="0.03" />
      <line x1="50" y1="300" x2="50" y2="500" stroke="white" strokeWidth="3" />
      <line x1="50" y1="380" x2="20" y2="300" stroke="white" strokeWidth="2" />
      <line x1="50" y1="380" x2="80" y2="300" stroke="white" strokeWidth="2" />
      <line x1="1150" y1="300" x2="1150" y2="500" stroke="white" strokeWidth="3" />
      <line x1="1150" y1="380" x2="1120" y2="300" stroke="white" strokeWidth="2" />
      <line x1="1150" y1="380" x2="1180" y2="300" stroke="white" strokeWidth="2" />
    </svg>
  )
}

// ── Scrolling ticker ─────────────────────────────────────────
const NFL_TEAMS = ['AFC NORTH', 'RAVENS', 'STEELERS', 'BENGALS', 'BROWNS', 'AFC EAST', 'BILLS', 'DOLPHINS', 'PATRIOTS', 'JETS', 'AFC SOUTH', 'TEXANS', 'COLTS', 'JAGUARS', 'TITANS', 'AFC WEST', 'CHIEFS', 'RAIDERS', 'CHARGERS', 'BRONCOS', 'NFC NORTH', 'BEARS', 'LIONS', 'PACKERS', 'VIKINGS', 'NFC EAST', 'COWBOYS', 'EAGLES', 'GIANTS', 'COMMANDERS', 'NFC SOUTH', 'BUCCANEERS', 'FALCONS', 'SAINTS', 'PANTHERS', 'NFC WEST', '49ERS', 'SEAHAWKS', 'RAMS', 'CARDINALS']
const CFB_TEAMS = ['SEC', 'ALABAMA', 'GEORGIA', 'LSU', 'TENNESSEE', 'TEXAS', 'BIG TEN', 'MICHIGAN', 'OHIO STATE', 'PENN STATE', 'OREGON', 'BIG 12', 'KANSAS STATE', 'OKLAHOMA', 'TEXAS TECH', 'ACC', 'CLEMSON', 'FSU', 'MIAMI', 'PAC-12', 'UTAH', 'WASHINGTON', 'USC', 'NOTRE DAME', 'FLORIDA STATE', 'AUBURN', 'OLE MISS']

function Ticker({ teams, reverse = false, speed = 40 }: { teams: string[], reverse?: boolean, speed?: number }) {
  const doubled = [...teams, ...teams, ...teams]
  return (
    <div className="overflow-hidden whitespace-nowrap select-none">
      <div style={{
        display: 'inline-flex',
        gap: '1.5rem',
        alignItems: 'center',
        animation: `${reverse ? 'tickerRight' : 'tickerLeft'} ${speed}s linear infinite`,
      }}>
        {doubled.map((t, i) => (
          <span key={i} className="font-cond font-black text-xs uppercase tracking-[0.2em] text-white/20">
            {t} <span className="text-white/10">·</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Feature card ─────────────────────────────────────────────
function FeatureCard({ icon, title, desc }: { icon: string, title: string, desc: string }) {
  return (
    <div className="group bg-field-800/60 border border-field-700 rounded-2xl p-6 hover:border-gold/30 hover:bg-field-800 transition-all duration-300 hover:-translate-y-1">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="font-cond font-black text-lg uppercase tracking-wider text-white mb-2">{title}</h3>
      <p className="text-field-400 text-sm leading-relaxed">{desc}</p>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────
export function LandingPage() {
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen bg-field-950 text-white overflow-x-hidden">
      <style>{`
        @keyframes tickerLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        @keyframes tickerRight {
          0% { transform: translateX(-33.333%); }
          100% { transform: translateX(0); }
        }
        @keyframes floatA {
          0%, 100% { transform: translateY(0px) rotate(-3deg); }
          50% { transform: translateY(-14px) rotate(3deg); }
        }
        @keyframes floatB {
          0%, 100% { transform: translateY(0px) rotate(2deg); }
          50% { transform: translateY(-10px) rotate(-2deg); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .anim-fade-up {
          opacity: 0;
          animation: fadeUp 0.65s ease forwards;
        }
        .d1 { animation-delay: 0.05s; }
        .d2 { animation-delay: 0.18s; }
        .d3 { animation-delay: 0.32s; }
        .d4 { animation-delay: 0.46s; }
        .d5 { animation-delay: 0.60s; }
        .d6 { animation-delay: 0.75s; }
        .float-a { animation: floatA 4.5s ease-in-out infinite; }
        .float-b { animation: floatB 3.8s ease-in-out infinite; }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-field-950/85 backdrop-blur-md border-b border-white/[0.06]">
        <div className="font-cond font-black text-xl uppercase tracking-wider">
          <span className="text-gold">Gridiron</span>
          <span className="text-white"> United</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/auth')}
            className="font-cond font-bold text-sm uppercase tracking-wider text-field-400 hover:text-white transition-colors px-4 py-2 hidden sm:block"
          >
            Sign In
          </button>
          <button
            onClick={() => navigate('/auth')}
            className="font-cond font-bold text-sm uppercase tracking-wider px-5 py-2.5 rounded-xl bg-gold text-field-950 hover:bg-gold-light transition-all hover:scale-105 active:scale-100"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-20 pb-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-field-950 via-[#0d1520] to-field-950" />
        <FieldLines />
        {/* glow orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full blur-[150px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(245,166,35,0.07) 0%, transparent 70%)' }}
        />
        {/* floating emojis */}
        <div className="absolute top-[22%] left-[7%]  text-5xl opacity-[0.18] float-a">🏈</div>
        <div className="absolute top-[30%] right-[7%] text-4xl opacity-[0.14] float-b" style={{ animationDelay: '1.2s' }}>🏟</div>
        <div className="absolute bottom-[28%] left-[11%] text-3xl opacity-[0.10] float-a" style={{ animationDelay: '2.1s' }}>🏆</div>
        <div className="absolute bottom-[22%] right-[10%] text-4xl opacity-[0.13] float-b" style={{ animationDelay: '0.6s' }}>⭐</div>

        <div className={`relative z-10 text-center max-w-5xl mx-auto transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          {/* League badges */}
          <div className="anim-fade-up d1 flex items-center justify-center gap-3 mb-7">
            <span className="font-cond font-black text-sm uppercase tracking-widest px-3 py-1.5 rounded-lg bg-nfl/20 text-nfl border border-nfl/30">NFL</span>
            <span className="text-field-600 font-black text-lg">+</span>
            <span className="font-cond font-black text-sm uppercase tracking-widest px-3 py-1.5 rounded-lg bg-cfb/20 text-cfb border border-cfb/30">College Football</span>
          </div>

          {/* Headline */}
          <h1 className="anim-fade-up d2 font-cond font-black uppercase leading-[0.9] mb-7">
            <span className="block text-[clamp(3rem,10vw,7rem)] text-white tracking-tight">Fantasy Football</span>
            <span className="block text-[clamp(3rem,10vw,7rem)] text-gold  tracking-tight">United</span>
          </h1>

          {/* Subheadline */}
          <p className="anim-fade-up d3 text-field-300 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-3">
            The only platform that lets you draft <span className="text-white font-bold">NFL pros</span> and{' '}
            <span className="text-cfb font-bold">college football players</span> on the same roster.
            Build the ultimate unified team.
          </p>
          <p className="anim-fade-up d4 text-field-500 text-sm md:text-base max-w-xl mx-auto leading-relaxed mb-10">
            Redraft · Keeper · Dynasty · Pick'Em — all in one place, completely free.
          </p>

          {/* CTAs */}
          <div className="anim-fade-up d5 flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={() => navigate('/auth')}
              className="w-full sm:w-auto font-cond font-black text-base uppercase tracking-widest px-10 py-4 rounded-xl bg-gold text-field-950 hover:bg-gold-light transition-all hover:scale-105 hover:shadow-[0_8px_40px_rgba(245,166,35,0.4)] active:scale-100"
            >
              Start Playing Free
            </button>
            <button
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto font-cond font-bold text-sm uppercase tracking-widest px-8 py-4 rounded-xl border border-field-600 text-field-400 hover:border-field-400 hover:text-white transition-all"
            >
              See All Features ↓
            </button>
          </div>

          {/* Stats */}
          <div className="anim-fade-up d6 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl mx-auto border-t border-field-700/40 pt-10">
            {[
              { n: '32', l: 'NFL Teams' },
              { n: '130+', l: 'CFB Programs' },
              { n: '4', l: 'League Formats' },
              { n: '18', l: "Pick'Em Weeks" },
            ].map(({ n, l }) => (
              <div key={l} className="text-center">
                <div className="font-cond font-black text-4xl md:text-5xl text-gold leading-none">{n}</div>
                <div className="font-cond font-bold text-[10px] uppercase tracking-widest text-field-500 mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-5 h-8 rounded-full border border-field-700 flex items-start justify-center pt-1.5">
            <div className="w-1 h-2 bg-field-600 rounded-full" />
          </div>
        </div>
      </section>

      {/* ── TICKER ──────────────────────────────────────── */}
      <div className="py-3 bg-field-900 border-y border-field-800 space-y-2.5 overflow-hidden">
        <Ticker teams={NFL_TEAMS} reverse={false} speed={50} />
        <Ticker teams={CFB_TEAMS} reverse={true}  speed={45} />
      </div>

      {/* ── THE IDEA ────────────────────────────────────── */}
      <section className="relative py-28 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/10 border border-gold/20 text-gold text-xs font-bold uppercase tracking-widest mb-8">
            The Idea
          </div>
          <h2 className="font-cond font-black text-4xl md:text-5xl uppercase tracking-tight text-white mb-8 leading-tight">
            Why stop at the NFL?
          </h2>
          <div className="space-y-5 text-left max-w-3xl mx-auto">
            <p className="text-field-300 text-lg leading-relaxed">
              Fantasy football has always been limited to professional players. But millions of fans follow college football just as closely — tracking Heisman candidates, rooting for their alma mater, watching the next generation of stars develop before they go pro.
            </p>
            <p className="text-field-300 text-lg leading-relaxed">
              <span className="text-gold font-bold">Gridiron United</span> was built to bridge that gap. Draft a Heisman Trophy winner alongside a Super Bowl MVP. Scout prospects before the NFL Draft. Build dynasty rosters that evolve as your college stars make the leap to the pros.
            </p>
            <p className="text-field-300 text-lg leading-relaxed">
              It's the most complete football experience in fantasy — because football doesn't start in September and doesn't stop at the NFL.
            </p>
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────── */}
      <section id="features" className="py-24 px-6 bg-field-900/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-nfl/10 border border-nfl/20 text-nfl text-xs font-bold uppercase tracking-widest mb-6">
              Features
            </div>
            <h2 className="font-cond font-black text-4xl md:text-5xl uppercase tracking-tight text-white">
              Everything you need
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard icon="🏈" title="NFL + CFB Players"
              desc="Draft from a unified pool of NFL pros and college football players. Set your league to NFL only, CFB only, or a full combined player pool." />
            <FeatureCard icon="🏆" title="4 League Formats"
              desc="Redraft for classic annual leagues. Keeper to retain your stars. Dynasty for long-term roster building. Pick'Em for weekly game predictions." />
            <FeatureCard icon="🎯" title="Live Draft Room"
              desc="Real-time drafting with live countdown clock, auto-draft, player queue, pick board, and AI-powered recommendations for every pick." />
            <FeatureCard icon="🧪" title="Mock Draft Hub"
              desc="Practice your draft strategy against AI opponents before the real thing. Test different approaches and enter draft day prepared." />
            <FeatureCard icon="📡" title="Live Scores"
              desc="Real-time NFL and CFB scores with quarter-by-quarter updates, possession tracking, red zone alerts, and betting spreads." />
            <FeatureCard icon="📊" title="Pick'Em Mode"
              desc="Pick every NFL game weekly with live spread and win probability data. Compete on a leaderboard with a combined-score tiebreaker." />
            <FeatureCard icon="👥" title="Social Features"
              desc="Add friends, send direct messages, and track rivals across leagues. Your network, your competition." />
            <FeatureCard icon="⚙️" title="Commissioner Tools"
              desc="Full control over scoring, roster settings, draft scheduling, pick deadlines, and trade management. Run your league your way." />
            <FeatureCard icon="🤖" title="AI Roster Analysis"
              desc="Get AI-powered weekly roster advice — who to start, trade, or drop — based on your specific scoring settings and matchups." />
          </div>
        </div>
      </section>

      {/* ── LEAGUE FORMATS ──────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="font-cond font-black text-4xl md:text-5xl uppercase tracking-tight text-white mb-3">
              Pick your format
            </h2>
            <p className="text-field-400 text-lg">Four ways to compete. One platform.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { emoji: '🔄', title: 'Redraft', tag: 'Classic', tagCls: 'bg-nfl/20 text-nfl',
                desc: 'Everyone starts fresh every season. Pure strategy, no carryover. Draft your team, manage your roster, win the championship.' },
              { emoji: '🔒', title: 'Keeper', tag: 'Strategic', tagCls: 'bg-gold/20 text-gold',
                desc: 'Keep 1–3 of your best players from the prior season. Balances annual draft excitement with smart long-term roster planning.' },
              { emoji: '👑', title: 'Dynasty', tag: 'Long-Term', tagCls: 'bg-cfb/20 text-cfb',
                desc: 'Keep your entire roster forever. College rookies become NFL stars on your team. Build a dynasty that spans years — or decades.' },
              { emoji: '🎯', title: "Pick'Em", tag: 'Predictions', tagCls: 'bg-emerald-500/20 text-emerald-400',
                desc: "Pick the winner of every NFL game each week. Live odds and win probabilities guide your picks. Tiebreaker: predict the combined final score." },
            ].map(({ emoji, title, tag, tagCls, desc }) => (
              <div key={title} className="bg-field-800 border border-field-700 rounded-2xl p-6 hover:border-field-500 transition-all">
                <div className="flex items-start gap-4">
                  <div className="text-4xl shrink-0 mt-0.5">{emoji}</div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-cond font-black text-xl uppercase tracking-wider text-white">{title}</h3>
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${tagCls}`}>{tag}</span>
                    </div>
                    <p className="text-field-400 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────── */}
      <section className="relative py-28 px-6 overflow-hidden">
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, rgba(245,166,35,0.08) 0%, transparent 65%)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-field-900/30 to-transparent" />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="text-7xl mb-6 float-a" style={{ display: 'inline-block' }}>🏈</div>
          <h2 className="font-cond font-black text-5xl md:text-7xl uppercase tracking-tight text-white mb-4 leading-none">
            Ready to draft?
          </h2>
          <p className="text-field-300 text-lg mb-10 max-w-xl mx-auto">
            Create your league, invite your friends, and experience fantasy football the way it was meant to be played — with the full world of football at your fingertips.
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="font-cond font-black text-lg uppercase tracking-widest px-14 py-5 rounded-xl bg-gold text-field-950 hover:bg-gold-light transition-all hover:scale-105 hover:shadow-[0_14px_50px_rgba(245,166,35,0.45)] active:scale-100"
          >
            Create Free Account
          </button>
          <p className="text-field-600 text-xs mt-5 uppercase tracking-widest">No credit card · Free forever</p>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────── */}
      <footer className="bg-field-950 border-t border-field-800 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-cond font-black text-lg uppercase tracking-wider">
            <span className="text-gold">Gridiron</span>
            <span className="text-white"> United</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-cond font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-cfb/20 text-cfb border border-cfb/20">CFB</span>
            <span className="font-cond font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-nfl/20 text-nfl border border-nfl/20">NFL</span>
          </div>
          <p className="text-field-600 text-xs text-center sm:text-right">
            Fantasy football reimagined — pros + prospects, one roster.
          </p>
        </div>
      </footer>
    </div>
  )
}
