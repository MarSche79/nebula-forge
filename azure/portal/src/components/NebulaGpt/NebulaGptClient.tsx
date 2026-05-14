'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Plus, Send, Loader2, Trash2, FileUp, Save, ExternalLink,
  Mic, PanelLeftClose, PanelLeftOpen, MessageSquare, Wrench, FileText,
} from 'lucide-react';
import type { GptSession, GptMessage, GptUpload } from '@/lib/gpt';

interface ChatProps {
  initialSessions: GptSession[];
  initialUser: { name?: string; oid?: string } | null;
}

interface ToolEvent {
  name: string;
  args?: unknown;
  result?: string;
}

const SUGGESTED = [
  { icon: '📅', text: 'What is on my calendar tomorrow?' },
  { icon: '📨', text: 'Summarise unread emails from the last 24 hours.' },
  { icon: '📊', text: 'Find the most recent budget deck in SharePoint.' },
  { icon: '✍️', text: 'Draft a one-page status update for project Nebula.' },
];

export default function NebulaGptClient({ initialSessions, initialUser }: ChatProps) {
  const [sessions, setSessions] = useState<GptSession[]>(initialSessions);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<GptMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [uploads, setUploads] = useState<GptUpload[]>([]);
  const [showUploads, setShowUploads] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Scroll-to-bottom when new content arrives
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, pendingText]);

  async function refreshSessions(): Promise<GptSession[]> {
    const r = await fetch('/api/gpt/sessions', { cache: 'no-store' });
    if (!r.ok) return sessions;
    const data = (await r.json()) as GptSession[];
    setSessions(data);
    return data;
  }

  async function refreshUploads(): Promise<void> {
    const r = await fetch('/api/gpt/uploads', { cache: 'no-store' });
    if (r.ok) setUploads(await r.json());
  }

  async function openSession(id: string): Promise<void> {
    setActiveId(id);
    setToolEvents([]);
    setPendingText('');
    const r = await fetch(`/api/gpt/sessions/${id}`, { cache: 'no-store' });
    if (!r.ok) return;
    const data = (await r.json()) as { session: GptSession; messages: GptMessage[] };
    setMessages(data.messages);
  }

  async function newSession(): Promise<string | null> {
    const r = await fetch('/api/gpt/sessions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    });
    if (!r.ok) return null;
    const s = (await r.json()) as GptSession;
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setMessages([]);
    setToolEvents([]);
    return s.id;
  }

  async function deleteSession(id: string): Promise<void> {
    if (!confirm('Delete this conversation?')) return;
    await fetch(`/api/gpt/sessions/${id}`, { method: 'DELETE' });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  async function send(text: string): Promise<void> {
    if (!text.trim() || streaming) return;
    let sid = activeId;
    if (!sid) sid = await newSession();
    if (!sid) return;

    // optimistic append
    const userMsg: GptMessage = {
      id: `tmp-${Date.now()}`, sessionId: sid, role: 'user',
      content: text, citations: [], createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setPendingText('');
    setToolEvents([]);
    setStreaming(true);

    try {
      const r = await fetch(`/api/gpt/chat/${sid}/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!r.ok || !r.body) {
        throw new Error(`Chat failed: ${r.status}`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let split: number;
        while ((split = buf.indexOf('\n\n')) >= 0) {
          const evtBlock = buf.slice(0, split);
          buf = buf.slice(split + 2);
          const evt = parseSseEvent(evtBlock);
          if (evt.event === 'text' && typeof evt.data?.delta === 'string') {
            fullText += evt.data.delta;
            setPendingText(fullText);
          } else if (evt.event === 'tool_call') {
            setToolEvents((t) => [...t, { name: String(evt.data?.name ?? '?'), args: evt.data?.args }]);
          } else if (evt.event === 'tool_result') {
            setToolEvents((t) => {
              const copy = [...t];
              const last = copy[copy.length - 1];
              if (last && last.name === evt.data?.name) last.result = String(evt.data?.preview ?? '');
              return copy;
            });
          } else if (evt.event === 'error') {
            fullText += `\n\n_[error]_ ${evt.data?.message ?? 'unknown'}`;
            setPendingText(fullText);
          }
        }
      }

      const assistantMsg: GptMessage = {
        id: `tmp-a-${Date.now()}`, sessionId: sid, role: 'assistant',
        content: fullText, citations: [], createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, assistantMsg]);
      setPendingText('');
      void refreshSessions();
    } catch (err) {
      const errMsg: GptMessage = {
        id: `err-${Date.now()}`, sessionId: sid, role: 'assistant',
        content: `**Error:** ${(err as Error).message}`, citations: [], createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, errMsg]);
      setPendingText('');
    } finally {
      setStreaming(false);
    }
  }

  async function handleFileUpload(file: File): Promise<void> {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/gpt/uploads', { method: 'POST', body: fd });
    if (r.ok) {
      await refreshUploads();
    } else {
      alert(`Upload failed: ${r.status}`);
    }
  }

  async function saveDocToSharePoint(content: string): Promise<void> {
    const fileName = prompt('File name (without extension):', `nebulagpt-${new Date().toISOString().slice(0, 10)}`);
    if (!fileName) return;
    const r = await fetch('/api/gpt/generate/save-doc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName, markdown: content }),
    });
    if (r.ok) {
      const data = (await r.json()) as { webUrl?: string };
      if (data.webUrl) window.open(data.webUrl, '_blank');
      else alert('Saved to SharePoint.');
    } else {
      alert(`Save failed: ${r.status}`);
    }
  }

  return (
    <div className="flex h-[calc(100vh-68px)]">
      {/* Sidebar */}
      <aside
        className="flex flex-col shrink-0 transition-all"
        style={{
          width: sidebarOpen ? 280 : 0,
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border)',
          backdropFilter: 'blur(14px) saturate(1.2)',
          overflow: 'hidden',
        }}
      >
        <div className="px-4 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => void newSession()} className="btn-primary btn-sm flex-1">
            <Plus size={14} /> New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-custom px-2 py-2">
          {sessions.length === 0 && (
            <div className="text-xs text-center py-6 italic" style={{ color: 'var(--text-dim)' }}>
              No conversations yet
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => void openSession(s.id)}
              className="group flex items-center gap-2 px-3 py-2 mb-1 cursor-pointer transition"
              style={{
                background: activeId === s.id ? 'var(--primary-glow)' : 'transparent',
                border: `1px solid ${activeId === s.id ? 'var(--primary-border)' : 'transparent'}`,
                borderRadius: 'var(--radius-sm)',
                color: activeId === s.id ? 'var(--primary-dark)' : 'var(--text)',
              }}
            >
              <MessageSquare size={13} className="shrink-0 opacity-60" />
              <span className="text-sm truncate flex-1">{s.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); void deleteSession(s.id); }}
                className="opacity-0 group-hover:opacity-100 transition"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="px-3 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={async () => { if (!showUploads) await refreshUploads(); setShowUploads((v) => !v); }}
            className="btn-ghost btn-sm w-full"
          >
            <FileUp size={13} /> Uploads ({uploads.length})
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-col flex-1 min-w-0">
        <header
          className="px-6 py-3 flex items-center gap-3"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', backdropFilter: 'blur(14px) saturate(1.2)' }}
        >
          <button onClick={() => setSidebarOpen((v) => !v)} className="btn-ghost btn-sm" aria-label="Toggle sidebar">
            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </button>
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-md"
            style={{ background: 'var(--primary-glow)', color: 'var(--primary)', border: '1px solid var(--primary-border)' }}
          >
            <Sparkles size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold tracking-tight" style={{ color: 'var(--text)' }}>NebulaGPT</div>
            <div className="text-[11px] text-dim">
              Internal assistant · grounded in your Threat Ninja Microsoft 365 data via WorkIQ
            </div>
          </div>
          <span className="pill" style={{ fontSize: '0.65rem' }}>
            {initialUser?.name ?? 'Crew'}
          </span>
        </header>

        {/* Messages */}
        <div ref={messagesRef} className="flex-1 overflow-y-auto scroll-custom px-6 py-6">
          <div className="mx-auto" style={{ maxWidth: 780 }}>
            {messages.length === 0 && !pendingText && (
              <Welcome onPick={(t) => void send(t)} />
            )}

            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onSaveDoc={(content) => void saveDocToSharePoint(content)}
              />
            ))}

            {pendingText && (
              <MessageBubble
                message={{
                  id: 'streaming',
                  sessionId: activeId ?? '',
                  role: 'assistant',
                  content: pendingText,
                  citations: [],
                  createdAt: new Date().toISOString(),
                }}
                streaming
                onSaveDoc={(content) => void saveDocToSharePoint(content)}
              />
            )}

            {toolEvents.length > 0 && (
              <div className="mt-2 mb-4 px-4 py-3"
                   style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                  <Wrench size={11} className="inline -mt-0.5 mr-1" /> Tool activity
                </div>
                {toolEvents.map((t, i) => (
                  <div key={i} className="text-xs font-mono mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--primary)' }}>→ {t.name}</span>
                    {t.result && <span className="opacity-60"> · {t.result.slice(0, 100)}{t.result.length > 100 ? '…' : ''}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div
          className="px-6 py-4"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)', backdropFilter: 'blur(14px) saturate(1.2)' }}
        >
          <div className="mx-auto flex items-end gap-2" style={{ maxWidth: 780 }}>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileUpload(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-ghost btn-sm shrink-0"
              title="Upload a file"
              disabled={streaming}
            >
              <FileUp size={14} />
            </button>
            <div
              className="flex-1 flex items-end"
              style={{
                background: 'var(--bg-deep)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 10px',
                transition: 'var(--transition)',
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={streaming ? 'NebulaGPT is thinking…' : 'Ask NebulaGPT — it can see your emails, meetings, SharePoint, Teams, and uploads.'}
                rows={1}
                style={{
                  flex: 1, resize: 'none', background: 'transparent',
                  outline: 'none', color: 'var(--text)', fontSize: '0.9rem',
                  fontFamily: 'inherit', minHeight: 24, maxHeight: 200,
                  border: 'none',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                disabled={streaming}
              />
            </div>
            <button
              type="button"
              onClick={() => void send(input)}
              className="btn-primary btn-sm shrink-0"
              disabled={streaming || !input.trim()}
              aria-label="Send"
            >
              {streaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          <div className="mx-auto mt-2 text-[10px] text-center" style={{ maxWidth: 780, color: 'var(--text-dim)' }}>
            NebulaGPT can ground answers in your Microsoft 365 data. Verify anything important before acting on it.
          </div>
        </div>
      </main>

      {showUploads && (
        <UploadsDrawer
          uploads={uploads}
          onClose={() => setShowUploads(false)}
          onUpload={(f) => void handleFileUpload(f)}
        />
      )}

      <style jsx global>{`
        .nebulagpt-md h1, .nebulagpt-md h2, .nebulagpt-md h3 {
          font-weight: 700; letter-spacing: -0.01em; margin: 0.75em 0 0.4em; color: var(--text);
        }
        .nebulagpt-md h1 { font-size: 1.35rem; }
        .nebulagpt-md h2 { font-size: 1.15rem; }
        .nebulagpt-md h3 { font-size: 1rem; }
        .nebulagpt-md p { margin: 0.5em 0; line-height: 1.6; }
        .nebulagpt-md ul, .nebulagpt-md ol { margin: 0.4em 0 0.6em 1.2em; line-height: 1.6; }
        .nebulagpt-md li { margin: 0.15em 0; }
        .nebulagpt-md code { background: var(--bg-glass); padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.85em; }
        .nebulagpt-md pre { background: var(--bg-glass); padding: 0.7em 1em; border-radius: var(--radius-sm); overflow-x: auto; margin: 0.6em 0; border: 1px solid var(--border); }
        .nebulagpt-md pre code { background: transparent; padding: 0; }
        .nebulagpt-md strong { color: var(--text); font-weight: 700; }
        .nebulagpt-md a { color: var(--primary); text-decoration: underline; }
        .nebulagpt-md blockquote { border-left: 3px solid var(--primary-border); padding: 0.2em 0.8em; margin: 0.6em 0; color: var(--text-muted); }
        .nebulagpt-md table { border-collapse: collapse; margin: 0.5em 0; font-size: 0.85em; }
        .nebulagpt-md th, .nebulagpt-md td { border: 1px solid var(--border); padding: 0.4em 0.7em; }
        .nebulagpt-md th { background: var(--bg-glass); font-weight: 700; }
      `}</style>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="text-center py-16">
      <div
        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
        style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))', color: '#fff' }}
      >
        <Sparkles size={28} />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
        How can I help you today?
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        Ask about your emails, meetings, SharePoint documents, Teams chats or people.
        NebulaGPT cites its sources.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-8 mx-auto max-w-2xl text-left">
        {SUGGESTED.map((s) => (
          <button
            key={s.text}
            onClick={() => onPick(s.text)}
            className="px-4 py-3 text-sm transition"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span className="text-base mr-2">{s.icon}</span>
            {s.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, streaming, onSaveDoc }: { message: GptMessage; streaming?: boolean; onSaveDoc: (content: string) => void }) {
  const isUser = message.role === 'user';
  const hasMarkdown = !isUser && message.content.length > 200;

  return (
    <div className="mb-5 flex gap-3" style={{ flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded-full shrink-0 mt-0.5"
        style={
          isUser
            ? { background: 'var(--bg-glass)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
            : { background: 'linear-gradient(135deg, var(--primary), var(--accent))', color: '#fff' }
        }
      >
        {isUser ? <span className="text-xs font-bold">You</span> : <Sparkles size={14} />}
      </span>
      <div className="min-w-0 flex-1" style={{ maxWidth: 'min(680px, 100%)' }}>
        <div
          className={`nebulagpt-md ${isUser ? 'inline-block' : ''}`}
          style={
            isUser
              ? {
                  background: 'var(--primary-glow)',
                  color: 'var(--text)',
                  padding: '10px 14px',
                  border: '1px solid var(--primary-border)',
                  borderRadius: 'var(--radius-md)',
                  whiteSpace: 'pre-wrap',
                  marginLeft: 'auto',
                }
              : {
                  color: 'var(--text)',
                  fontSize: '0.92rem',
                }
          }
          // tiny in-page markdown renderer keeps the bundle small
          dangerouslySetInnerHTML={isUser ? undefined : { __html: renderMarkdown(message.content) }}
        >
          {isUser ? message.content : null}
        </div>
        {!isUser && !streaming && hasMarkdown && (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => onSaveDoc(message.content)}
              className="btn-ghost btn-sm"
              style={{ fontSize: '0.7rem' }}
              title="Save this answer as a Markdown file to the NebulaGPT SharePoint library"
            >
              <Save size={11} /> Save to SharePoint
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(message.content)}
              className="btn-ghost btn-sm"
              style={{ fontSize: '0.7rem' }}
            >
              <FileText size={11} /> Copy markdown
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadsDrawer({ uploads, onClose, onUpload }: { uploads: GptUpload[]; onClose: () => void; onUpload: (f: File) => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="fixed inset-y-0 right-0 w-96 z-40 flex flex-col"
         style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', backdropFilter: 'blur(20px) saturate(1.2)', boxShadow: '-20px 0 40px rgba(0,0,0,0.2)' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="text-base font-bold" style={{ color: 'var(--text)' }}>Uploads</div>
        <button onClick={onClose} className="btn-ghost btn-sm">×</button>
      </div>
      <div className="p-4">
        <input ref={fileInputRef} type="file" className="hidden"
               onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        <button onClick={() => fileInputRef.current?.click()} className="btn-primary btn-sm w-full">
          <FileUp size={13} /> Upload to SharePoint
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scroll-custom px-4 pb-4">
        {uploads.length === 0 ? (
          <div className="text-xs text-center py-6 italic" style={{ color: 'var(--text-dim)' }}>No uploads yet</div>
        ) : (
          uploads.map((u) => (
            <div key={u.id} className="mb-2 px-3 py-2"
                 style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <div className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{u.fileName}</div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {(u.size / 1024).toFixed(1)} KB · {new Date(u.createdAt).toLocaleString()}
              </div>
              {u.sharepointUrl && (
                <a href={u.sharepointUrl} target="_blank" rel="noreferrer" className="text-[11px] inline-flex items-center gap-1 mt-1" style={{ color: 'var(--primary)' }}>
                  <ExternalLink size={10} /> Open in SharePoint
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Tiny safe-ish markdown renderer (subset). For production we'd use react-markdown
// + remark-gfm; this keeps the bundle small for a demo.
function renderMarkdown(src: string): string {
  // escape HTML
  let s = src.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  // fenced code blocks
  s = s.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_m, _lang, code) => `<pre><code>${code}</code></pre>`);
  // inline code
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // bold + italic
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // headings
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  // unordered list
  s = s.replace(/(?:^|\n)((?:- [^\n]+\n?)+)/g, (_m, block: string) => {
    const items = block.trim().split(/\n/).map((l) => l.replace(/^- /, '')).map((t) => `<li>${t}</li>`).join('');
    return `\n<ul>${items}</ul>`;
  });
  // paragraphs (split on double newlines), preserving block elements
  const blocks = s.split(/\n{2,}/);
  s = blocks.map((b) => {
    const trimmed = b.trim();
    if (!trimmed) return '';
    if (/^<(h\d|ul|ol|pre|blockquote|table)/.test(trimmed)) return trimmed;
    return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n');
  return s;
}

interface SseEvent { event: string; data: Record<string, unknown> | null }
function parseSseEvent(block: string): SseEvent {
  let event = 'message';
  let data: string | null = null;
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data = (data ?? '') + line.slice(5).trim();
  }
  let parsed: Record<string, unknown> | null = null;
  if (data) {
    try { parsed = JSON.parse(data) as Record<string, unknown>; } catch { /* ignore */ }
  }
  return { event, data: parsed };
}
