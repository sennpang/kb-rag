'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteDocument, listDocuments, uploadDocument } from '@/lib/api-client';
import type { DocumentDto } from '@/lib/types';

interface Props {
  kbId: string;
  /** 文档数量变化时通知父级（用于对话区空态提示） */
  onDocsChange?: (count: number) => void;
}

const STATUS_LABEL: Record<DocumentDto['status'], { text: string; className: string }> = {
  pending: { text: '等待中', className: 'bg-slate-100 text-slate-500' },
  processing: { text: '索引中', className: 'bg-amber-50 text-amber-600' },
  done: { text: '已就绪', className: 'bg-emerald-50 text-emerald-600' },
  failed: { text: '失败', className: 'bg-red-50 text-red-600' },
};

/** 文档上传与管理面板（内嵌在对话页顶部的可折叠区域）。 */
export function UploadPanel({ kbId, onDocsChange }: Props) {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const docs = await listDocuments(kbId);
      setDocuments(docs);
      onDocsChange?.(docs.length);
    } catch {
      // 列表加载失败不打扰主流程
    }
  }, [kbId, onDocsChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setNotice(null);

    const seen = new Set<string>(); // 本次选择内的文件名去重
    const skipped: string[] = [];

    try {
      for (const file of Array.from(files)) {
        if (seen.has(file.name)) {
          skipped.push(`「${file.name}」本次选择中重复`);
          continue;
        }
        seen.add(file.name);
        try {
          await uploadDocument(kbId, file);
        } catch (e) {
          // 单文件被拦截（同名/索引失败）不阻断其余文件
          skipped.push(`「${file.name}」${e instanceof Error ? e.message : '上传失败'}`);
        }
      }
      await refresh();
      if (skipped.length) setNotice(skipped.join('；'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    await refresh();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">知识库文档</h2>
          <p className="mt-0.5 text-xs text-slate-400">支持 PDF / DOCX / Markdown / TXT，单文件 ≤ 20MB</p>
        </div>
        <label className="cursor-pointer rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
          {uploading ? '上传索引中…' : '上传文档'}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.md,.txt,application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
      </div>

      {notice && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-600">{notice}</p>
      )}

      {documents.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {documents.map((doc) => {
            const status = STATUS_LABEL[doc.status];
            return (
              <li
                key={doc.id}
                className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                title={doc.errorMsg ?? undefined}
              >
                <span className="min-w-0 flex-1 truncate text-slate-700">{doc.filename}</span>
                {doc.status === 'done' && (
                  <span className="shrink-0 text-slate-400">{doc.chunkCount} 段</span>
                )}
                <span className={`shrink-0 rounded-full px-2 py-0.5 ${status.className}`}>
                  {status.text}
                </span>
                <button
                  onClick={() => void handleDelete(doc.id)}
                  className="shrink-0 text-slate-300 hover:text-red-500"
                  aria-label="删除文档"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
