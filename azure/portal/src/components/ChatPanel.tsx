'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  Send,
  RefreshCw,
  Bot,
  User,
  Sparkles,
  Loader2,
  Wrench,
} from 'lucide-react';
import { chatStream, resetChat } from '@/lib/api';
import { AGENTS } from '@/lib/agents';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  tools?: string[];
}

const STORAGE_KEY = 'nf-command-thread';

const QUICK_STARTERS = [
  'List all crew members on the roster.',
  "Are there any active safety incidents?",
  'Show me the current power grid overview.',
  'Plan a survey mission to Asteroid Theta-7.',
  'Run diagnostics on the Primary Fusion Reactor.',
  "What experiments are currently active?",
];

function findAgentByTool(toolName: string) {
  const cleaned = toolName.replace(/^ask_/, '');
  return AGENTS.find(
    (a) =>
      cleaned.includes(a.id) ||
      cleaned.includes(a.shortName.toLowerCase()) ||
      cleaned.includes(a.name.toLowerCase().replace(/\s+/g, '_')),
  );
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored) setThreadId(stored);
    } catch {/* ignore */}
  }, []);

  useEffect(() => {
    if (threadId) {
      try { window.sessionStorage.setItem(STORAGE_KEY, threadId); }
      catch {/* ignore */}
    }
  }, [threadId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;
    if (!overrideText) setInput('');

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
    const asstId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: asstId, role: 'assistant', content: '', pending: true, tools: [] },
    ]);

    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await chatStream(text, threadId, {
        signal: ctrl.signal,
        onThread: (tid) => setThreadId(tid),
        onTool: (toolName) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstId
                ? { ...m, tools: [...(m.tools ?? []), toolName] }
                : m,
            ),
          );
        },
        onToken: (tok) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === asstId ? { ...m, content: m.content + tok } : m)),
          );
        },
        onComplete: () => {
          setMessages((prev) =>
            prev.map((m) => (m.id === asstId ? { ...m, pending: false } : m)),
          );
        },
        onError: (err) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstId
                ? {
                    ...m,
                    pending: false,
                    content:
                      m.content ||
                      `⚠️ ${err.message || 'Failed to reach the Master Agent.'}`,
                  }
                : m,
            ),
          );
        },
      });
    } catch {/* handled in onError */}
    finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const reset = async () => {
    abortRef.current?.abort();
    await resetChat(threadId);
    setMessages([]);
    setThreadId(undefined);
    try { window.sessionStorage.removeItem(STORAGE_KEY); }
    catch {/* ignore */}
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const empty = messages.length === 0;

  return (
    <div
      className="flex flex-col"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        backdropFilter: 'blur(14px) saturate(1.2)',
        height: 'calc(100vh - 68px - 48px)',
        minHeight: 540,
      }}
    >
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              color: '#fff',
            }}
          >
            <Bot size={20} />
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>
              Master Agent
            </div>
            <div className="flex items-center gap-2 text-xs text-dim">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--success)' }}
              />
              Online · routing 9 specialists
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={reset}
          className="btn-ghost btn-sm"
          title="Start a new conversation"
        >
          <RefreshCw size={14} /> New thread
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto scroll-custom px-6 py-6 space-y-5">
        {empty ? (
          <EmptyState onPick={send} />
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
      </div>

      <div className="px-4 pt-2 pb-4" style={{ borderTop: '1px solid var(--border)' }}>
        {!empty && (
          <div className="flex flex-wrap gap-2 mb-2 px-2">
            {QUICK_STARTERS.slice(0, 3).map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={busy}
                className="text-xs px-3 py-1.5 rounded-full transition disabled:opacity-50"
                style={{
                  background: 'var(--bg-glass)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div
          className="flex items-end gap-2 rounded-nf-md p-3"
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask the Master Agent anything about the station…"
            className="flex-1 bg-transparent resize-none outline-none text-sm leading-snug max-h-32"
            style={{ color: 'var(--text)' }}
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={busy || !input.trim()}
            aria-label="Send message"
            className="btn-primary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
        <div className="text-[10px] text-dim mt-2 px-2">
          Enter to send · Shift+Enter for newline · Conversations are routed to one of 9 department agents.
        </div>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
            color: '#fff',
          }}
        >
          <Bot size={16} />
        </div>
      )}
      <div className="max-w-[78%]">
        {message.tools && message.tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {message.tools.map((t, i) => {
              const agent = findAgentByTool(t);
              return (
                <span
                  key={`${t}-${i}`}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                  style={{
                    background: agent ? `${agent.color}1a` : 'var(--bg-glass)',
                    border: `1px solid ${agent ? `${agent.color}55` : 'var(--border)'}`,
                    color: agent?.color ?? 'var(--text-muted)',
                  }}
                  title={`Routed to ${agent?.name ?? t}`}
                >
                  <Wrench size={10} /> {agent?.shortName ?? t}
                </span>
              );
            })}
          </div>
        )}
        <div
          className="text-sm px-4 py-3 whitespace-pre-wrap break-words"
          style={
            isUser
              ? {
                  background: 'var(--primary)',
                  color: '#fff',
                  borderRadius: '14px 14px 4px 14px',
                  boxShadow: '0 4px 14px rgba(14,138,181,0.25)',
                }
              : {
                  background: 'var(--bg-glass)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px 14px 14px 4px',
                }
          }
        >
          {message.content || (message.pending ? <PendingDots /> : '')}
        </div>
      </div>
      {isUser && (
        <div
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          <User size={16} />
        </div>
      )}
    </div>
  );
}

function PendingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-muted)' }} />
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-muted)', animationDelay: '120ms' }} />
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-muted)', animationDelay: '240ms' }} />
    </span>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const sampleAgents = useMemo(() => AGENTS.slice(0, 9), []);
  return (
    <div className="flex flex-col items-center justify-center text-center h-full">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: 'linear-gradient(135deg, var(--primary), var(--accent))',
          color: '#fff',
          boxShadow: '0 16px 40px rgba(14,138,181,0.30)',
        }}
      >
        <Sparkles size={28} />
      </div>
      <h2 className="text-2xl font-extrabold tracking-tight">
        Talk to the <span className="text-highlight">Master Agent</span>
      </h2>
      <p className="mt-2 text-sm text-muted max-w-md">
        Ask anything about the station. Your question is routed to the right
        specialist — engineering, science, safety, logistics, and six more.
      </p>

      <div className="mt-8 w-full max-w-2xl">
        <div className="text-xs uppercase tracking-widest text-dim mb-3">Try one</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {QUICK_STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="text-left text-sm px-4 py-3 rounded-nf-md transition hover:-translate-y-px"
              style={{
                background: 'var(--bg-glass)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 w-full max-w-2xl">
        <div className="text-xs uppercase tracking-widest text-dim mb-3">9 specialist agents on call</div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {sampleAgents.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
              style={{
                background: `${a.color}15`,
                border: `1px solid ${a.color}40`,
                color: a.color,
              }}
            >
              <span aria-hidden>{a.icon}</span> {a.shortName}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
