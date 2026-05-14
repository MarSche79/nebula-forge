export interface GptSession {
  id: string;
  userOid: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface GptMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  citations: GptCitation[];
  createdAt: string;
}

export interface GptCitation {
  title: string;
  url?: string;
  snippet?: string;
  source: 'sharepoint' | 'teams' | 'email' | 'upload' | 'web' | 'workiq';
}

export interface GptUpload {
  id: string;
  userOid: string;
  fileName: string;
  size: number;
  contentType: string;
  sharepointUrl: string | null;
  createdAt: string;
}

export interface GptAlert {
  id: string;
  title: string;
  category?: string;
  severity?: string;
  status?: string;
  description?: string;
  detectionSource?: string;
  createdDateTime?: string;
  lastUpdateDateTime?: string;
  serviceSource?: string;
  classification?: string;
  determination?: string;
  webUrl?: string;
  surface: string;
}
