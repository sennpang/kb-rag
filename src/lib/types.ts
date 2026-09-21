/** 前后端共享的 DTO 与 SSE 事件类型（纯类型文件，客户端可安全引用） */
import type { CostEstimate } from './ai/pricing';

export type { CostEstimate };

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
  folderId: string | null;
  createdAt: string;
}

/** 知识库内的文件夹（parentId 为 null 即顶层）。 */
export interface FolderDto {
  id: string;
  kbId: string;
  parentId: string | null;
  name: string;
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
  tokenInput: number | null;
  tokenOutput: number | null;
  cost: CostEstimate | null;
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
  | { type: 'done'; usage: TokenUsage; cost: CostEstimate | null }
  | { type: 'error'; message: string };

/** 单次问答的真实 token 用量（模型返回，非估算）。 */
export interface TokenUsage {
  input: number;
  output: number;
}

/** 前端对话状态中的消息（含本地流式态） */
export interface UiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: SourceItem[];
  tokenInput?: number | null;
  tokenOutput?: number | null;
  cost?: CostEstimate | null;
  streaming?: boolean;
  error?: boolean;
}
