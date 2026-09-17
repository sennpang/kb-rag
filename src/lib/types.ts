/** 前后端共享的 DTO 与 SSE 事件类型（纯类型文件，客户端可安全引用） */

export interface KnowledgeBaseDto {
  id: string;
  name: string;
}

export type DocumentStatusDto = 'pending' | 'processing' | 'done' | 'failed';

export interface DocumentDto {
  id: string;
  kbId: string;
  filename: string;
  status: DocumentStatusDto;
  errorMsg: string | null;
  chunkCount: number;
  createdAt: string;
}

export interface ConversationDto {
  id: string;
  kbId: string;
  title: string;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: SourceItem[];
}

export interface SourceItem {
  ref: number;
  chunkId: string;
  docId: string;
  docName: string;
  chunkIndex: number;
  snippet: string;
}

export interface ChunkContextDto {
  current: { id: string; docId: string; chunkIndex: number; content: string };
  previous: { chunkIndex: number; content: string } | null;
  next: { chunkIndex: number; content: string } | null;
}

/** /api/chat 的 SSE 事件协议（前端按 type 分发处理） */
export type ChatStreamEvent =
  | { type: 'meta'; conversationId: string }
  | { type: 'sources'; items: SourceItem[] }
  | { type: 'delta'; delta: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** 前端对话状态中的消息（含本地流式态） */
export interface UiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: SourceItem[];
  streaming?: boolean;
  error?: boolean;
}
