'use client';

import { useState } from 'react';
import type { ConversationDto, KnowledgeBaseDto } from '@/lib/types';

interface Props {
  kbs: KnowledgeBaseDto[];
  kbId: string | null;
  conversations: ConversationDto[];
  conversationId: string | null;
  onSwitchKb: (kbId: string) => void;
  onCreateKb: (name: string) => Promise<void>;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => Promise<void>;
}

export function Sidebar({
  kbs,
  kbId,
  conversations,
  conversationId,
  onSwitchKb,
  onCreateKb,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreateKb(trimmed);
    setName('');
    setCreating(false);
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-3">
        <div className="flex items-center gap-2">
          <select
            value={kbId ?? ''}
            onChange={(e) => onSwitchKb(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-brand-500"
          >
            {kbs.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setCreating((v) => !v)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
            title="新建知识库"
          >
            ＋
          </button>
        </div>
        {creating && (
          <div className="mt-2 flex gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder="知识库名称"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-500"
            />
            <button
              onClick={() => void submit()}
              className="rounded-lg bg-brand-500 px-2 py-1.5 text-xs text-white hover:bg-brand-600"
            >
              创建
            </button>
          </div>
        )}
      </div>

      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:border-brand-500 hover:text-brand-600"
        >
          ＋ 新建会话
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        <p className="px-1 pb-1 text-[11px] text-slate-400">历史会话</p>
        {conversations.length === 0 && (
          <p className="px-1 text-xs text-slate-300">暂无会话</p>
        )}
        <ul className="space-y-0.5">
          {conversations.map((c) => (
            <li key={c.id} className="group flex items-center">
              <button
                onClick={() => onSelectConversation(c.id)}
                className={[
                  'min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-xs',
                  c.id === conversationId
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {c.title}
              </button>
              <button
                onClick={() => void onDeleteConversation(c.id)}
                className="shrink-0 px-1.5 text-xs text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                aria-label="删除会话"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
