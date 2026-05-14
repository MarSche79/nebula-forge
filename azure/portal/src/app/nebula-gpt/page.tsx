import { apiJson } from '@/lib/serverApi';
import { getCrewUser } from '@/lib/crewUser';
import AppNav from '@/components/AppNav';
import NebulaGptClient from '@/components/NebulaGpt/NebulaGptClient';
import type { GptSession } from '@/lib/gpt';

export const metadata = { title: 'NebulaGPT · Nebula Forge' };
export const dynamic = 'force-dynamic';

export default async function NebulaGptPage() {
  const [sessions, user] = await Promise.all([
    apiJson<GptSession[]>('/api/gpt/sessions'),
    getCrewUser(),
  ]);
  return (
    <>
      <AppNav displayName={user?.name} />
      <NebulaGptClient initialSessions={sessions ?? []} initialUser={user ?? null} />
    </>
  );
}
