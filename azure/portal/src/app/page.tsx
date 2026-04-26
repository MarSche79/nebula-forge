import {
  Sparkles,
  Rocket,
  Bot,
  ShieldCheck,
  Atom,
  ArrowRight,
  LogIn,
} from 'lucide-react';
import MarketingNav from '@/components/MarketingNav';
import Footer from '@/components/Footer';
import { AGENTS } from '@/lib/agents';

export const metadata = { title: 'Nebula Forge — Beyond the Frontier' };

const HEADLINE_STATS = [
  { label: 'Crew aboard',         value: '217' },
  { label: 'Departments',         value: '9'   },
  { label: 'Active missions',     value: '12'  },
  { label: 'Sectors operational', value: '98%' },
];

const PILLARS = [
  {
    icon: Atom,
    title: 'Materials & Mining',
    body: 'Carbonaceous chondrites, ice hydrates, rare-earth volatiles — sampled, classified, and refined on-site by an autonomous lab pipeline.',
    accent: 'var(--primary)',
  },
  {
    icon: Rocket,
    title: 'Deep-Space Operations',
    body: 'A small fleet of long-haul shuttles and survey craft, planned and dispatched from a unified command bridge with route-optimised AI navigation.',
    accent: 'var(--accent)',
  },
  {
    icon: ShieldCheck,
    title: 'Safety & Life-Support',
    body: 'Triple-redundant life support, real-time radiation monitoring, and a safety officer that escalates before humans need to react.',
    accent: 'var(--success)',
  },
  {
    icon: Bot,
    title: 'AI-First Workforce',
    body: 'Every department has a specialist agent. The Master Agent routes any question to the right one — your crew works with AI, not around it.',
    accent: 'var(--warning)',
  },
];

export default function LandingPage() {
  return (
    <>
      <MarketingNav />

      {/* HERO */}
      <section
        id="hero"
        className="relative min-h-[92vh] flex items-center pt-20 pb-16 overflow-hidden"
      >
        <BackgroundOrbs />

        <div className="container-nf relative z-10 grid lg:grid-cols-[1.2fr_1fr] gap-12 items-center">
          <div>
            <span className="section-label mb-6">
              <Sparkles size={12} /> Crewed station · Sector 7 · 2087
            </span>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.04] tracking-tight">
              Build the future, <br />
              <span className="text-highlight">beyond the frontier.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted max-w-xl">
              Nebula Forge is a research and mining station operating at the
              edge of the heliosphere. We mine the asteroid belt, classify
              alien materials, and chart routes nobody has flown — with
              a crew of 217 humans and a workforce of nine specialist AI
              agents working alongside them.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/.auth/login/aad?post_login_redirect_uri=/command-center"
                className="btn-primary btn-lg"
              >
                <LogIn size={18} /> Crew Sign-In
              </a>
              <a href="#mission" className="btn-outline btn-lg">
                Learn more <ArrowRight size={16} />
              </a>
            </div>

            <div
              className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 pt-8"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              {HEADLINE_STATS.map((s) => (
                <div key={s.label} className="text-center md:text-left">
                  <div
                    className="text-3xl md:text-4xl font-extrabold"
                    style={{ color: 'var(--primary)' }}
                  >
                    {s.value}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-widest text-dim">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <HeroBadge />
        </div>
      </section>

      {/* MISSION */}
      <section id="mission" className="py-24 relative">
        <div className="container-nf grid lg:grid-cols-[1fr_1fr] gap-12 items-center">
          <div>
            <span className="section-label mb-4">Our mission</span>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              A station built to <span className="text-highlight">last decades</span>,
              not quarters.
            </h2>
            <p className="mt-5 text-base md:text-lg text-muted">
              Nebula Forge was commissioned in 2079 as humanity&apos;s first
              fully-autonomous deep-space industrial outpost. The station
              processes 14,000 tonnes of asteroid ore per year, runs 40+
              concurrent science experiments, and re-supplies four downstream
              colonies. We do that with a tiny crew and a lot of intent.
            </p>
            <p className="mt-4 text-base md:text-lg text-muted">
              Every system aboard — from the fusion reactor to the hydroponics
              bay — is monitored, planned, and optimised by a specialist agent.
              Humans set the strategy; the agents handle the second-by-second.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className="p-5"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    backdropFilter: 'blur(14px) saturate(1.2)',
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center w-10 h-10 rounded-md mb-3"
                    style={{
                      background: `${p.accent}15`,
                      border: `1px solid ${p.accent}40`,
                      color: p.accent,
                    }}
                  >
                    <Icon size={18} />
                  </span>
                  <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--text)' }}>
                    {p.title}
                  </div>
                  <p className="text-[13px] mt-1.5 text-muted leading-relaxed">{p.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SYSTEMS / DEPARTMENTS */}
      <section id="systems" className="py-24 relative">
        <div className="container-nf">
          <div className="flex flex-col items-start md:items-center md:text-center mb-12">
            <span className="section-label mb-4">Departments</span>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Nine specialists, <span className="text-highlight">one station</span>
            </h2>
            <p className="mt-4 max-w-2xl text-base md:text-lg text-muted">
              Each department is operated by an AI agent with its own data
              store and tool belt. They coordinate through a single Master
              Agent — the one your crew talks to.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map((a) => (
              <div
                key={a.id}
                className="p-5 transition group"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  backdropFilter: 'blur(14px) saturate(1.2)',
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex items-center justify-center w-10 h-10 rounded-md text-lg"
                    style={{
                      background: `${a.color}15`,
                      border: `1px solid ${a.color}40`,
                    }}
                    aria-hidden
                  >
                    {a.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--text)' }}>
                      {a.name}
                    </div>
                    <div className="text-[11px] uppercase tracking-widest" style={{ color: a.color }}>
                      {a.shortName}
                    </div>
                  </div>
                </div>
                <p className="text-[13px] mt-3 text-muted leading-relaxed">
                  {a.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FLEET / FIGURES */}
      <section id="fleet" className="py-24 relative">
        <div className="container-nf">
          <div
            className="p-8 md:p-12"
            style={{
              background: 'linear-gradient(135deg, rgba(14,138,181,0.10), rgba(98,70,214,0.10))',
              border: '1px solid var(--primary-border)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10 items-center">
              <div>
                <span className="section-label mb-4">By the numbers</span>
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                  Operating a station is a <span className="text-highlight">numbers game</span>.
                </h2>
                <p className="mt-3 text-muted">
                  Power, mass, oxygen, and reaction time. Nebula Forge has
                  flown 460 missions and zero life-support failures since
                  commissioning — a record we plan to keep.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Tonnes ore / yr',    value: '14,000' },
                  { label: 'Missions flown',     value: '460' },
                  { label: 'Reactor uptime',     value: '99.97%' },
                  { label: 'Active experiments', value: '42' },
                  { label: 'Colonies served',    value: '4' },
                  { label: 'Days in orbit',      value: '2,930' },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="p-4"
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div className="text-2xl font-extrabold" style={{ color: 'var(--primary)' }}>
                      {s.value}
                    </div>
                    <div className="text-[11px] uppercase tracking-widest text-dim mt-1">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CREW CTA */}
      <section id="crew" className="py-24 relative">
        <div className="container-nf">
          <div
            className="p-10 md:p-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-8"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              backdropFilter: 'blur(14px) saturate(1.2)',
            }}
          >
            <div className="max-w-2xl">
              <span className="section-label mb-4">Crew sign-in</span>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Already aboard? <span className="text-highlight">Open the Command Center.</span>
              </h2>
              <p className="mt-3 text-muted">
                Sign in with your Nebula Forge identity to enter the Command
                Center and your live mission-control dashboard. The Master
                Agent is standing by to route your next question.
              </p>
            </div>
            <a
              href="/.auth/login/aad?post_login_redirect_uri=/command-center"
              className="btn-primary btn-lg"
            >
              <LogIn size={18} /> Sign In as Crew
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

function BackgroundOrbs() {
  return (
    <>
      <div
        aria-hidden
        className="absolute -z-10 rounded-full blur-3xl opacity-50"
        style={{
          width: 620,
          height: 620,
          right: '-160px',
          top: '8%',
          background:
            'radial-gradient(circle, rgba(14,138,181,0.32) 0%, rgba(98,70,214,0.18) 40%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="absolute -z-10 rounded-full blur-3xl opacity-40"
        style={{
          width: 380,
          height: 380,
          left: '-120px',
          bottom: '0%',
          background:
            'radial-gradient(circle, rgba(98,70,214,0.20) 0%, transparent 70%)',
        }}
      />
    </>
  );
}

function HeroBadge() {
  return (
    <div className="hidden lg:flex justify-center">
      <div className="relative" style={{ width: 380, height: 380 }}>
        {/* Outer glow */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 90deg, var(--primary) 0deg, var(--accent) 180deg, var(--primary) 360deg)',
            opacity: 0.18,
            filter: 'blur(40px)',
          }}
        />
        {/* Mid ring (rotates) */}
        <div
          className="absolute inset-6 rounded-full"
          style={{
            border: '1px dashed var(--primary-border)',
            animation: 'nf-spin 60s linear infinite',
          }}
        />
        {/* Inner orb */}
        <div
          className="absolute inset-16 rounded-full flex items-center justify-center"
          style={{
            background:
              'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.55), var(--primary) 60%, var(--primary-dark) 100%)',
            boxShadow:
              '0 30px 80px rgba(14,138,181,0.45), inset 0 -10px 30px rgba(0,0,0,0.25)',
          }}
        >
          <div className="text-center px-6">
            <div className="text-[10px] uppercase tracking-[0.4em] text-white/70">
              Sector 7 · Live
            </div>
            <div className="mt-2 text-3xl font-extrabold text-white">98%</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/85">
              Systems Nominal
            </div>
          </div>
        </div>

        {/* Orbit dots */}
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="absolute"
            style={{
              top: '50%',
              left: '50%',
              width: 10,
              height: 10,
              marginLeft: -5,
              marginTop: -5,
              borderRadius: '50%',
              background: i % 2 === 0 ? 'var(--primary)' : 'var(--accent)',
              transform: `rotate(${i * 90}deg) translateX(170px)`,
              transformOrigin: 'center',
              boxShadow: `0 0 18px ${i % 2 === 0 ? 'var(--primary)' : 'var(--accent)'}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
