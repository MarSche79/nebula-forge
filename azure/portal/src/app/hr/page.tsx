import { Suspense } from 'react';
import Link from 'next/link';
import { Activity, Briefcase } from 'lucide-react';
import AppNav from '@/components/AppNav';
import ApplicationsTable from '@/components/ApplicationsTable';
import { getCrewUser } from '@/lib/crewUser';
import { apiJson } from '@/lib/serverApi';

export const metadata = { title: 'HR Portal · Nebula Forge' };
export const dynamic = 'force-dynamic';

interface CountsView {
  total: number;
  thisWeek: number;
  flagged: number;
  screened: number;
  hired: number;
  rejected: number;
}

async function fetchCounts(): Promise<CountsView | null> {
  return apiJson<CountsView>('/api/applications/counts');
}

export default async function HrPage() {
  const user = await getCrewUser();
  const counts = await fetchCounts();

  return (
    <>
      <AppNav displayName={user?.name} />
      <main className="container-nf py-8">
        <header className="flex items-start justify-between flex-wrap gap-4 mb-7">
          <div>
            <span className="section-label mb-3"><Briefcase size={12} /> HR Portal</span>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Application <span className="text-highlight">Pipeline</span>
            </h1>
            <p className="mt-2 text-sm text-muted max-w-2xl">
              Every CV submitted via <span className="font-mono text-[12px]">/careers</span>{' '}
              flows through the AI screening pipeline. Submissions blocked by the
              Azure OpenAI content filter (jailbreak / injection / etc.) appear
              under <Link href="/hr/threats" className="font-semibold" style={{ color: 'var(--danger)' }}>Threats</Link>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/hr/threats" className="btn-ghost btn-sm">
              <Activity size={14} /> Threats {counts?.flagged ? `· ${counts.flagged}` : ''}
            </Link>
            <Link href="/hr/demo" className="btn-primary btn-sm">
              Run demo
            </Link>
          </div>
        </header>

        {/* KPI strip */}
        {counts && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-7">
            <Kpi label="Total" value={counts.total} accent="var(--primary)" />
            <Kpi label="This week" value={counts.thisWeek} accent="var(--accent)" />
            <Kpi label="Screened" value={counts.screened} accent="var(--success)" />
            <Kpi label="Flagged" value={counts.flagged} accent="var(--danger)" />
            <Kpi label="Hired" value={counts.hired} accent="var(--success)" />
            <Kpi label="Rejected" value={counts.rejected} accent="var(--text-muted)" />
          </div>
        )}

        <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
          <ApplicationsTable />
        </Suspense>
      </main>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="px-4 py-3"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        backdropFilter: 'blur(14px) saturate(1.2)',
      }}
    >
      <div className="text-2xl font-extrabold" style={{ color: accent }}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-dim mt-0.5">{label}</div>
    </div>
  );
}
