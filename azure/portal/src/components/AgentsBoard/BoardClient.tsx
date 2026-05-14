'use client';

import { useState, useTransition } from 'react';
import type { BoardAgent, BoardTask } from '@/lib/board';

const STATUSES: BoardTask['status'][] = ['backlog', 'in_progress', 'blocked', 'done'];
const STATUS_LABEL: Record<BoardTask['status'], string> = {
  backlog: 'Backlog', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done',
};
const STATUS_COLOR: Record<BoardTask['status'], string> = {
  backlog: 'var(--text-muted)', in_progress: 'var(--primary)', blocked: 'var(--warning, #d08a08)', done: 'var(--success, #0ba677)',
};

interface BoardClientProps {
  initialTasks: BoardTask[];
  agents: BoardAgent[];
}

export default function BoardClient({ initialTasks, agents }: BoardClientProps) {
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks);
  const [showNew, setShowNew] = useState(false);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    const r = await fetch('/api/board/tasks', { cache: 'no-store' });
    if (r.ok) setTasks(await r.json());
  }

  async function patch(id: string, patchBody: Partial<{ status: BoardTask['status']; agentId: string | null; priority: number }>) {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, ...patchBody } : x)));
    await fetch(`/api/board/tasks/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patchBody),
    });
  }

  async function dispatch(id: string) {
    const r = await fetch(`/api/board/tasks/${id}/dispatch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (r.ok) startTransition(refresh);
  }

  async function remove(id: string) {
    if (!confirm('Delete this task?')) return;
    await fetch(`/api/board/tasks/${id}`, { method: 'DELETE' });
    setTasks((t) => t.filter((x) => x.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Agents Board</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Drop tasks for the autonomous agent army. The cron tick runs every 30 min.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/agents-board/activity" className="btn-ghost btn-sm">Activity feed →</a>
          <button onClick={() => setShowNew(true)} className="btn-primary btn-sm">+ New task</button>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {STATUSES.map((status) => {
          const col = tasks.filter((t) => t.status === status);
          return (
            <div key={status} className="rounded-nf-sm p-3"
                 style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: STATUS_COLOR[status] }}>
                  {STATUS_LABEL[status]} <span className="text-xs opacity-60">({col.length})</span>
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                {col.map((task) => {
                  const agent = agents.find((a) => a.id === task.agentId);
                  return (
                    <div key={task.id} className="rounded-nf-sm p-3"
                         style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>{task.title}</div>
                      {task.body && <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{task.body}</div>}
                      <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
                        <span className="pill">P{task.priority}</span>
                        <span className="pill">{task.source}</span>
                        {agent && <span className="pill">{agent.display_name}</span>}
                      </div>
                      <div className="flex items-center gap-1 mt-3">
                        <select
                          value={task.agentId ?? ''}
                          onChange={(e) => patch(task.id, { agentId: e.target.value || null })}
                          className="btn-ghost btn-sm flex-1"
                          style={{ fontSize: '0.7rem' }}
                        >
                          <option value="">unassigned</option>
                          {agents.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
                        </select>
                        <select
                          value={task.status}
                          onChange={(e) => patch(task.id, { status: e.target.value as BoardTask['status'] })}
                          className="btn-ghost btn-sm"
                          style={{ fontSize: '0.7rem' }}
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => dispatch(task.id)} className="btn-ghost btn-sm flex-1" disabled={!task.agentId || pending}>
                          ▶ Dispatch
                        </button>
                        <button onClick={() => remove(task.id)} className="btn-ghost btn-sm" title="Delete">✕</button>
                      </div>
                    </div>
                  );
                })}
                {col.length === 0 && (
                  <div className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showNew && <NewTaskModal agents={agents} onClose={() => setShowNew(false)} onCreated={refresh} />}
    </div>
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
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, body: body || undefined, agentId, priority }),
    });
    setSubmitting(false);
    if (r.ok) { onClose(); onCreated(); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <form onSubmit={submit} className="w-full max-w-md rounded-nf-sm p-6"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>New task</h2>
        <label className="block text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full mb-3 px-3 py-2 rounded-nf-sm"
               style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)' }} />
        <label className="block text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Body (instructions)</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full mb-3 px-3 py-2 rounded-nf-sm"
                  style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)' }} />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Agent</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full px-3 py-2 rounded-nf-sm"
                    style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)' }}>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="w-full px-3 py-2 rounded-nf-sm"
                    style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)' }}>
              {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>P{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm">Cancel</button>
          <button type="submit" disabled={submitting || !title} className="btn-primary btn-sm">{submitting ? '…' : 'Create'}</button>
        </div>
      </form>
    </div>
  );
}
