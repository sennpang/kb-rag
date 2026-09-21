'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SourceItem, UiChatMessage } from '@/lib/types';
import { formatCost } from '@/lib/ai/pricing';
import { MessageItem } from './message-item';

interface Props {
  messages: UiChatMessage[];
  isStreaming: boolean;
  hasDocuments: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
  onCite: (source: SourceItem) => void;
}

const SUGGESTIONS = ['总结一下资料的核心内容', '资料中提到了哪些关键制度？', '用要点列出注意事项'];

export function ChatPanel({ messages, isStreaming, hasDocuments, onSend, onStop, onCite }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    const content = input.trim();
    if (!content || isStreaming) return;
    onSend(content);
    setInput('');
  };

  // 本会话累计：仅统计已拿到真实 usage 的问答轮次（流式中的回答不计入）
  const totals = useMemo(() => {
    let input = 0;
    let output = 0;
    let cost = 0;
    let rounds = 0;
    for (const m of messages) {
      if (m.role === 'assistant' && m.tokenInput != null) {
        input += m.tokenInput;
        output += m.tokenOutput ?? 0;
        cost += m.cost?.totalCost ?? 0;
        rounds += 1;
      }
    }
    return { input, output, cost, rounds };
  }, [messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <div className="mx-auto mt-16 max-w-md text-center">
            <h2 className="text-base font-semibold text-slate-700">基于你的文档开始提问</h2>
            <p className="mt-2 text-xs leading-6 text-slate-400">
              回答仅依据知识库内容生成并标注引用，资料不足时会明确说明，不会凭空编造。
            </p>
            {!hasDocuments && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600">
                请先在上方「知识库文档」中上传至少一份文档。
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  disabled={!hasDocuments || isStreaming}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageItem key={m.id} message={m} onCite={onCite} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 bg-white px-6 pt-3 pb-4">
        {totals.rounds > 0 && (
          <div
            className="mx-auto mb-2 max-w-3xl text-center text-[10px] text-slate-400"
            title="金额按官方公开价估算：输入按缓存未命中单价计（费用上限），命中上下文缓存时实际更低。"
          >
            本会话累计（{totals.rounds} 轮）· 输入 {totals.input.toLocaleString('zh-CN')} · 输出{' '}
            {totals.output.toLocaleString('zh-CN')} · 共{' '}
            {(totals.input + totals.output).toLocaleString('zh-CN')} tokens · 估算{' '}
            <span className="font-medium text-slate-500">{formatCost(totals.cost)}</span>
          </div>
        )}
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="输入问题，Enter 发送，Shift+Enter 换行"
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
          />
          {isStreaming ? (
            <button
              onClick={onStop}
              className="h-[42px] rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              停止
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!input.trim()}
              className="h-[42px] rounded-xl bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
