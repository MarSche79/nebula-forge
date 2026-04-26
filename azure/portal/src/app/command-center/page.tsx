import { Sparkles } from 'lucide-react';
import AppNav from '@/components/AppNav';
import ChatPanel from '@/components/ChatPanel';
import { getCrewUser } from '@/lib/crewUser';
import { AGENTS } from '@/lib/agents';
import { STATION_HEADLINE_STATS, INCIDENTS, MISSIONS } from '@/lib/stationData';

export const metadata = { title: 'Command Center · Nebula Forge' };

export default async function CommandCenterPage() {
  const user = await getCrewUser();
  const greetingName = user?.name?.split(/\s+/)[0] ?? 'Crew';
  const openIncidents = INCIDENTS.filter((i) => i.status !== 'resolved').length;
  const activeMissions = MISSIONS.filter((m) => m.phase !== 'planning').length;

  return (
    <>
      <AppNav displayName={user?.name} />
      <main className="container-nf py-6">
        <div className="flex flex-col lg:flex-row items-start justify-between gap-4 mb-6">
          <div>
            <span className="section-label mb-3"><Sparkles size={12} /> Command Center</span>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Welcome aboard, <span className="text-highlight">{greetingName}</span>
            </h1>
            <p className="mt-2 text-sm text-muted">
              You are signed in as crew. The Master Agent is ready to coordinate
              the nine departments on your behalf.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            {STATION_HEADLINE_STATS.map((s) => (
              <div
                key={s.label}
                className="px-4 py-3"
                style={{
                  background: 'var(--bg-glass)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  minWidth: 130,
                }}
              >
                <div className="text-xl font-extrabold" style={{ color: 'var(--primary)' }}>
                  {s.value}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-dim mt-0.5">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          <ChatPanel />

          <aside className="flex flex-col gap-5">
            <SidebarCard
              title="Mission status"
              accent="var(--primary)"
              items={MISSIONS.slice(0, 3).map((m) => ({
                primary: m.name,
                secondary: `${m.destination} · ${m.phase}`,
                value: `${m.progress}%`,
              }))}
            />
            <SidebarCard
              title="Open incidents"
              accent="var(--warning)"
              items={INCIDENTS.filter((i) => i.status !== 'resolved').slice(0, 3).map((i) => ({
                primary: i.title,
                secondary: `${i.location} · ${i.severity}`,
                value: i.status,
                pillColor:
                  i.severity === 'critical'
                    ? 'var(--danger)'
                    : i.severity === 'high'
                    ? 'var(--warning)'
                    : 'var(--text-muted)',
              }))}
            />
            <div
              className="p-5"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div className="text-xs uppercase tracking-widest text-dim mb-3">
                Specialists on call
              </div>
              <div className="grid grid-cols-3 gap-2">
                {AGENTS.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-col items-center text-center gap-1 p-2"
                    style={{
                      background: `${a.color}10`,
                      border: `1px solid ${a.color}33`,
                      borderRadius: 'var(--radius-sm)',
                    }}
                    title={a.name}
                  >
                    <span aria-hidden style={{ fontSize: 18 }}>{a.icon}</span>
                    <span className="text-[10px] font-medium" style={{ color: a.color }}>
                      {a.shortName}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11px] text-dim">
                {activeMissions} active missions · {openIncidents} open incidents
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

interface SidebarItem {
  primary: string;
  secondary: string;
  value: string;
  pillColor?: string;
}

function SidebarCard({
  title,
  accent,
  items,
}: {
  title: string;
  accent: string;
  items: SidebarItem[];
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <div
        className="px-5 py-3 text-xs uppercase tracking-widest"
        style={{
          borderBottom: '1px solid var(--border)',
          background: `linear-gradient(90deg, ${accent}10, transparent)`,
          color: accent,
        }}
      >
        {title}
      </div>
      <div className="px-5 py-2">
        {items.map((it, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between gap-3 py-3 first:pt-3 last:pb-3"
            style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                {it.primary}
              </div>
              <div className="text-[11px] text-dim truncate">{it.secondary}</div>
            </div>
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
              style={{
                background: `${it.pillColor ?? accent}1a`,
                color: it.pillColor ?? accent,
                border: `1px solid ${it.pillColor ?? accent}55`,
              }}
            >
              {it.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
