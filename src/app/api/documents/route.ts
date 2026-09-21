import { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import {
  countDocumentsInKb,
  countRecentDocumentsByOwner,
  documentExists,
  insertDocument,
  knowledgeBaseExists,
  listDocuments,
} from '@/lib/db/repositories';
import { ingestDocument } from '@/lib/rag/ingest';
import { isSupportedFile } from '@/lib/rag/parsers';
import { ApiError, handleRoute, parseParams, parseQuery } from '@/lib/http/route';
import { requireUser, requireUserId } from '@/lib/auth/session';
import { isQuotaExempt } from '@/lib/quota';
import { sha256Hex } from '@/lib/crypto';
import { kbParamSchema } from '@/lib/validation/schemas';
import type { DocumentDto } from '@/lib/types';

export const runtime = 'nodejs';
// 上传走同步索引流水线（解析+向量化），Vercel Hobby 函数超时上限 60s
export const maxDuration = 60;

// 上传配额：单库总量封顶防存储膨胀，用户时间窗配额防刷接口/烧向量化费用
const KB_DOCUMENT_LIMIT = 100;
const USER_HOURLY_UPLOAD_LIMIT = 30;
const USER_DAILY_UPLOAD_LIMIT = 200;

export async function GET(req: NextRequest): Promise<Response> {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { kbId } = parseQuery(req.nextUrl.searchParams, kbParamSchema);
    if (!(await knowledgeBaseExists(kbId, userId))) throw new ApiError('知识库不存在', 404);
    const docs = await listDocuments(kbId);
    const dto: DocumentDto[] = docs.map(({ mimeType: _, ...doc }) => doc);
    return Response.json(dto);
  });
}

/** 上传文档：落库 → 同步执行 解析/切分/向量化 流水线（状态机会实时落库）。 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleRoute(async () => {
    const { id: userId, email } = await requireUser();
    const quotaExempt = isQuotaExempt(email);
    const form = await req.formData();
    const kbId = String(form.get('kbId') ?? '');
    const file = form.get('file');

    parseParams({ kbId }, kbParamSchema);
    if (!(file instanceof File)) throw new ApiError('缺少 file 文件', 422);
    // dev 模式 / 白名单账号不限文件大小（线上受平台函数 60s 超时约束，超大文件仍可能索引超时）
    if (!quotaExempt && file.size > env.MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new ApiError(`文件超过 ${env.MAX_FILE_SIZE_MB}MB 限制`, 413);
    }
    if (!isSupportedFile(file.name, file.type)) {
      throw new ApiError('仅支持 PDF / DOCX / Markdown / TXT', 422);
    }
    if (!(await knowledgeBaseExists(kbId, userId))) throw new ApiError('知识库不存在', 404);

    // 数量配额先于哈希/索引校验，尽早拦截且不消耗解析与向量化资源；豁免账号全部放开
    if (!quotaExempt) {
      if ((await countDocumentsInKb(kbId)) >= KB_DOCUMENT_LIMIT) {
        throw new ApiError(`该知识库文档已达 ${KB_DOCUMENT_LIMIT} 个上限，请删除后再传`, 429);
      }
      const [uploadedHourly, uploadedDaily] = await Promise.all([
        countRecentDocumentsByOwner(userId, 3600),
        countRecentDocumentsByOwner(userId, 86400),
      ]);
      if (uploadedHourly >= USER_HOURLY_UPLOAD_LIMIT) {
        throw new ApiError('上传过于频繁，请 1 小时后再试', 429);
      }
      if (uploadedDaily >= USER_DAILY_UPLOAD_LIMIT) {
        throw new ApiError('今日上传量已达上限，请明天再试', 429);
      }
    }

    // 内容指纹以后端重算为准（前端 hash 仅用于即时提示，不可信任）
    const contentHash = sha256Hex(new Uint8Array(await file.arrayBuffer()));
    if (await documentExists(kbId, contentHash)) {
      throw new ApiError('该文档内容已存在于当前知识库，无需重复上传', 409);
    }

    const doc = await insertDocument({ kbId, filename: file.name, mimeType: file.type, contentHash });

    try {
      await ingestDocument({ docId: doc.id, kbId, file, quotaExempt });
    } catch (error) {
      // 失败状态已在流水线内落库；返回 422 让前端展示 failed 与原因，而不是吞掉响应
      const message = error instanceof Error ? error.message : '索引失败';
      return Response.json({ id: doc.id, status: 'failed', error: message }, { status: 422 });
    }

    return Response.json({ id: doc.id, status: 'done' }, { status: 201 });
  });
}
