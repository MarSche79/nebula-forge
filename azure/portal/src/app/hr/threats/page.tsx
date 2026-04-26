import { ShieldAlert, Activity } from 'lucide-react';
import AppNav from '@/components/AppNav';
import ApplicationsTable from '@/components/ApplicationsTable';
import { getCrewUser } from '@/lib/crewUser';

export const metadata = { title: 'Security Threats · HR Portal · Nebula Forge' };
export const dynamic = 'force-dynamic';

const ALERT_TYPES = [
  { code: 'AI.Azure_Jailbreak.ContentFiltering',  what: 'Jailbreak / prompt-injection',         desc: 'CV contained instructions to override the system prompt or escape the assistant\'s persona ("DAN", ChatML markers, [SYSTEM OVERRIDE], etc.).' },
  { code: 'AI.Azure_CredentialTheftAttempt',      what: 'Credential / secret extraction',        desc: 'CV asked the model to dump environment variables, API keys, connection strings, or bearer tokens — disguised as a compliance audit.' },
  { code: 'AI.Azure_MaliciousUrl.UserPrompt',     what: 'Phishing / malicious URL',              desc: 'CV embedded URLs that mimic Microsoft / Google login pages or use other look-alike phishing domains.' },
  { code: 'AI.Azure_LLMReconnaissance',           what: 'LLM reconnaissance / capability probing', desc: 'CV ran a structured probe of the model\'s identity, capabilities, and guardrails — disguised as ISO 42001 / EU AI Act compliance.' },
  { code: 'content_filter',                       what: 'Azure OpenAI built-in content filter',  desc: 'Submitted text triggered Azure OpenAI\'s out-of-the-box hate/violence/self-harm/sexual filters.' },
];

export default async function HrThreatsPage() {
  const user = await getCrewUser();
  return (
    <>
      <AppNav displayName={user?.name} />
      <main className="container-nf py-8">
        <header className="mb-7">
          <span className="section-label mb-3" style={{ color: 'var(--danger)', borderColor: 'rgba(220,53,69,0.30)', background: 'rgba(220,53,69,0.10)' }}>
            <ShieldAlert size={12} /> Defender for AI · Threats
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Submissions <span style={{ color: 'var(--danger)' }}>blocked by AI guardrails</span>
          </h1>
          <p className="mt-2 text-sm text-muted max-w-3xl">
            These applications were flagged before the screening agents could
            complete — Azure OpenAI&apos;s content filter blocked the prompt
            because it matched a known attack pattern. Microsoft Defender for
            AI raises the corresponding alert in the Defender for Cloud blade
            (15–30 min propagation).
          </p>
          <a
            href="https://portal.azure.com/#view/Microsoft_Azure_Security/SecurityMenuBlade/~/0"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost btn-sm mt-4"
          >
            <Activity size={12} /> Open Defender for Cloud → Security Alerts
          </a>
        </header>

        <ApplicationsTable threatOnly />

        {/* Alert-type legend */}
        <section className="mt-10">
          <h2 className="text-base font-bold tracking-tight mb-3">Alert types you may see</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {ALERT_TYPES.map((t) => (
              <div
                key={t.code}
                className="p-4"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <code className="text-[12px] font-mono" style={{ color: 'var(--danger)' }}>{t.code}</code>
                  <span className="pill">{t.what}</span>
                </div>
                <p className="text-[13px] text-muted leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
