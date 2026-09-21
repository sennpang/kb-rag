'use client';

import { useState } from 'react';
import { Loader2, MessagesSquare, Search, Sparkles, Folder as FolderIcon, X } from 'lucide-react';
import type { ConversationDto, KnowledgeBaseDto } from '@/lib/types';
import { DocTree, type KbTreeData } from './doc-tree';

interface Props {
  kbs: KnowledgeBaseDto[];
  kbId: string | null;
  conversations: ConversationDto[];
  conversationId: string | null;
  userEmail: string;
  dataByKb: Record<string, KbTreeData | undefined>;
  onSwitchKb: (kbId: string) => void;
  onCreateKb: (name: string) => Promise<void>;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => Promise<void>;
  onSignOut: () => void;
  onEnsureLoaded: (kbId: string) => Promise<void>;
  onCreateFolder: (input: { kbId: string; parentId: string | null; name: string }) => Promise<void>;
  onRenameFolder: (kbId: string, id: string, name: string) => Promise<void>;
  onDeleteFolder: (kbId: string, id: string) => Promise<void>;
  onMoveDocument: (kbId: string, docId: string, folderId: string | null) => Promise<void>;
  onDeleteDocument: (kbId: string, docId: string) => Promise<void>;
  onOrganize: () => Promise<void>;
}

type Tab = 'chat' | 'docs';

export function Sidebar({
  kbs,
  kbId,
  conversations,
  conversationId,
  userEmail,
  dataByKb,
  onSwitchKb,
  onCreateKb,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onSignOut,
  onEnsureLoaded,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveDocument,
  onDeleteDocument,
  onOrganize,
}: Props) {
  const [creatingKb, setCreatingKb] = useState(false);
  const [kbName, setKbName] = useState('');
  const [tab, setTab] = useState<Tab>('chat');
  const [keyword, setKeyword] = useState('');
  const [organizing, setOrganizing] = useState(false);

  const submitKb = async () => {
    const trimmed = kbName.trim();
    if (!trimmed) return;
    await onCreateKb(trimmed);
    setKbName('');
    setCreatingKb(false);
  };

  const handleOrganize = async () => {
    setOrganizing(true);
    try {
      await onOrganize();
    } finally {
      setOrganizing(false);
    }
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      {/* 知识库切换 / 新建 */}
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
            onClick={() => setCreatingKb((v) => !v)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
            title="新建知识库"
          >
            ＋
          </button>
        </div>
        {creatingKb && (
          <div className="mt-2 flex gap-2">
            <input
              autoFocus
              value={kbName}
              onChange={(e) => setKbName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submitKb()}
              placeholder="知识库名称"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-500"
            />
            <button
              onClick={() => void submitKb()}
              className="rounded-lg bg-brand-500 px-2 py-1.5 text-xs text-white hover:bg-brand-600"
            >
              创建
            </button>
          </div>
        )}
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b border-slate-100 p-2">
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
          <MessagesSquare size={14} strokeWidth={1.75} className="mr-1" />
          会话
        </TabButton>
        <TabButton active={tab === 'docs'} onClick={() => setTab('docs')}>
          <FolderIcon size={14} strokeWidth={1.75} className="mr-1" />
          文档
        </TabButton>
      </div>

      {tab === 'chat' ? (
        <>
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
            {conversations.length === 0 && <p className="px-1 text-xs text-slate-300">暂无会话</p>}
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
                    className="shrink-0 rounded p-1 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-red-500 group-hover:opacity-100"
                    aria-label="删除会话"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </>
      ) : (
        <>
          <div className="p-2">
            <div className="relative">
              <Search
                size={13}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索文档…"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2">
            <DocTree
              kbs={kbs}
              activeKbId={kbId}
              dataByKb={dataByKb}
              keyword={keyword}
              onEnsureLoaded={onEnsureLoaded}
              onSwitchKb={onSwitchKb}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveDocument={onMoveDocument}
              onDeleteDocument={onDeleteDocument}
            />
          </div>

          <div className="border-t border-slate-100 p-2">
            <button
              onClick={() => void handleOrganize()}
              disabled={organizing || !kbId}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:border-brand-500 hover:text-brand-600 disabled:opacity-50"
            >
              {organizing ? (
                <>
                  <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                  AI 整理中…
                </>
              ) : (
                <>
                  <Sparkles size={13} strokeWidth={1.75} />
                  AI 整理本库
                </>
              )}
            </button>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 border-t border-slate-100 p-3">
        <span className="min-w-0 flex-1 truncate text-xs text-slate-400" title={userEmail}>
          {userEmail}
        </span>
        <button
          onClick={onSignOut}
          className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
        >
          退出
        </button>
      </div>
    </aside>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={[
        'flex flex-1 items-center justify-center rounded-lg px-2 py-1.5 text-xs font-medium',
        props.active ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50',
      ].join(' ')}
    >
      {props.children}
    </button>
  );
}
