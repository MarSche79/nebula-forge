import {
  Activity, ArrowLeft, FileText, MessageSquare, ShieldCheck, AlertOctagon, Skull, Cog,
  FileBadge, MessageCircle, Lock, AlertTriangle, Workflow,
} from 'lucide-react';
import { apiJson } from '@/lib/serverApi';
import { getCrewUser } from '@/lib/crewUser';
import AppNav from '@/components/AppNav';
import type { BoardActivity, BoardAgent } from '@/lib/board';

export const metadata = { title: 'Agent Activity · Nebula Forge' };
export const dynamic = 'force-dynamic';

const SURFACE: Record<
  string,
  { color: string; bg: string; border: string; icon: React.ComponentType<{ size?: number }> }
> = {
  sharepoint: { color: '#0078d4', bg: 'rgba(0,120,212,0.12)', border: 'rgba(0,120,212,0.35)', icon: FileBadge },
  teams:      { color: 'var(--accent)', bg: 'var(--accent-glow)', border: 'rgba(98,70,214,0.35)', icon: MessageCircle },
  purview:    { color: '#9c27b0', bg: 'rgba(156,39,176,0.12)', border: 'rgba(156,39,176,0.35)', icon: Lock },
  defender:   { color: 'var(--danger)', bg: 'rgba(220,53,69,0.12)', border: 'rgba(220,53,69,0.35)', icon: AlertTriangle },
  system:     { color: 'var(--text-muted)', bg: 'var(--bg-glass)', border: 'var(--border)', icon: Workflow },
};

const AGENT_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  scribe: FileText,
  herald: MessageSquare,
  sentinel: ShieldCheck,
  auditor: AlertOctagon,
  whisperer: Skull,
};
const AGENT_ACCENT: Record<string, string> = {
  scribe: 'var(--primary)',
  herald: 'var(--accent)',
  sentinel: 'var(--success)',
  auditor: 'var(--warning)',
  whisperer: 'var(--danger)',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatDetail(detail: unknown): string {
  if (!detail || typeof detail !== 'object') return '';
  const obj = detail as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of ['title', 'kind', 'fileName', 'folder', 'channel', 'pattern', 'severity', 'label', 'target', 'user', 'blocked', 'status', 'preview', 'reason']) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') {
      const s = String(v);
      parts.push(`${k}=${s.length > 60 ? s.slice(0, 60) + '…' : s}`);
    }
  }
  return parts.join(' · ');
}

export default async function ActivityPage() {
  const [activity, agents, user] = await Promise.all([
    apiJson<BoardActivity[]>('/api/board/activity?limit=200'),
    apiJson<BoardAgent[]>('/api/board/agents'),
    getCrewUser(),
  ]);
  const agentMap = new Map((agents ?? []).map((a) => [a.id, a.display_name]));

  const rows = activity ?? [];
  const bySurface: Record<string, number> = {};
  for (const r of rows) bySurface[r.surface] = (bySurface[r.surface] ?? 0) + 1;

  return (
    <>
      <AppNav displayName={user?.name} />
      <main className="container-nf py-8">
        <header className="mb-8">
          <span className="section-label mb-3"><Activity size={12} /> Agent Telemetry · Newest first</span>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Activity <span className="text-highlight">Feed</span>
              </h1>
              <p className="mt-2 text-sm text-muted max-w-2xl">
                Everything the agent army has done — SharePoint, Teams, Purview, Defender and system events, in real time.
              </p>
            </div>
            <a href="/agents-board" className="btn-outline btn-sm">
              <ArrowLeft size={14} /> Back to board
            </a>
          </div>
        </header>

        {/* Surface breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {Object.keys(SURFACE).map((surface) => {
            const cfg = SURFACE[surface]!;
            const Icon = cfg.icon;
            const count = bySurface[surface] ?? 0;
            return (
              <div
                key={surface}
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  backdropFilter: 'blur(14px) saturate(1.2)',
                }}
              >
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded-md shrink-0"
                  style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                >
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-widest text-dim">{surface}</div>
                  <div className="text-2xl font-extrabold leading-tight" style={{ color: cfg.color }}>{count}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Feed */}
        <section
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
              style={{ background: 'var(--primary-glow)', color: 'var(--primary)', border: '1px solid var(--primary-border)' }}
            >
              <Cog size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--text)' }}>Recent events</div>
              <div className="text-[11px] text-dim">{rows.length} events shown · newest at the top</div>
            </div>
          </header>

          {rows.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3"
                   style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)' }}>
                <Cog size={22} style={{ color: 'var(--text-dim)' }} />
              </div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No activity yet</div>
              <div className="text-xs text-muted">
                Give the cron tick 30 minutes, or dispatch a task from the board.
              </div>
            </div>
          ) : (
            <ul>
              {rows.map((row, i) => {
                const cfg = SURFACE[row.surface] ?? SURFACE.system!;
                const SurfaceIcon = cfg.icon;
                const AgentIcon = AGENT_ICON[row.agentId] ?? Cog;
                const agentAccent = AGENT_ACCENT[row.agentId] ?? 'var(--text-muted)';
                const agentName = agentMap.get(row.agentId) ?? row.agentId;
                const detailLine = formatDetail(row.detail);
                return (
                  <li
                    key={row.id}
                    className="flex items-start gap-3 px-5 py-3"
                    style={{
                      borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <span
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md shrink-0 mt-0.5"
                      style={{
                        background: `color-mix(in srgb, ${agentAccent} 15%, transparent)`,
                        color: agentAccent,
                        border: `1px solid color-mix(in srgb, ${agentAccent} 35%, transparent)`,
                      }}
                      title={agentName}
                    >
                      <AgentIcon size={14} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                          {agentName}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                        >
                          <SurfaceIcon size={10} /> {row.surface}
                        </span>
                        <span
                          className="text-[11px] font-mono"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {row.action}
                        </span>
                        <span className="text-[11px] ml-auto" style={{ color: 'var(--text-dim)' }}>
                          {relativeTime(row.createdAt)}
                        </span>
                      </div>
                      {detailLine && (
                        <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          {detailLine}
                        </div>
                      )}
                      {row.externalUrl && (
                        <a
                          href={row.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold mt-1 inline-block"
                          style={{ color: 'var(--primary)' }}
                        >
                          Open in M365 →
                        </a>
                      )}
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
