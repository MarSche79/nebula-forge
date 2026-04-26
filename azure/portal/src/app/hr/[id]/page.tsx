import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Briefcase,
  Building2,
  CalendarDays,
  ShieldAlert,
  Sparkles,
  Target,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import AppNav from '@/components/AppNav';
import DecisionBar from '@/components/DecisionBar';
import { getCrewUser } from '@/lib/crewUser';
import { apiJson } from '@/lib/serverApi';
import type { Application } from '@/lib/applications';

export const dynamic = 'force-dynamic';

interface Params { id: string }

async function fetchApplication(id: string): Promise<Application | null> {
  return apiJson<Application>(`/api/applications/${encodeURIComponent(id)}`);
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const app = await fetchApplication(id);
  if (!app) return { title: 'Application not found · HR' };
  return { title: `${app.name} · ${app.jobTitle} · HR` };
}

export default async function HrDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const user = await getCrewUser();
  const app = await fetchApplication(id);
  if (!app) notFound();

  const matchTone =
    app.matchScore == null ? 'var(--text-muted)' :
    app.matchScore >= 75 ? 'var(--success)' :
    app.matchScore >= 50 ? 'var(--primary)' :
    'var(--warning)';

  return (
    <>
      <AppNav displayName={user?.name} />
      <main className="container-nf py-8">
        <Link href="/hr" className="inline-flex items-center gap-1 text-sm font-medium mb-4" style={{ color: 'var(--primary)' }}>
          <ArrowLeft size={14} /> All applications
        </Link>

        {app.threatDetected && (
          <div
            className="px-5 py-4 mb-6 flex items-start gap-3"
            style={{
              background: 'rgba(220,53,69,0.08)',
              border: '1px solid rgba(220,53,69,0.30)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text)',
            }}
          >
            <ShieldAlert size={20} style={{ color: 'var(--danger)' }} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-bold" style={{ color: 'var(--danger)' }}>Defender for AI flagged this submission</div>
              <div className="text-sm text-muted mt-1">
                Azure OpenAI&apos;s content filter blocked at least one prompt during screening.
                The corresponding Defender for AI alert{app.threatTypes.length > 1 ? 's' : ''}:
                {' '}
                {app.threatTypes.length
                  ? app.threatTypes.map((t) => <code key={t} className="font-mono text-[12px] mr-1.5" style={{ color: 'var(--danger)' }}>{t}</code>)
                  : <span className="text-dim">(generic content_filter)</span>}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Main */}
          <article
            className="p-6"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              backdropFilter: 'blur(14px) saturate(1.2)',
            }}
          >
            <header className="mb-6">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <Pill color="var(--primary)">{app.department}</Pill>
                <Pill color={app.status === 'Flagged' ? 'var(--danger)' : 'var(--success)'}>{app.status}</Pill>
                {app.decision && <Pill color={app.decision === 'Hired' ? 'var(--success)' : 'var(--danger)'}>{app.decision}</Pill>}
                {app.source === 'demo' && <Pill color="var(--accent)">demo</Pill>}
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">{app.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted">
                <Meta icon={Mail} text={app.email} />
                <Meta icon={Briefcase} text={app.jobTitle} />
                <Meta icon={Building2} text={`Job ${app.jobId}`} />
                <Meta icon={CalendarDays} text={`Submitted ${new Date(app.submittedAt).toLocaleString()}`} />
              </div>
            </header>

            {/* Match score */}
            {app.matchScore != null && (
              <div className="mb-6">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs uppercase tracking-widest text-dim">Match score</span>
                  <span className="text-xl font-extrabold" style={{ color: matchTone }}>{app.matchScore}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-glass)' }}>
                  <div className="h-full" style={{ width: `${app.matchScore}%`, background: matchTone }} />
                </div>
              </div>
            )}

            {/* Interviewer */}
            {app.interviewerAnalysis && (
              <Section title="Interviewer Agent" icon={Target} accent="var(--primary)">
                <p className="text-[14px] leading-relaxed text-muted">{app.interviewerAnalysis.summary}</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <BulletGroup title="Strengths" items={app.interviewerAnalysis.strengths} accent="var(--success)" />
                  <BulletGroup title="Gaps" items={app.interviewerAnalysis.gaps} accent="var(--warning)" />
                  <BulletGroup title="Interview focus" items={app.interviewerAnalysis.interviewFocus} accent="var(--primary)" />
                  <div className="p-3" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    <div className="text-[10px] uppercase tracking-widest text-dim">Verdict</div>
                    <div className="text-sm font-bold mt-1" style={{ color: 'var(--text)' }}>{app.interviewerAnalysis.verdict}</div>
                  </div>
                </div>
              </Section>
            )}

            {/* HR Manager */}
            {app.hrManagerDecision && (
              <Section title="HR Manager Agent" icon={Sparkles} accent="var(--accent)">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div className="p-3" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    <div className="text-[10px] uppercase tracking-widest text-dim">Recommendation</div>
                    <div className="text-sm font-bold mt-1" style={{ color: 'var(--accent)' }}>{app.hrManagerDecision.recommendation}</div>
                  </div>
                  <div className="md:col-span-2 p-3" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    <div className="text-[10px] uppercase tracking-widest text-dim">Next steps</div>
                    <div className="text-sm mt-1" style={{ color: 'var(--text)' }}>{app.hrManagerDecision.nextSteps}</div>
                  </div>
                </div>
                <p className="text-[14px] text-muted leading-relaxed">{app.hrManagerDecision.rationale}</p>
                {app.hrManagerDecision.riskFlags?.length > 0 && (
                  <div className="mt-3 p-3" style={{ background: 'rgba(208,138,8,0.08)', border: '1px solid rgba(208,138,8,0.30)', borderRadius: 'var(--radius-sm)' }}>
                    <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--warning)' }}>
                      <AlertTriangle size={10} className="inline -mt-0.5 mr-1" />
                      Risk flags
                    </div>
                    <ul className="mt-1 list-disc list-inside text-[13px]">
                      {app.hrManagerDecision.riskFlags.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
              </Section>
            )}

            {/* CV text */}
            <Section title="CV text" icon={FileText} accent="var(--text-muted)">
              <details>
                <summary className="cursor-pointer text-sm text-muted">
                  Show extracted text ({app.cvText.length.toLocaleString()} chars)
                </summary>
                <pre
                  className="mt-3 p-3 text-[12px] whitespace-pre-wrap break-words scroll-custom max-h-96 overflow-auto"
                  style={{
                    background: 'var(--bg-glass)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-muted)',
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  }}
                >{app.cvText}</pre>
              </details>
              {app.coverNote && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-widest text-dim mb-1">Cover note</div>
                  <p className="text-[13px] text-muted">{app.coverNote}</p>
                </div>
              )}
            </Section>
          </article>

          {/* Aside */}
          <aside className="space-y-5">
            <div
              className="p-5 sticky"
              style={{
                top: 88,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                backdropFilter: 'blur(14px) saturate(1.2)',
              }}
            >
              <div className="text-xs uppercase tracking-widest text-dim mb-3">Decision</div>
              <DecisionBar applicationId={app.id} currentDecision={app.decision} />
              <div className="mt-4 pt-4 text-[11px] text-dim space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
                <div><strong>ID</strong> <code className="font-mono">{app.id}</code></div>
                <div><strong>File</strong> {app.fileName || '—'}</div>
                {app.screenedAt && <div><strong>Screened</strong> {new Date(app.screenedAt).toLocaleString()}</div>}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

function Meta({ icon: Icon, text }: { icon: React.ComponentType<{ size?: number }>; text: string }) {
  return <span className="inline-flex items-center gap-1.5"><Icon size={13} /> {text}</span>;
}
function Section({ title, icon: Icon, accent, children }: { title: string; icon: React.ComponentType<{ size?: number }>; accent: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest mb-3" style={{ color: accent }}>
        <Icon size={13} /> {title}
      </h2>
      {children}
    </section>
  );
}
function BulletGroup({ title, items, accent }: { title: string; items: string[]; accent: string }) {
  if (!items?.length) return null;
  return (
    <div className="p-3" style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
      <div className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>{title}</div>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-[13px]" style={{ color: 'var(--text)' }}>
            <CheckCircle2 size={12} className="shrink-0 mt-0.5" style={{ color: accent }} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: `${color}1a`, color, border: `1px solid ${color}55` }}>
      {children}
    </span>
  );
}
