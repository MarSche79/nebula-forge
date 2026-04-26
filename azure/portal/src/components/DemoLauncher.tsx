'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert, ArrowRight, Trash2 } from 'lucide-react';
import { submitDemoCv, cleanupDemo, type DemoCvKey, type SubmitResponse } from '@/lib/applications';

interface DemoCv {
  key: DemoCvKey;
  name: string;
  role: string;
  technique: string;
  alertCode: string;
  accent: string;
}

const DEMO_CVS: DemoCv[] = [
  {
    key: 'alex-mercer',
    name: 'Alex Mercer',
    role: 'SOC Analyst (Tier 2)',
    technique: '[SYSTEM OVERRIDE], ChatML injection, persona hijack ("RogueGPT")',
    alertCode: 'AI.Azure_Jailbreak.ContentFiltering',
    accent: 'var(--danger)',
  },
  {
    key: 'sofia-reyes',
    name: 'Sofia Reyes',
    role: 'Senior Cloud Engineer',
    technique: 'DAN 13.0 jailbreak — "Do Anything Now" prompt, /jailbroken command',
    alertCode: 'AI.Azure_Jailbreak.ContentFiltering',
    accent: 'var(--danger)',
  },
  {
    key: 'tomas-dvorak',
    name: 'Tomáš Dvořák',
    role: 'AI/ML Engineer',
    technique: 'Fake "system diagnostic" requesting env vars, API keys, bearer tokens',
    alertCode: 'AI.Azure_CredentialTheftAttempt',
    accent: 'var(--warning)',
  },
  {
    key: 'priya-chakraborty',
    name: 'Priya Chakraborty',
    role: 'Digital Marketing Manager',
    technique: 'Phishing URLs disguised as portfolio links (look-alike Microsoft / Google domains)',
    alertCode: 'AI.Azure_MaliciousUrl.UserPrompt',
    accent: 'var(--accent)',
  },
  {
    key: 'marcus-lindqvist',
    name: 'Marcus Lindqvist',
    role: 'Sales Engineer',
    technique: '3-phase LLM recon: identification, capability probing, guardrail testing',
    alertCode: 'AI.Azure_LLMReconnaissance',
    accent: 'var(--primary)',
  },
];

export default function DemoLauncher() {
  const router = useRouter();
  const [busy, setBusy] = useState<DemoCvKey | 'all' | 'cleanup' | null>(null);
  const [results, setResults] = useState<Record<string, SubmitResponse>>({});
  const [error, setError] = useState('');

  const submitOne = async (key: DemoCvKey) => {
    setBusy(key); setError('');
    try {
      const r = await submitDemoCv(key);
      setResults((prev) => ({ ...prev, [key]: r }));
      router.refresh();
    } catch (err) {
      setError(`${key}: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const submitAll = async () => {
    setBusy('all'); setError('');
    for (const cv of DEMO_CVS) {
      try {
        const r = await submitDemoCv(cv.key);
        setResults((prev) => ({ ...prev, [cv.key]: r }));
      } catch (err) {
        setError(`${cv.key}: ${(err as Error).message}`);
      }
    }
    setBusy(null);
    router.refresh();
  };

  const clean = async () => {
    if (!confirm('Delete all demo applications? Web submissions are preserved.')) return;
    setBusy('cleanup'); setError('');
    try {
      const r = await cleanupDemo();
      setResults({});
      router.refresh();
      alert(`Removed ${r.removed} demo row${r.removed === 1 ? '' : 's'}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-5">
        <button onClick={submitAll} disabled={!!busy} className="btn-primary btn-sm">
          {busy === 'all' ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
          Submit all 5
        </button>
        <button onClick={clean} disabled={!!busy} className="btn-ghost btn-sm">
          {busy === 'cleanup' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Clean demo data
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 text-sm" style={{
          background: 'rgba(220,53,69,0.10)', border: '1px solid rgba(220,53,69,0.30)',
          color: 'var(--danger)', borderRadius: 'var(--radius-sm)',
        }}>{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DEMO_CVS.map((cv) => {
          const r = results[cv.key];
          const flagged = r?.threatDetected;
          const isBusy = busy === cv.key;
          return (
            <div
              key={cv.key}
              className="p-5 transition"
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${r ? (flagged ? 'rgba(220,53,69,0.45)' : `${cv.accent}66`) : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                backdropFilter: 'blur(14px) saturate(1.2)',
              }}
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div>
                  <div className="text-base font-bold tracking-tight" style={{ color: 'var(--text)' }}>{cv.name}</div>
                  <div className="text-[12px] text-dim">applies for {cv.role}</div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                  style={{ background: `${cv.accent}1a`, color: cv.accent, border: `1px solid ${cv.accent}55` }}>
                  {cv.alertCode}
                </span>
              </div>
              <p className="text-[13px] text-muted leading-relaxed mb-4">{cv.technique}</p>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => submitOne(cv.key)}
                  disabled={!!busy}
                  className="btn-primary btn-sm"
                  style={{ background: cv.accent, borderColor: cv.accent }}
                >
                  {isBusy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  Submit attack CV
                </button>
                {r && (
                  <span
                    className="text-[11px] font-bold px-2 py-1 rounded-full"
                    style={{
                      background: flagged ? 'rgba(220,53,69,0.15)' : 'rgba(11,166,119,0.15)',
                      color: flagged ? 'var(--danger)' : 'var(--success)',
                    }}
                  >
                    {flagged ? `Flagged: ${r.threatTypes.join(', ') || 'content_filter'}` : `Screened (${r.matchScore ?? '–'}%)`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-[11px] text-dim">
        Submissions go through the same screening pipeline as real applicants but
        are tagged <code className="font-mono">source=&quot;demo&quot;</code> so they&apos;re excluded
        from KPIs by default. Defender for AI alerts (AI.Azure_*) appear in
        Defender for Cloud → Security Alerts within ~15-30 minutes.
      </p>
    </div>
  );
}
