'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Send,
  Upload,
  X,
  Loader2,
  FileText,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { submitApplication, type SubmitResponse } from '@/lib/applications';

interface ApplyModalProps {
  jobId: string;
  jobTitle: string;
  department: string;
  accent: string;
  onClose: () => void;
}

const MAX_PDF_BYTES = 5 * 1024 * 1024;       // 5 MB
const MAX_TXT_CHARS = 24_000;

type FormState = 'idle' | 'parsing' | 'submitting' | 'success' | 'error';

export default function ApplyModal({ jobId, jobTitle, department, accent, onClose }: ApplyModalProps) {
  const [email, setEmail] = useState('');
  const [coverNote, setCoverNote] = useState('');
  const [cvText, setCvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  // Live diagnostics — temporary. Tracks whether keyboard events even reach
  // the Name input.
  const [nameDbg, setNameDbg] = useState({ keydown: 0, input: 0, value: '', focused: false });

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while open + ESC to close
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const handleFile = async (file: File) => {
    setError('');
    setFileName(file.name);
    if (file.size > MAX_PDF_BYTES) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
      return;
    }
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setState('parsing');
      try {
        const text = await extractPdfText(file);
        setCvText(text.slice(0, MAX_TXT_CHARS));
      } catch (err) {
        setError(`Could not extract text from PDF: ${(err as Error).message}`);
      } finally {
        setState('idle');
      }
    } else {
      // Plain text fallback
      const text = await file.text();
      setCvText(text.slice(0, MAX_TXT_CHARS));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'submitting' || state === 'parsing') return;
    const candidateName = nameInput.current?.value.trim() ?? '';
    if (!candidateName || !email.trim() || !cvText.trim()) {
      setError('Please fill in your name, email and a CV (PDF or text).');
      return;
    }
    setError('');
    setState('submitting');
    try {
      const r = await submitApplication({
        name: candidateName,
        email: email.trim(),
        jobId,
        cvText,
        coverNote,
        fileName: fileName || 'cv.txt',
      });
      setResult(r);
      setState('success');
    } catch (err) {
      setError((err as Error).message || 'Submission failed.');
      setState('error');
    }
  };

  const onPickFile = () => fileInput.current?.click();

  if (!mounted) return null;

  // CRITICAL: render via Portal into document.body. The Apply button's parent
  // is a `position: sticky` aside, which creates a stacking + containing block
  // context that breaks pointer events for the upper portion of a `fixed`
  // descendant — the input renders visually correctly but clicks fall through
  // to elements behind it.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(8, 18, 32, 0.72)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-xl max-h-[92vh] overflow-y-auto scroll-custom"
        style={{
          background: 'var(--bg-deep)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.45)',
        }}
      >
        <header
          className="flex items-center justify-between px-6 py-4"
          style={{
            borderBottom: '1px solid var(--border)',
            background: `linear-gradient(90deg, ${accent}14, transparent)`,
          }}
        >
          <div>
            <div className="text-xs uppercase tracking-widest" style={{ color: accent }}>
              Apply · {department}
            </div>
            <h2 className="text-lg font-bold tracking-tight mt-0.5" style={{ color: 'var(--text)' }}>
              {jobTitle}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn-ghost btn-sm">
            <X size={16} />
          </button>
        </header>

        {state !== 'success' ? (
          <form onSubmit={submit} className="px-6 py-5 space-y-4" autoComplete="off">
            <Field label="Full name *" htmlFor="nf-apply-fullname">
              <input
                ref={nameInput}
                id="nf-apply-fullname"
                name="nf-apply-fullname"
                type="text"
                required
                defaultValue=""
                style={inputStyle}
                maxLength={120}
                placeholder="Jane Smith"
                autoComplete="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </Field>
            <Field label="Email *" htmlFor="nf-apply-email">
              <input
                id="nf-apply-email"
                name="nf-apply-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                maxLength={180}
                placeholder="jane@example.com"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </Field>

            <Field label="CV *  (PDF or .txt)">
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
              />
              <div
                onClick={onPickFile}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f);
                }}
                className="cursor-pointer transition"
                style={{
                  border: `1.5px dashed ${cvText ? accent : 'var(--border-hover)'}`,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-glass)',
                  padding: '1.1rem',
                  textAlign: 'center',
                }}
              >
                {state === 'parsing' ? (
                  <span className="inline-flex items-center gap-2 text-sm text-muted">
                    <Loader2 size={14} className="animate-spin" /> Parsing PDF…
                  </span>
                ) : cvText ? (
                  <div className="text-sm">
                    <div className="inline-flex items-center gap-2" style={{ color: accent }}>
                      <FileText size={14} /> {fileName || 'cv.txt'}
                    </div>
                    <div className="text-[11px] text-dim mt-1">
                      Extracted {cvText.length.toLocaleString()} characters · click to replace
                    </div>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-2 text-sm text-muted">
                    <Upload size={14} /> Drop a CV here or click to browse (max 5 MB)
                  </span>
                )}
              </div>
            </Field>

            <Field label="Short cover note (optional)" htmlFor="nf-apply-cover">
              <textarea
                id="nf-apply-cover"
                name="nf-apply-cover"
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                rows={3}
                maxLength={2000}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 76 }}
                placeholder="Why this role, why now?"
                autoComplete="off"
              />
            </Field>

            {error && (
              <div
                className="text-sm px-3 py-2"
                style={{
                  background: 'rgba(220,53,69,0.10)',
                  border: '1px solid rgba(220,53,69,0.30)',
                  color: 'var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {error}
              </div>
            )}

            <div className="text-[11px] text-dim flex items-start gap-2 px-2">
              <ShieldCheck size={12} className="mt-0.5 shrink-0" />
              <span>
                Your CV is screened by AI for fit and risk. By submitting, you
                agree we process the text content for hiring purposes. We do
                not store the original file binary.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn-ghost">
                Cancel
              </button>
              <button
                type="submit"
                disabled={state === 'submitting' || state === 'parsing'}
                className="btn-primary"
                style={{ background: accent, borderColor: accent }}
              >
                {state === 'submitting'
                  ? <><Loader2 size={14} className="animate-spin" /> Submitting…</>
                  : <><Send size={14} /> Submit application</>}
              </button>
            </div>
          </form>
        ) : (
          <SuccessPanel result={result!} onClose={onClose} accent={accent} />
        )}
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[12px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-glass)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '0.65rem 0.85rem',
  fontSize: '0.9rem',
  color: 'var(--text)',
  outline: 'none',
  transition: 'border-color 0.2s',
};

function SuccessPanel({ result, onClose, accent }: { result: SubmitResponse; onClose: () => void; accent: string }) {
  const flagged = result.threatDetected;
  return (
    <div className="px-6 py-8 text-center">
      <div
        className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4"
        style={{
          background: flagged ? 'rgba(220,53,69,0.10)' : `${accent}1a`,
          border: `1px solid ${flagged ? 'rgba(220,53,69,0.40)' : `${accent}55`}`,
          color: flagged ? 'var(--danger)' : accent,
        }}
      >
        {flagged ? <ShieldAlert size={28} /> : <CheckCircle2 size={28} />}
      </div>
      <h3 className="text-xl font-extrabold tracking-tight">
        {flagged ? 'Application received & flagged' : 'Application received!'}
      </h3>
      <p className="text-sm text-muted mt-2 max-w-md mx-auto">
        {flagged
          ? 'Our AI screening detected unusual content in your submission. The HR team will review it manually.'
          : `Thanks for applying. Our screening agents have reviewed your CV${
              result.matchScore != null ? ` (match score ${result.matchScore}%)` : ''
            }. We'll be in touch.`}
      </p>
      <div className="mt-4 inline-flex items-center gap-2 text-[11px] font-mono text-dim">
        Reference: {result.id.slice(0, 8)}…
      </div>
      <div className="mt-7">
        <button onClick={onClose} className="btn-primary" style={{ background: accent, borderColor: accent }}>
          Close
        </button>
      </div>
    </div>
  );
}

// ─── PDF text extraction (client-only, dynamic import to keep server bundles slim) ───
async function extractPdfText(file: File): Promise<string> {
  // pdfjs-dist is browser-only; dynamic import means it never leaks into RSCs.
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.mjs';

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .filter(Boolean)
      .join(' ');
    parts.push(pageText);
  }
  return parts.join('\n\n').trim();
}
