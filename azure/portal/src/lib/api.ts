const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) || '';

function url(path: string): string {
  if (!API_BASE) return path;
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

export interface AgentSummary {
  id: string;
  name: string;
  status?: string;
  online?: boolean;
}

export async function getAgents(): Promise<AgentSummary[]> {
  const res = await fetch(url('/api/agents'), { cache: 'no-store' });
  if (!res.ok) throw new Error(`getAgents failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.agents)) return data.agents;
  return [];
}

export interface MeResponse {
  authenticated: boolean;
  name?: string;
  email?: string;
  upn?: string;
}

export async function getMe(): Promise<MeResponse | null> {
  try {
    const res = await fetch(url('/api/me'), {
      cache: 'no-store',
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}

export async function resetChat(threadId?: string): Promise<void> {
  await fetch(url('/api/chat/reset'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId }),
  }).catch(() => {});
}

export interface ChatStreamHandlers {
  onToken?: (token: string) => void;
  onThread?: (threadId: string) => void;
  onTool?: (name: string, args?: unknown) => void;
  onToolResult?: (name: string, result?: unknown) => void;
  onComplete?: (full: string) => void;
  onError?: (err: Error) => void;
  signal?: AbortSignal;
}

export async function chatStream(
  message: string,
  threadId: string | undefined,
  handlers: ChatStreamHandlers,
): Promise<string> {
  const { onToken, onThread, onComplete, onError, signal } = handlers;

  let res: Response;
  try {
    res = await fetch(url('/api/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ message, threadId }),
      signal,
    });
  } catch (err) {
    onError?.(err as Error);
    throw err;
  }

  if (!res.ok || !res.body) {
    const err = new Error(`chat failed: ${res.status}`);
    onError?.(err);
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  const { onTool, onToolResult } = handlers;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const evt = parseSseEvent(raw);
        if (!evt) continue;

        if (evt.event === 'token' || evt.event === 'message' || evt.event === 'delta') {
          const tok = extractTokenData(evt.data);
          if (tok) {
            full += tok;
            onToken?.(tok);
          }
        } else if (evt.event === 'thread') {
          const tid = extractThreadId(evt.data);
          if (tid) onThread?.(tid);
        } else if (evt.event === 'tool') {
          const parsed = safeParse(evt.data);
          const name = (parsed && typeof parsed === 'object' && 'name' in parsed)
            ? String((parsed as { name: unknown }).name)
            : '';
          if (name) onTool?.(name, parsed);
        } else if (evt.event === 'tool-result') {
          const parsed = safeParse(evt.data);
          const name = (parsed && typeof parsed === 'object' && 'name' in parsed)
            ? String((parsed as { name: unknown }).name)
            : '';
          if (name) onToolResult?.(name, parsed);
        } else if (evt.event === 'done' || evt.event === 'complete') {
          onComplete?.(full);
          return full;
        } else if (evt.event === 'error') {
          const err = new Error(evt.data || 'stream error');
          onError?.(err);
          throw err;
        } else if (!evt.event && evt.data) {
          // default "data:" frames — treat as raw token text
          full += evt.data;
          onToken?.(evt.data);
        }
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') onError?.(err as Error);
    throw err;
  }

  onComplete?.(full);
  return full;
}

function safeParse(data: string): unknown {
  if (!data) return null;
  try { return JSON.parse(data); } catch { return data; }
}

function parseSseEvent(raw: string): { event?: string; data: string } | null {
  if (!raw.trim()) return null;
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  return { event, data: dataLines.join('\n') };
}

function extractTokenData(data: string): string {
  if (!data) return '';
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed === 'string') return parsed;
    return parsed.token ?? parsed.delta ?? parsed.content ?? parsed.text ?? '';
  } catch {
    return data;
  }
}

function extractThreadId(data: string): string {
  try {
    const parsed = JSON.parse(data);
    return parsed.threadId ?? parsed.thread_id ?? parsed.id ?? '';
  } catch {
    return data;
  }
}
