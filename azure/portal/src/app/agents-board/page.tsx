import { apiJson } from '@/lib/serverApi';
import { getCrewUser } from '@/lib/crewUser';
import AppNav from '@/components/AppNav';
import type { BoardAgent, BoardTask } from '@/lib/board';
import BoardClient from '@/components/AgentsBoard/BoardClient';

export const metadata = { title: 'Agents Board · Nebula Forge' };
export const dynamic = 'force-dynamic';

export default async function AgentsBoardPage() {
  const [tasks, agents, user] = await Promise.all([
    apiJson<BoardTask[]>('/api/board/tasks'),
    apiJson<BoardAgent[]>('/api/board/agents'),
    getCrewUser(),
  ]);
  return (
    <>
      <AppNav displayName={user?.name} />
      <main className="container-nf py-8">
        <BoardClient initialTasks={tasks ?? []} agents={agents ?? []} />
      </main>
    </>
  );
}
