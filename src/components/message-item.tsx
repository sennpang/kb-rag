'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SourceItem, UiChatMessage } from '@/lib/types';

interface Props {
  message: UiChatMessage;
  onCite: (source: SourceItem) => void;
}

/** 单条消息气泡；assistant 内容走 Markdown，正文中的 [n] 渲染为可点击引用角标。 */
export function MessageItem({ message, onCite }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={[
          'max-w-[85%] rounded-2xl px-4 py-3',
          isUser ? 'bg-brand-500 text-white' : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-100',
          message.error ? 'ring-1 ring-red-200' : '',
        ].join(' ')}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
        ) : (
          <>
            <div className="markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p>{renderWithCitations(children, message.sources, onCite)}</p>,
                  li: ({ children }) => <li>{renderWithCitations(children, message.sources, onCite)}</li>,
                  td: ({ children }) => <td>{renderWithCitations(children, message.sources, onCite)}</td>,
                }}
              >
                {message.content || (message.streaming ? '正在检索资料…' : '')}
              </ReactMarkdown>
            </div>
            {message.streaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded bg-brand-500 align-middle" />
            )}
            {message.sources.length > 0 && !message.streaming && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                {message.sources.map((s) => (
                  <button
                    key={s.ref}
                    onClick={() => onCite(s)}
                    title={`${s.docName} · 第 ${s.chunkIndex + 1} 段`}
                    className="max-w-[200px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 hover:bg-brand-50 hover:text-brand-600"
                  >
                    [{s.ref}] {s.docName}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 把文本节点中的 [1][2] 模式切成引用按钮。
 * ReactMarkdown 传入的 children 可能是字符串或 ReactNode 数组，这里只对字符串生效。
 */
function renderWithCitations(
  children: React.ReactNode,
  sources: SourceItem[],
  onCite: (source: SourceItem) => void,
): React.ReactNode {
  if (typeof children !== 'string') return children;

  return children.split(/(\[\d+\])/g).map((part, index) => {
    const matched = /^\[(\d+)\]$/.exec(part);
    if (!matched) return part;

    const ref = Number(matched[1]);
    const source = sources.find((s) => s.ref === ref);
    if (!source) return part;

    return (
      <button
        key={`${ref}-${index}`}
        onClick={(e) => {
          e.stopPropagation();
          onCite(source);
        }}
        className="mx-0.5 rounded bg-brand-50 px-1 text-[11px] font-medium text-brand-600 hover:bg-brand-100"
      >
        [{ref}]
      </button>
    );
  });
}
