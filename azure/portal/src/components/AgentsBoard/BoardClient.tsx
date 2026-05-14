'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  KanbanSquare, Plus, Activity, Play, Trash2, X,
  FileText, MessageSquare, ShieldCheck, AlertOctagon, Skull, Bot,
  ExternalLink,
} from 'lucide-react';
import type { BoardAgent, BoardTask } from '@/lib/board';
import entraReg from '@/lib/nebulaforge-agents.json';

interface EntraReg {
  id: string;
  appId: string;
  portalUrl: string;
  enterpriseAppUrl: string;
}
const entraMap = new Map<string, EntraReg>(
  (entraReg as EntraReg[]).map((r) => [r.id, r]),
);

const STATUSES: BoardTask['status'][] = ['backlog', 'in_progress', 'blocked', 'done'];
const STATUS_LABEL: Record<BoardTask['status'], string> = {
  backlog: 'Backlog', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done',
};
const STATUS_COLOR: Record<BoardTask['status'], string> = {
  backlog: 'var(--text-dim)',
  in_progress: 'var(--primary)',
  blocked: 'var(--warning)',
  done: 'var(--success)',
};
const STATUS_BG: Record<BoardTask['status'], string> = {
  backlog: 'rgba(122,150,173,0.10)',
  in_progress: 'var(--primary-glow)',
  blocked: 'rgba(208,138,8,0.12)',
  done: 'rgba(11,166,119,0.12)',
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

interface BoardClientProps {
  initialTasks: BoardTask[];
  agents: BoardAgent[];
}

export default function BoardClient({ initialTasks, agents }: BoardClientProps) {
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks);
  const [showNew, setShowNew] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function refresh() {
    const r = await fetch('/api/board/tasks', { cache: 'no-store' });
    if (r.ok) setTasks(await r.json());
  }

  async function patch(id: string, patchBody: Partial<{ status: BoardTask['status']; agentId: string | null; priority: number }>) {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, ...patchBody } as BoardTask : x)));
    await fetch(`/api/board/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patchBody),
    });
  }

  async function dispatch(id: string) {
    const r = await fetch(`/api/board/tasks/${id}/dispatch`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    if (r.ok) startTransition(refresh);
  }

  async function remove(id: string) {
    if (!confirm('Delete this task?')) return;
    await fetch(`/api/board/tasks/${id}`, { method: 'DELETE' });
    setTasks((t) => t.filter((x) => x.id !== id));
  }

  return (
    <>
      <header className="mb-8">
        <span className="section-label mb-3"><KanbanSquare size={12} /> Agent Operations · Live</span>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Agents <span className="text-highlight">Board</span>
            </h1>
            <p className="mt-2 text-sm text-muted max-w-2xl">
              Drop tasks for the autonomous agent army. The cron tick fires every 30&nbsp;min — between dispatches, the agents act on their own.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/agents-board/activity')} className="btn-outline btn-sm">
              <Activity size={14} /> Activity feed
            </button>
            <button onClick={() => setShowNew(true)} className="btn-primary btn-sm">
              <Plus size={14} /> New task
            </button>
          </div>
        </div>
      </header>

      {/* Agent legend */}
      <div className="mb-6 flex flex-wrap gap-2">
        {agents.map((a) => {
          const Icon = AGENT_ICON[a.id] ?? Bot;
          const accent = AGENT_ACCENT[a.id] ?? 'var(--primary)';
          const count = tasks.filter((t) => t.agentId === a.id && t.status !== 'done').length;
          const entra = entraMap.get(a.id);
          return (
            <div
              key={a.id}
              className="group inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text)',
              }}
              title={a.description}
            >
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-md"
                style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent, border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)` }}
              >
                <Icon size={11} />
              </span>
              <span>{a.display_name}</span>
              {count > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold"
                  style={{ background: accent, color: '#fff' }}
                >{count}</span>
              )}
              {entra && (
                <a
                  href={entra.enterpriseAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="opacity-0 group-hover:opacity-100 transition inline-flex items-center"
                  style={{ color: 'var(--text-muted)' }}
                  title="Manage in Entra"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Columns */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((status) => {
          const col = tasks.filter((t) => t.status === status);
          return (
            <section
              key={status}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                backdropFilter: 'blur(14px) saturate(1.2)',
                overflow: 'hidden',
                minHeight: 320,
              }}
            >
              <header
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid var(--border)', background: STATUS_BG[status] }}
              >
                <span
                  className="text-xs font-bold tracking-widest uppercase"
                  style={{ color: STATUS_COLOR[status] }}
                >
                  {STATUS_LABEL[status]}
                </span>
                <span
                  className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-2 rounded-full text-[11px] font-bold"
                  style={{ background: STATUS_COLOR[status], color: '#fff' }}
                >
                  {col.length}
                </span>
              </header>
              <div className="p-3 flex flex-col gap-2.5">
                {col.map((task) => {
                  const agent = agents.find((a) => a.id === task.agentId);
                  const Icon = agent ? AGENT_ICON[agent.id] ?? Bot : Bot;
                  const accent = agent ? AGENT_ACCENT[agent.id] ?? 'var(--primary)' : 'var(--text-dim)';
                  return (
                    <article
                      key={task.id}
                      style={{
                        background: 'var(--bg-deep)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '12px',
                        transition: 'var(--transition)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <span
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0 mt-0.5"
                            style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent, border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)` }}
                          >
                            <Icon size={13} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                              {task.title}
                            </div>
                            {task.body && (
                              <div className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                                {task.body}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => remove(task.id)}
                          title="Delete"
                          className="opacity-50 hover:opacity-100 transition shrink-0"
                          style={{ color: 'var(--text-muted)', padding: 2 }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                        <span className="pill" style={{ fontSize: '0.65rem' }}>P{task.priority}</span>
                        <span className="pill" style={{ fontSize: '0.65rem' }}>
                          {task.source === 'cron' ? '⏰ auto' : task.source === 'agent' ? '🤖 agent' : '👤 you'}
                        </span>
                        {agent && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent, border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)` }}
                          >
                            {agent.display_name}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                        <select
                          value={task.agentId ?? ''}
                          onChange={(e) => patch(task.id, { agentId: e.target.value || null })}
                          className="nf-select"
                          aria-label="Agent"
                        >
                          <option value="">— unassigned —</option>
                          {agents.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
                        </select>
                        <select
                          value={task.status}
                          onChange={(e) => patch(task.id, { status: e.target.value as BoardTask['status'] })}
                          className="nf-select"
                          aria-label="Status"
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      </div>

                      <button
                        onClick={() => dispatch(task.id)}
                        disabled={!task.agentId || pending || task.status === 'done'}
                        className="btn-primary btn-sm w-full"
                        style={task.status === 'done' || !task.agentId ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                      >
                        <Play size={12} /> {pending ? 'Dispatching…' : 'Dispatch'}
                      </button>
                    </article>
                  );
                })}
                {col.length === 0 && (
                  <div
                    className="text-xs text-center py-8 italic"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    {status === 'backlog' ? 'No queued tasks. Click + New task above.' :
                     status === 'in_progress' ? 'Nothing dispatched.' :
                     status === 'blocked' ? 'No blockers.' : 'No completed tasks yet.'}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {showNew && <NewTaskModal agents={agents} onClose={() => setShowNew(false)} onCreated={refresh} />}

      <style jsx global>{`
        .nf-select {
          width: 100%;
          padding: 0.45rem 1.4rem 0.45rem 0.6rem;
          font-size: 0.72rem;
          font-weight: 500;
          background-color: var(--bg-glass);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          transition: var(--transition);
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%237a96ad'%3e%3cpath d='M4 6l4 4 4-4'/%3e%3c/svg%3e");
          background-repeat: no-repeat;
          background-position: right 0.4rem center;
          background-size: 12px;
        }
        .nf-select:hover, .nf-select:focus {
          border-color: var(--border-hover);
          background-color: var(--bg-glass-hover);
          outline: none;
        }
        .nf-input {
          width: 100%;
          padding: 0.65rem 0.85rem;
          font-size: 0.875rem;
          background: var(--bg-glass);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          transition: var(--transition);
        }
        .nf-input:focus {
          outline: none;
          border-color: var(--primary);
          background: var(--bg-glass-hover);
          box-shadow: 0 0 0 3px var(--primary-glow);
        }
        .nf-label {
          display: block;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 0.4rem;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </>
  );
}

function NewTaskModal({ agents, onClose, onCreated }: { agents: BoardAgent[]; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? '');
  const [priority, setPriority] = useState(2);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const r = await fetch('/api/board/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, body: body || undefined, agentId, priority }),
    });
    setSubmitting(false);
    if (r.ok) { onClose(); onCreated(); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(6,12,24,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          backdropFilter: 'blur(20px) saturate(1.2)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            New task
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="mb-4">
            <label className="nf-label">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Publish Q3 mineral yield report"
              className="nf-input"
              autoFocus
            />
          </div>
          <div className="mb-4">
            <label className="nf-label">Body / instructions</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Optional. The agent will pass this into its tool args."
              className="nf-input"
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div>
              <label className="nf-label">Agent</label>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="nf-select">
                {agents.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="nf-label">Priority</label>
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="nf-select">
                <option value={1}>P1 — Critical</option>
                <option value={2}>P2 — Normal</option>
                <option value={3}>P3 — Low</option>
                <option value={4}>P4 — Trivial</option>
                <option value={5}>P5 — Idle</option>
              </select>
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-glass)' }}
        >
          <button type="button" onClick={onClose} className="btn-ghost btn-sm">Cancel</button>
          <button type="submit" disabled={submitting || !title} className="btn-primary btn-sm">
            {submitting ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </form>
    </div>
  );
}
