import { ShieldAlert } from 'lucide-react';
import AppNav from '@/components/AppNav';
import DemoLauncher from '@/components/DemoLauncher';
import { getCrewUser } from '@/lib/crewUser';

export const metadata = { title: 'Defender for AI Demo · HR Portal' };

export default async function HrDemoPage() {
  const user = await getCrewUser();
  return (
    <>
      <AppNav displayName={user?.name} />
      <main className="container-nf py-8">
        <header className="mb-7">
          <span
            className="section-label mb-3"
            style={{ color: 'var(--accent)', borderColor: 'rgba(98,70,214,0.30)', background: 'rgba(98,70,214,0.10)' }}
          >
            <ShieldAlert size={12} /> Defender for AI · Demo
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Five attack CVs, <span className="text-highlight">one click each</span>
          </h1>
          <p className="mt-2 text-sm text-muted max-w-3xl">
            Each card below sends a deliberately malicious CV through the
            normal screening pipeline. Azure OpenAI&apos;s content filter
            blocks the prompt and Microsoft Defender for AI raises the
            corresponding alert in Defender for Cloud → Security Alerts
            (~15–30 min propagation). Demo rows are tagged <code className="font-mono">source=&quot;demo&quot;</code>
            and excluded from the main KPI tiles.
          </p>
        </header>

        <DemoLauncher />
      </main>
    </>
  );
}
