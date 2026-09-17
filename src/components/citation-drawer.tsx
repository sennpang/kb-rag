'use client';

import { useEffect, useState } from 'react';
import { fetchChunkContext } from '@/lib/api-client';
import type { ChunkContextDto, SourceItem } from '@/lib/types';

interface Props {
  source: SourceItem | null;
  onClose: () => void;
}

/** 引用原文抽屉：展示命中切片及其前后相邻切片，命中段高亮。 */
export function CitationDrawer({ source, onClose }: Props) {
  const [data, setData] = useState<ChunkContextDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    fetchChunkContext(source.docId, source.chunkIndex, controller.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (controller.signal.aborted) return; // 抽屉已切换/关闭，忽略中止
        setError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [source]);

  if (!source) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button
        aria-label="关闭"
        className="absolute inset-0 bg-slate-900/30"
        onClick={onClose}
      />
      <aside className="relative h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">引用来源 [{source.ref}]</p>
            <h3 className="mt-1 truncate text-sm font-semibold text-slate-800">
              {source.docName}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">第 {source.chunkIndex + 1} 段</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {loading && <p className="text-sm text-slate-400">原文加载中…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {data && (
          <div className="space-y-3">
            {data.previous && <ContextChunk label="上一段" content={data.previous.content} dim />}
            <ContextChunk label="命中段" content={data.current.content} highlight />
            {data.next && <ContextChunk label="下一段" content={data.next.content} dim />}
          </div>
        )}
      </aside>
    </div>
  );
}

function ContextChunk({
  label,
  content,
  highlight,
  dim,
}: {
  label: string;
  content: string;
  highlight?: boolean;
  dim?: boolean;
}) {
  return (
    <section
      className={[
        'rounded-lg border p-3 text-sm leading-7 whitespace-pre-wrap',
        highlight ? 'border-brand-500 bg-brand-50 text-slate-800' : '',
        dim ? 'border-slate-200 text-slate-500' : '',
      ].join(' ')}
    >
      <p className="mb-1 text-xs font-medium text-slate-400">{label}</p>
      {content}
    </section>
  );
}
