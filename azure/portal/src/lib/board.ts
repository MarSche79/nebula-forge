export interface BoardAgent {
  id: string;
  display_name: string;
  description: string;
  default_tool: string;
  enabled: boolean;
}

export interface BoardTask {
  id: string;
  title: string;
  body: string | null;
  agentId: string | null;
  status: 'backlog' | 'in_progress' | 'blocked' | 'done';
  priority: number;
  source: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  lastResult: unknown;
}

export interface BoardActivity {
  id: number;
  taskId: string | null;
  agentId: string;
  surface: 'sharepoint' | 'teams' | 'purview' | 'defender' | 'system';
  action: string;
  detail: Record<string, unknown>;
  externalUrl: string | null;
  createdAt: string;
}
