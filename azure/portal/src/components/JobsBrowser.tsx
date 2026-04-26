'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, Briefcase, ArrowRight, Search } from 'lucide-react';
import { JOBS, DEPARTMENTS, deptColor, formatPostedDate, type Job } from '@/lib/jobs';

export default function JobsBrowser() {
  const [dept, setDept] = useState<string>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: JOBS.length };
    for (const d of DEPARTMENTS) c[d] = JOBS.filter((j) => j.department === d).length;
    return c;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return JOBS.filter((j) => {
      if (dept !== 'all' && j.department !== dept) return false;
      if (!q) return true;
      return (
        j.title.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q) ||
        j.level.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q)
      );
    });
  }, [dept, query]);

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
        <div
          className="flex items-center gap-2 px-3 py-2 flex-1"
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, location, level…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text)' }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label={`All (${counts.all})`} active={dept === 'all'} onClick={() => setDept('all')} color="var(--primary)" />
          {DEPARTMENTS.map((d) => (
            <FilterChip
              key={d}
              label={`${d} (${counts[d]})`}
              active={dept === d}
              onClick={() => setDept(d)}
              color={deptColor(d)}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          className="text-center py-16"
          style={{ color: 'var(--text-muted)' }}
        >
          No openings match your search. Try a different filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
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

function JobCard({ job }: { job: Job }) {
  const c = deptColor(job.department);
  return (
    <Link
      href={`/careers/${job.id}`}
      className="group p-5 transition"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        backdropFilter: 'blur(14px) saturate(1.2)',
        display: 'block',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{
              background: `${c}1a`,
              color: c,
              border: `1px solid ${c}55`,
            }}
          >
            {job.department}
          </span>
          <span className="pill" style={{ fontSize: 10 }}>
            {job.level}
          </span>
          <span className="pill" style={{ fontSize: 10 }}>
            {job.type}
          </span>
        </div>
        <span className="text-[11px] text-dim whitespace-nowrap">
          {formatPostedDate(job.posted)}
        </span>
      </div>
      <h3 className="text-lg font-bold tracking-tight mb-2" style={{ color: 'var(--text)' }}>
        {job.title}
      </h3>
      <p className="text-[13px] text-muted line-clamp-3 leading-relaxed">{job.description}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[12px] text-dim min-w-0">
          <span className="inline-flex items-center gap-1 truncate">
            <MapPin size={12} /> {job.location}
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Briefcase size={12} /> {job.salary}
          </span>
        </div>
        <span
          className="text-xs font-semibold inline-flex items-center gap-1 transition group-hover:gap-2"
          style={{ color: c }}
        >
          View role <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}
