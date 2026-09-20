import type {
  ChunkContextDto,
  ConversationDto,
  DocumentDto,
  KnowledgeBaseDto,
  MessageDto,
} from './types';

/** 统一读取后端 JSON 错误体（{ error }），拿不到时退回状态码提示 */
async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `请求失败（${response.status}）`;
  } catch {
    return `请求失败（${response.status}）`;
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<T>;
}

async function request(url: string, init: RequestInit): Promise<void> {
  const response = await fetch(url, init);
  if (!response.ok && response.status !== 204) throw new Error(await readError(response));
}

/* ── 知识库 ── */
export const listKbs = () => getJson<KnowledgeBaseDto[]>('/api/kb');
export const createKb = (name: string) => postJson<KnowledgeBaseDto>('/api/kb', { name });

/* ── 文档 ── */
export const listDocuments = (kbId: string) =>
  getJson<DocumentDto[]>(`/api/documents?kbId=${encodeURIComponent(kbId)}`);

/**
 * 上传文档。contentHash 为前端计算的 SHA-256 指纹（后端会重算校验，仅作业务携带）。
 */
export async function uploadDocument(
  kbId: string,
  file: File,
  contentHash: string,
): Promise<void> {
  const form = new FormData();
  form.set('kbId', kbId);
  form.set('file', file);
  form.set('contentHash', contentHash);
  await request('/api/documents', { method: 'POST', body: form });
}

export const deleteDocument = (id: string) =>
  request(`/api/documents/${id}`, { method: 'DELETE' });

/* ── 会话 ── */
export const listConversations = (kbId: string) =>
  getJson<ConversationDto[]>(`/api/conversations?kbId=${encodeURIComponent(kbId)}`);

export const getConversation = (id: string) =>
  getJson<{ conversation: ConversationDto; messages: MessageDto[] }>(
    `/api/conversations/${id}`,
  );

export const deleteConversation = (id: string) =>
  request(`/api/conversations/${id}`, { method: 'DELETE' });

/* ── 引用溯源 ── */
export const fetchChunkContext = (docId: string, chunkIndex: number, signal?: AbortSignal) =>
  getJson<ChunkContextDto>(`/api/documents/${docId}/chunks/${chunkIndex}`, signal);

/* ── 认证 ── */
export const sendVerificationCode = (email: string) =>
  postJson<{ sent: boolean }>('/api/auth/send-code', { email });
