'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  ShieldAlert,
  Trash2,
  Search,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import {
  listApplications,
  cleanupDemo,
  type Application,
  type ApplicationStatus,
} from '@/lib/applications';

interface Props {
  /** When true, shows only flagged rows and hides the status filter chips. */
  threatOnly?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  Screened: 'var(--success)',
  Flagged:  'var(--danger)',
  New:      'var(--text-muted)',
};
const DECISION_COLOR: Record<string, string> = {
  Hired:    'var(--success)',
  Rejected: 'var(--danger)',
};

export default function ApplicationsTable({ threatOnly = false }: Props) {
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'All'>('All');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [includeDemo, setIncludeDemo] = useState(true);
  const [query, setQuery] = useState('');
  const [, startTransition] = useTransition();

  const load = () => {
    setLoading(true);
    setError('');
    listApplications({
      status: threatOnly ? undefined : (statusFilter === 'All' ? undefined : statusFilter),
      threatOnly,
      source: includeDemo ? 'all' : 'web',
    })
      .then((data) => startTransition(() => setRows(data)))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, includeDemo, threatOnly]);

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.department) s.add(r.department);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (deptFilter !== 'all' && r.department !== deptFilter) return false;
      if (!q) return true;
      return [r.name, r.email, r.jobTitle, r.id].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, query, deptFilter]);

  const cleanup = async () => {
    if (!confirm('Delete all demo applications? Web submissions are preserved.')) return;
    try {
      const r = await cleanupDemo();
      load();
      alert(`Removed ${r.removed} demo row${r.removed === 1 ? '' : 's'}.`);
    } catch (err) {
      alert(`Cleanup failed: ${(err as Error).message}`);
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          {!threatOnly && (
            <>
              {(['All', 'Screened', 'Flagged'] as const).map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={statusFilter === s}
                  color={s === 'Flagged' ? 'var(--danger)' : s === 'Screened' ? 'var(--success)' : 'var(--primary)'}
                  onClick={() => setStatusFilter(s)}
                />
              ))}
            </>
          )}
          {departments.length > 1 && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="text-xs px-3 py-1.5 ml-2"
              style={{
                background: 'var(--bg-glass)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                color: 'var(--text)',
              }}
            >
              <option value="all">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <label className="text-xs text-muted inline-flex items-center gap-1.5 ml-2">
            <input
              type="checkbox"
              checked={includeDemo}
              onChange={(e) => setIncludeDemo(e.target.checked)}
            />
            Include demo data
          </label>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 px-3 py-1.5"
            style={{
              background: 'var(--bg-glass)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              minWidth: 240,
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, role…"
              className="bg-transparent outline-none text-sm flex-1"
              style={{ color: 'var(--text)' }}
            />
          </div>
          <button onClick={load} className="btn-ghost btn-sm" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={cleanup} className="btn-ghost btn-sm" title="Delete all demo rows">
            <Trash2 size={14} /> Demo data
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 text-sm" style={{
          background: 'rgba(220,53,69,0.10)', border: '1px solid rgba(220,53,69,0.30)',
          color: 'var(--danger)', borderRadius: 'var(--radius-sm)',
        }}>
          <AlertTriangle size={14} className="inline -mt-0.5 mr-1.5" />
          {error}
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-glass)', borderBottom: '1px solid var(--border)' }}>
                <Th>Candidate</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Match</Th>
                <Th>Decision</Th>
                <Th>Submitted</Th>
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-12">
                    {threatOnly ? 'No threats detected so far.' : 'No applications match this filter.'}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderTop: '1px solid var(--border)' }}
                  className="hover:bg-[var(--bg-glass)] transition"
                >
                  <Td>
                    <Link href={`/hr/${r.id}`} className="block">
                      <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{r.name}</div>
                      <div className="text-[11px] text-dim truncate">{r.email}</div>
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/hr/${r.id}`} className="block">
                      <div className="truncate">{r.jobTitle}</div>
                      <div className="text-[11px] text-dim truncate">{r.department}</div>
                    </Link>
                  </Td>
                  <Td>
                    <Pill color={STATUS_COLOR[r.status] ?? 'var(--text-muted)'}>{r.status}</Pill>
                    {r.threatDetected && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(220,53,69,0.15)', color: 'var(--danger)' }}>
                        <ShieldAlert size={10} /> threat
                      </span>
                    )}
                  </Td>
                  <Td>
                    {r.matchScore != null ? (
                      <span className="font-bold" style={{ color: r.matchScore >= 75 ? 'var(--success)' : r.matchScore >= 50 ? 'var(--primary)' : 'var(--warning)' }}>
                        {r.matchScore}%
                      </span>
                    ) : <span className="text-dim">—</span>}
                  </Td>
                  <Td>
                    {r.decision ? <Pill color={DECISION_COLOR[r.decision] ?? 'var(--text-muted)'}>{r.decision}</Pill> : <span className="text-dim">—</span>}
                  </Td>
                  <Td>
                    <span className="text-dim text-[12px] whitespace-nowrap">
                      {new Date(r.submittedAt).toLocaleString()}
                    </span>
                  </Td>
                  <Td>
                    {r.source === 'demo' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(98,70,214,0.15)', color: 'var(--accent)' }}>
                        <Sparkles size={10} /> demo
                      </span>
                    ) : <span className="text-[11px] text-dim">web</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left text-[10px] font-bold uppercase tracking-widest text-dim px-4 py-2.5">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-middle">{children}</td>;
}
function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: `${color}1a`, color, border: `1px solid ${color}55` }}>
      {children}
    </span>
  );
}
function Chip({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold px-3 py-1.5 transition"
      style={{
        background: active ? `${color}1f` : 'var(--bg-glass)',
        border: `1px solid ${active ? `${color}66` : 'var(--border)'}`,
        color: active ? color : 'var(--text-muted)',
        borderRadius: 999,
      }}
    >
      {label}
    </button>
  );
}
