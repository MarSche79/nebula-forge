import { apiJson } from '@/lib/serverApi';
import { getCrewUser } from '@/lib/crewUser';
import AppNav from '@/components/AppNav';
import type { BoardActivity, BoardAgent } from '@/lib/board';

export const dynamic = 'force-dynamic';

const SURFACE_COLOR: Record<string, string> = {
  sharepoint: '#0078d4',
  teams:      '#6246d6',
  purview:    '#9c27b0',
  defender:   '#dc3545',
  system:     '#0ba677',
};

export default async function ActivityPage() {
  const [activity, agents, user] = await Promise.all([
    apiJson<BoardActivity[]>('/api/board/activity?limit=200'),
    apiJson<BoardAgent[]>('/api/board/agents'),
    getCrewUser(),
  ]);
  const agentMap = new Map((agents ?? []).map((a) => [a.id, a.display_name]));

  return (
    <>
      <AppNav displayName={user?.name} />
      <main className="container-nf py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Agent Activity</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Everything the agent army has done — newest first.</p>
          </div>
          <a href="/agents-board" className="btn-ghost btn-sm">← Board</a>
        </div>

        <div className="rounded-nf-sm overflow-hidden"
             style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <table className="w-full text-sm" style={{ color: 'var(--text)' }}>
            <thead style={{ background: 'var(--bg)' }}>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Agent</th>
                <th className="px-4 py-2">Surface</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {(activity ?? []).map((row) => (
                <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-2 whitespace-nowrap text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{agentMap.get(row.agentId) ?? row.agentId}</td>
                  <td className="px-4 py-2">
                    <span className="pill" style={{ background: `${SURFACE_COLOR[row.surface] ?? '#888'}20`, color: SURFACE_COLOR[row.surface] ?? '#888', fontSize: '0.65rem' }}>
                      {row.surface}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{row.action}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <pre className="whitespace-pre-wrap break-all" style={{ maxWidth: 480 }}>{JSON.stringify(row.detail, null, 0)}</pre>
                    {row.externalUrl && <a href={row.externalUrl} target="_blank" rel="noreferrer" className="underline">open →</a>}
                  </td>
                </tr>
              ))}
              {(!activity || activity.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No activity yet — give the cron tick 30 minutes, or dispatch a task from the board.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
