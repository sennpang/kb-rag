/** 文档处理状态机 */
export type DocumentStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  createdAt: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  kbId: string;
  filename: string;
  status: DocumentStatus;
  mimeType: string | null;
  errorMsg: string | null;
  chunkCount: number;
  contentHash: string | null;
  createdAt: string;
}

export interface ChunkRecord {
  id: string;
  docId: string;
  kbId: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  kbId: string;
  title: string;
  createdAt: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  sources: unknown;
  createdAt: string;
}

/** 邮箱验证码记录（仅服务端使用） */
export interface VerificationCode {
  id: string;
  email: string;
  purpose: string;
  codeHash: string;
  ipHash: string | null;
  attempts: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}
