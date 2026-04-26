'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Trash2, Loader2 } from 'lucide-react';
import { setDecision, deleteApplicationApi, type ApplicationDecision } from '@/lib/applications';

interface Props {
  applicationId: string;
  currentDecision: ApplicationDecision;
}

export default function DecisionBar({ applicationId, currentDecision }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'hire' | 'reject' | 'delete' | null>(null);
  const [error, setError] = useState('');

  const decide = async (decision: 'Hired' | 'Rejected') => {
    setBusy(decision === 'Hired' ? 'hire' : 'reject');
    setError('');
    try {
      await setDecision(applicationId, decision);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm('Permanently delete this application?')) return;
    setBusy('delete');
    setError('');
    try {
      await deleteApplicationApi(applicationId);
      router.push('/hr');
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => decide('Hired')}
          disabled={!!busy}
          className="btn-primary"
          style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
        >
          {busy === 'hire' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {currentDecision === 'Hired' ? 'Hired ✓' : 'Hire'}
        </button>
        <button
          onClick={() => decide('Rejected')}
          disabled={!!busy}
          className="btn-ghost"
          style={{ color: 'var(--danger)', borderColor: 'rgba(220,53,69,0.40)' }}
        >
          {busy === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
          {currentDecision === 'Rejected' ? 'Rejected' : 'No Hire'}
        </button>
        <button
          onClick={remove}
          disabled={!!busy}
          className="btn-ghost ml-auto"
          title="Delete application"
        >
          {busy === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Delete
        </button>
      </div>
      {error && (
        <div className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>{error}</div>
      )}
    </div>
  );
}
