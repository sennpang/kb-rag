import { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import {
  insertDocument,
  knowledgeBaseExists,
  listDocuments,
} from '@/lib/db/repositories';
import { ingestDocument } from '@/lib/rag/ingest';
import { isSupportedFile } from '@/lib/rag/parsers';
import { ApiError, handleRoute, parseParams, parseQuery } from '@/lib/http/route';
import { kbParamSchema } from '@/lib/validation/schemas';
import type { DocumentDto } from '@/lib/types';

export const runtime = 'nodejs';
// 上传走同步索引流水线（解析+向量化），Vercel Hobby 函数超时上限 60s
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<Response> {
  return handleRoute(async () => {
    const { kbId } = parseQuery(req.nextUrl.searchParams, kbParamSchema);
    const docs = await listDocuments(kbId);
    const dto: DocumentDto[] = docs.map(({ mimeType: _, ...doc }) => doc);
    return Response.json(dto);
  });
}

/** 上传文档：落库 → 同步执行 解析/切分/向量化 流水线（状态机会实时落库）。 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleRoute(async () => {
    const form = await req.formData();
    const kbId = String(form.get('kbId') ?? '');
    const file = form.get('file');

    parseParams({ kbId }, kbParamSchema);
    if (!(file instanceof File)) throw new ApiError('缺少 file 文件', 422);
    if (file.size > env.MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new ApiError(`文件超过 ${env.MAX_FILE_SIZE_MB}MB 限制`, 413);
    }
    if (!isSupportedFile(file.name, file.type)) {
      throw new ApiError('仅支持 PDF / DOCX / Markdown / TXT', 422);
    }
    if (!(await knowledgeBaseExists(kbId))) throw new ApiError('知识库不存在', 404);

    const doc = await insertDocument({ kbId, filename: file.name, mimeType: file.type });

    try {
      await ingestDocument({ docId: doc.id, kbId, file });
    } catch (error) {
      // 失败状态已在流水线内落库；返回 422 让前端展示 failed 与原因，而不是吞掉响应
      const message = error instanceof Error ? error.message : '索引失败';
      return Response.json({ id: doc.id, status: 'failed', error: message }, { status: 422 });
    }

    return Response.json({ id: doc.id, status: 'done' }, { status: 201 });
  });
}
