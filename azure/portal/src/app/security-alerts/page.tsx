import {
  ShieldAlert, AlertTriangle, AlertOctagon, ArrowUpRight,
  ShieldCheck, ShieldX, Activity, Mail, Globe, Lock, KeyRound, Bug,
} from 'lucide-react';
import { apiJson } from '@/lib/serverApi';
import { getCrewUser } from '@/lib/crewUser';
import AppNav from '@/components/AppNav';
import type { GptAlert } from '@/lib/gpt';

export const metadata = { title: 'Security Alerts · Nebula Forge' };
export const dynamic = 'force-dynamic';

const SEVERITY: Record<string, { color: string; bg: string; border: string; label: string }> = {
  high:          { color: 'var(--danger)',  bg: 'rgba(220,53,69,0.12)',  border: 'rgba(220,53,69,0.35)',  label: 'HIGH' },
  medium:        { color: 'var(--warning)', bg: 'rgba(208,138,8,0.12)',  border: 'rgba(208,138,8,0.35)',  label: 'MEDIUM' },
  low:           { color: 'var(--primary)', bg: 'var(--primary-glow)',   border: 'var(--primary-border)', label: 'LOW' },
  informational: { color: 'var(--text-muted)', bg: 'var(--bg-glass)',    border: 'var(--border)',         label: 'INFO' },
  unknown:       { color: 'var(--text-muted)', bg: 'var(--bg-glass)',    border: 'var(--border)',         label: '—' },
};

const SURFACE: Record<string, { color: string; bg: string; border: string; icon: React.ComponentType<{ size?: number }>; label: string }> = {
  'purview':            { color: '#9c27b0',       bg: 'rgba(156,39,176,0.12)', border: 'rgba(156,39,176,0.35)', icon: Lock,        label: 'Purview' },
  'defender-office':    { color: '#0078d4',       bg: 'rgba(0,120,212,0.12)',  border: 'rgba(0,120,212,0.35)',  icon: Mail,        label: 'Defender · Office 365' },
  'defender-endpoint':  { color: 'var(--success)', bg: 'rgba(11,166,119,0.12)', border: 'rgba(11,166,119,0.35)', icon: ShieldCheck, label: 'Defender · Endpoint' },
  'defender-identity':  { color: 'var(--accent)',  bg: 'var(--accent-glow)',    border: 'rgba(98,70,214,0.35)',  icon: KeyRound,    label: 'Defender · Identity' },
  'defender-mcas':      { color: '#00b294',       bg: 'rgba(0,178,148,0.12)',  border: 'rgba(0,178,148,0.35)',  icon: Globe,       label: 'Defender · Cloud Apps' },
  'defender':           { color: 'var(--danger)',  bg: 'rgba(220,53,69,0.12)',  border: 'rgba(220,53,69,0.35)',  icon: Bug,         label: 'Defender' },
  'entra':              { color: 'var(--warning)', bg: 'rgba(208,138,8,0.12)',  border: 'rgba(208,138,8,0.35)',  icon: KeyRound,    label: 'Entra ID' },
  'other':              { color: 'var(--text-muted)', bg: 'var(--bg-glass)',   border: 'var(--border)',         icon: ShieldAlert, label: 'Other' },
};

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function SecurityAlertsPage() {
  const [data, user] = await Promise.all([
    apiJson<{ count: number; alerts: GptAlert[] }>('/api/gpt/alerts'),
    getCrewUser(),
  ]);
  const alerts = data?.alerts ?? [];

  const bySev: Record<string, number> = {};
  const bySurface: Record<string, number> = {};
  for (const a of alerts) {
    const s = (a.severity ?? 'unknown').toLowerCase();
    bySev[s] = (bySev[s] ?? 0) + 1;
    bySurface[a.surface] = (bySurface[a.surface] ?? 0) + 1;
  }

  return (
    <>
      <AppNav displayName={user?.name} />
      <main className="container-nf py-8">
        <header className="mb-8">
          <span className="section-label mb-3"><ShieldAlert size={12} /> Security Operations · Live from Microsoft Graph</span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Security <span className="text-highlight">Alerts</span>
          </h1>
          <p className="mt-2 text-sm text-muted max-w-2xl">
            Defender XDR + Microsoft Purview alerts surfaced via the Graph Security API. Reflects the signed-in user's permissions.
          </p>
        </header>

        {/* Severity KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <KpiTile label="Total" value={alerts.length} icon={Activity} color="var(--primary)" />
          <KpiTile label="High" value={bySev.high ?? 0} icon={AlertOctagon} color="var(--danger)" />
          <KpiTile label="Medium" value={bySev.medium ?? 0} icon={AlertTriangle} color="var(--warning)" />
          <KpiTile label="Low" value={bySev.low ?? 0} icon={ShieldCheck} color="var(--primary)" />
          <KpiTile label="Info" value={bySev.informational ?? 0} icon={ShieldX} color="var(--text-muted)" />
        </div>

        {/* Surface breakdown */}
        {Object.keys(bySurface).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(bySurface).map(([k, n]) => {
              const cfg = SURFACE[k] ?? SURFACE.other!;
              const Icon = cfg.icon;
              return (
                <div key={k} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold"
                     style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, borderRadius: 'var(--radius-sm)' }}>
                  <Icon size={12} />
                  {cfg.label}
                  <span className="ml-1 px-1.5 rounded-full font-bold" style={{ background: cfg.color, color: '#fff', fontSize: '0.65rem' }}>
                    {n}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Alerts table */}
        <section
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            backdropFilter: 'blur(14px) saturate(1.2)',
            overflow: 'hidden',
          }}
        >
          <header className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-md"
                  style={{ background: 'var(--primary-glow)', color: 'var(--primary)', border: '1px solid var(--primary-border)' }}>
              <ShieldAlert size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--text)' }}>Recent alerts</div>
              <div className="text-[11px] text-dim">Sorted by created time — newest at the top · top 200</div>
            </div>
          </header>

          {alerts.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3"
                   style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)' }}>
                <ShieldCheck size={22} style={{ color: 'var(--success)' }} />
              </div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No alerts visible to you</div>
              <div className="text-xs text-muted">
                Either everything is quiet, or your Entra account doesn&apos;t have <code>SecurityAlert.Read.All</code> consented.
                Ask a global admin to grant admin consent on the NebulaGPT app reg.
              </div>
            </div>
          ) : (
            <ul>
              {alerts.map((a, i) => {
                const sev = (a.severity ?? 'unknown').toLowerCase();
                const sevCfg = SEVERITY[sev] ?? SEVERITY.unknown!;
                const surfCfg = SURFACE[a.surface] ?? SURFACE.other!;
                const SurfaceIcon = surfCfg.icon;
                return (
                  <li key={a.id} className="px-5 py-3 flex items-start gap-3"
                      style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-md shrink-0 mt-0.5"
                          style={{ background: surfCfg.bg, color: surfCfg.color, border: `1px solid ${surfCfg.border}` }}>
                      <SurfaceIcon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{a.title}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                              style={{ background: sevCfg.bg, color: sevCfg.color, border: `1px solid ${sevCfg.border}` }}>
                          {sevCfg.label}
                        </span>
                        <span className="pill" style={{ fontSize: '0.65rem' }}>{surfCfg.label}</span>
                        {a.status && <span className="pill" style={{ fontSize: '0.65rem' }}>{a.status}</span>}
                        <span className="ml-auto text-[11px]" style={{ color: 'var(--text-dim)' }}>
                          {relativeTime(a.createdDateTime)}
                        </span>
                      </div>
                      {a.description && (
                        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                          {a.description.length > 240 ? a.description.slice(0, 240) + '…' : a.description}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                        {a.category && <span>{a.category}</span>}
                        {a.detectionSource && <span>· {a.detectionSource}</span>}
                        {a.classification && <span>· {a.classification}</span>}
                        {a.webUrl && (
                          <a href={a.webUrl} target="_blank" rel="noreferrer"
                             className="inline-flex items-center gap-1 font-semibold ml-auto" style={{ color: 'var(--primary)' }}>
                            Open in portal <ArrowUpRight size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function KpiTile({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ComponentType<{ size?: number }>; color: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backdropFilter: 'blur(14px) saturate(1.2)' }}>
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-md shrink-0"
            style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-widest text-dim">{label}</div>
        <div className="text-2xl font-extrabold leading-tight" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}
