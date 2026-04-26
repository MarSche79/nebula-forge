import {
  Activity,
  Zap,
  Rocket,
  FlaskConical,
  ShieldAlert,
  Users,
  Beaker,
  Radio,
} from 'lucide-react';
import AppNav from '@/components/AppNav';
import { getCrewUser } from '@/lib/crewUser';
import {
  SYSTEMS,
  POWER_GRID,
  MISSIONS,
  EXPERIMENTS,
  INCIDENTS,
  CREW_SUMMARY,
  SAMPLES,
  COMMS,
  STATION_HEADLINE_STATS,
} from '@/lib/stationData';

export const metadata = { title: 'Dashboard · Nebula Forge' };

const SEVERITY_COLOR: Record<string, string> = {
  low:      'var(--text-muted)',
  medium:   'var(--warning)',
  high:     'var(--warning)',
  critical: 'var(--danger)',
};

const STATUS_COLOR: Record<string, string> = {
  nominal:  'var(--success)',
  degraded: 'var(--warning)',
  critical: 'var(--danger)',
};

const PRIORITY_COLOR: Record<string, string> = {
  routine:  'var(--text-muted)',
  priority: 'var(--primary)',
  flash:    'var(--danger)',
};

export default async function DashboardPage() {
  const user = await getCrewUser();

  return (
    <>
      <AppNav displayName={user?.name} />
      <main className="container-nf py-8">
        <header className="mb-8">
          <span className="section-label mb-3"><Activity size={12} /> Mission Control · Live</span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Station <span className="text-highlight">Dashboard</span>
          </h1>
          <p className="mt-2 text-sm text-muted max-w-2xl">
            Engineering, science, and operations telemetry across the Nebula Forge
            station. Aggregated from the nine departmental agents.
          </p>
        </header>

        {/* Headline KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {STATION_HEADLINE_STATS.map((s, idx) => (
            <KpiCard key={s.label} label={s.label} value={s.value} sub={s.sub} index={idx} />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Station systems */}
          <Widget icon={Activity} title="Station Systems" subtitle="Live health of core subsystems" className="lg:col-span-2">
            <div className="space-y-3">
              {SYSTEMS.map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="w-1.5 h-10 rounded-full" style={{ background: STATUS_COLOR[s.status] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                        {s.name}
                      </span>
                      <span className="text-xs text-dim">{s.lastCheck}</span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden"
                      style={{ background: 'var(--bg-glass)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${s.health}%`,
                          background:
                            s.health >= 90
                              ? 'var(--success)'
                              : s.health >= 75
                              ? 'var(--primary)'
                              : 'var(--warning)',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                  <div
                    className="text-sm font-bold w-12 text-right"
                    style={{ color: STATUS_COLOR[s.status] }}
                  >
                    {s.health}%
                  </div>
                </div>
              ))}
            </div>
          </Widget>

          {/* Crew summary */}
          <Widget icon={Users} title="Crew" subtitle={`${CREW_SUMMARY.total} total souls aboard`}>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-5xl font-extrabold" style={{ color: 'var(--primary)' }}>
                {CREW_SUMMARY.onDuty}
              </span>
              <span className="text-sm text-muted">on duty</span>
            </div>
            <CrewBar
              data={[
                { label: 'On Duty',     value: CREW_SUMMARY.onDuty,     color: 'var(--success)' },
                { label: 'On Leave',    value: CREW_SUMMARY.onLeave,    color: 'var(--primary)' },
                { label: 'Medical',     value: CREW_SUMMARY.medical,    color: 'var(--warning)' },
                { label: 'Off-Station', value: CREW_SUMMARY.offStation, color: 'var(--text-dim)' },
              ]}
              total={CREW_SUMMARY.total}
            />
          </Widget>

          {/* Power grid */}
          <Widget icon={Zap} title="Power Grid" subtitle="Generation vs consumption per sector" className="lg:col-span-2">
            <div className="space-y-3">
              {POWER_GRID.map((p) => {
                const consumedPct = (p.consumed / p.capacity) * 100;
                const generatedPct = (p.generated / p.capacity) * 100;
                const headroom = p.generated - p.consumed;
                return (
                  <div key={p.sector}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                        {p.sector}
                      </span>
                      <span className="text-xs text-dim font-mono">
                        {p.consumed} / {p.generated} MW
                        <span
                          className="ml-2 font-bold"
                          style={{
                            color: headroom > 50 ? 'var(--success)' : headroom > 0 ? 'var(--warning)' : 'var(--danger)',
                          }}
                        >
                          {headroom >= 0 ? '+' : ''}{headroom}
                        </span>
                      </span>
                    </div>
                    <div
                      className="relative h-2 w-full rounded-full overflow-hidden"
                      style={{ background: 'var(--bg-glass)' }}
                    >
                      <div
                        className="absolute top-0 left-0 h-full rounded-full"
                        style={{
                          width: `${generatedPct}%`,
                          background: 'var(--primary-glow)',
                          border: '1px solid var(--primary-border)',
                        }}
                      />
                      <div
                        className="absolute top-0 left-0 h-full rounded-full"
                        style={{
                          width: `${consumedPct}%`,
                          background: consumedPct > generatedPct
                            ? 'var(--danger)'
                            : 'linear-gradient(90deg, var(--primary), var(--accent))',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-4 text-[11px] text-dim">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'linear-gradient(90deg, var(--primary), var(--accent))' }} />
                Consumed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--primary-glow)', border: '1px solid var(--primary-border)' }} />
                Generated
              </span>
            </div>
          </Widget>

          {/* Active missions */}
          <Widget icon={Rocket} title="Active Missions" subtitle={`${MISSIONS.length} mission${MISSIONS.length === 1 ? '' : 's'} in flight`}>
            <div className="space-y-3">
              {MISSIONS.map((m) => (
                <div key={m.id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                        {m.name}
                      </div>
                      <div className="text-[11px] text-dim truncate">{m.destination} · {m.crew} crew · ETA {m.eta}</div>
                    </div>
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{
                        background: 'var(--primary-glow)',
                        color: 'var(--primary-dark)',
                        border: '1px solid var(--primary-border)',
                      }}
                    >
                      {m.phase}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--bg-glass)' }}>
                    <div
                      className="h-full"
                      style={{
                        width: `${m.progress}%`,
                        background: 'linear-gradient(90deg, var(--primary), var(--accent))',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Widget>

          {/* Active experiments */}
          <Widget icon={FlaskConical} title="Science Experiments" subtitle="Active research lines" className="lg:col-span-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-widest text-dim text-left">
                  <th className="font-medium pb-2 pr-3">ID</th>
                  <th className="font-medium pb-2 pr-3">Title</th>
                  <th className="font-medium pb-2 pr-3">Field</th>
                  <th className="font-medium pb-2 pr-3 hidden md:table-cell">PI</th>
                  <th className="font-medium pb-2 text-right">Obs.</th>
                  <th className="font-medium pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {EXPERIMENTS.map((e) => (
                  <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-dim">{e.id}</td>
                    <td className="py-2.5 pr-3 font-semibold truncate" style={{ color: 'var(--text)' }}>{e.title}</td>
                    <td className="py-2.5 pr-3 text-muted">{e.field}</td>
                    <td className="py-2.5 pr-3 text-muted hidden md:table-cell">{e.pi}</td>
                    <td className="py-2.5 text-right font-mono">{e.observations}</td>
                    <td className="py-2.5 text-right">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                        style={{
                          background: e.status === 'active' ? 'rgba(11,166,119,0.12)' : 'var(--bg-glass)',
                          color: e.status === 'active' ? 'var(--success)' : 'var(--text-muted)',
                          border: `1px solid ${e.status === 'active' ? 'rgba(11,166,119,0.3)' : 'var(--border)'}`,
                        }}
                      >
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Widget>

          {/* Materials samples */}
          <Widget icon={Beaker} title="Material Samples" subtitle="Recent collections in the lab">
            <div className="space-y-3">
              {SAMPLES.map((s) => (
                <div
                  key={s.id}
                  className="p-3"
                  style={{
                    background: 'var(--bg-glass)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[11px] text-dim">{s.id}</span>
                    <span className="text-[11px] text-dim">{s.collectedAt}</span>
                  </div>
                  <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{s.classification}</div>
                  <div className="text-[11px] text-muted mt-0.5">From {s.origin}</div>
                  <div className="text-[11px] font-mono text-dim mt-1">{s.composition}</div>
                </div>
              ))}
            </div>
          </Widget>

          {/* Safety incidents */}
          <Widget icon={ShieldAlert} title="Safety Incidents" subtitle="Open & investigating" className="lg:col-span-2">
            <div className="space-y-2">
              {INCIDENTS.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{
                    background: i.severity === 'critical' ? 'rgba(220,53,69,0.06)' : 'var(--bg-glass)',
                    border: `1px solid ${i.severity === 'critical' ? 'rgba(220,53,69,0.25)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <span
                    className="inline-block w-2 h-10 rounded-full shrink-0"
                    style={{ background: SEVERITY_COLOR[i.severity] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                      {i.title}
                    </div>
                    <div className="text-[11px] text-dim">
                      {i.id} · {i.location} · reported {i.reportedAt}
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{
                      background: `${SEVERITY_COLOR[i.severity]}1a`,
                      color: SEVERITY_COLOR[i.severity],
                      border: `1px solid ${SEVERITY_COLOR[i.severity]}55`,
                    }}
                  >
                    {i.severity}
                  </span>
                  <span className="hidden sm:inline pill">{i.status}</span>
                </div>
              ))}
            </div>
          </Widget>

          {/* Comms log */}
          <Widget icon={Radio} title="Comms Log" subtitle="Recent transmissions">
            <div className="space-y-3">
              {COMMS.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <div
                    className="w-1 rounded-full shrink-0"
                    style={{ background: PRIORITY_COLOR[c.priority] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-bold tracking-widest" style={{ color: PRIORITY_COLOR[c.priority] }}>
                        {c.channel} · {c.priority.toUpperCase()}
                      </span>
                      <span className="text-[11px] text-dim">{c.at}</span>
                    </div>
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{c.from}</div>
                    <div className="text-[12px] text-muted truncate">{c.preview}</div>
                  </div>
                </div>
              ))}
            </div>
          </Widget>
        </div>
      </main>
    </>
  );
}

function KpiCard({ label, value, sub, index }: { label: string; value: number | string; sub: string; index: number }) {
  const accents = ['var(--primary)', 'var(--accent)', 'var(--warning)', 'var(--success)'];
  const accent = accents[index % accents.length];
  return (
    <div
      className="p-5"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        backdropFilter: 'blur(14px) saturate(1.2)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0, right: 0,
          width: 90, height: 90,
          background: `radial-gradient(circle, ${accent}20 0%, transparent 70%)`,
        }}
      />
      <div className="text-[11px] uppercase tracking-widest text-dim">{label}</div>
      <div className="text-3xl md:text-4xl font-extrabold mt-1" style={{ color: accent }}>{value}</div>
      <div className="text-[11px] text-muted mt-1">{sub}</div>
    </div>
  );
}

function Widget({
  icon: Icon,
  title,
  subtitle,
  children,
  className = '',
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={className}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        backdropFilter: 'blur(14px) saturate(1.2)',
        overflow: 'hidden',
      }}
    >
      <header
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-md shrink-0"
          style={{
            background: 'var(--primary-glow)',
            color: 'var(--primary)',
            border: '1px solid var(--primary-border)',
          }}
        >
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--text)' }}>{title}</div>
          {subtitle && <div className="text-[11px] text-dim">{subtitle}</div>}
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function CrewBar({
  data,
  total,
}: {
  data: { label: string; value: number; color: string }[];
  total: number;
}) {
  return (
    <>
      <div
        className="flex h-2.5 w-full rounded-full overflow-hidden"
        style={{ background: 'var(--bg-glass)' }}
      >
        {data.map((d) => (
          <div
            key={d.label}
            title={`${d.label}: ${d.value}`}
            style={{ width: `${(d.value / total) * 100}%`, background: d.color }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: d.color }} />
            <span className="text-muted">{d.label}</span>
            <span className="ml-auto font-semibold" style={{ color: 'var(--text)' }}>{d.value}</span>
          </div>
        ))}
      </div>
    </>
  );
}
