'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import {
  createKb,
  deleteConversation,
  getConversation,
  listConversations,
  listKbs,
} from '@/lib/api-client';
import type {
  ConversationDto,
  KnowledgeBaseDto,
  SourceItem,
  UiChatMessage,
} from '@/lib/types';
import { consumeSse } from '@/lib/sse';
import { Sidebar } from '@/components/sidebar';
import { UploadPanel } from '@/components/upload-panel';
import { ChatPanel } from '@/components/chat-panel';
import { CitationDrawer } from '@/components/citation-drawer';

export default function ChatPage() {
  const [kbs, setKbs] = useState<KnowledgeBaseDto[]>([]);
  const [kbId, setKbId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showUpload, setShowUpload] = useState(true);
  const [docCount, setDocCount] = useState(0);
  const [citation, setCitation] = useState<SourceItem | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const { data: session } = useSession();

  /* ── 启动：加载知识库列表 ── */
  useEffect(() => {
    listKbs()
      .then((list) => {
        setKbs(list);
        if (list[0]) setKbId(list[0].id);
      })
      .catch((e) => setFatalError(e instanceof Error ? e.message : '初始化失败'));
  }, []);

  /* ── 切换知识库：刷新会话列表并清空对话 ── */
  useEffect(() => {
    if (!kbId) return;
    setConversationId(null);
    setMessages([]);
    setDocCount(0);
    void listConversations(kbId).then(setConversations).catch(() => setConversations([]));
  }, [kbId]);

  const refreshConversations = useCallback(async () => {
    if (!kbId) return;
    setConversations(await listConversations(kbId));
  }, [kbId]);

  const handleCreateKb = async (name: string) => {
    const kb = await createKb(name);
    setKbs((prev) => [...prev, kb]);
    setKbId(kb.id);
  };

  const handleSelectConversation = async (id: string) => {
    const { messages: history } = await getConversation(id);
    setConversationId(id);
    setMessages(
      history.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources ?? [],
      })),
    );
  };

  const handleNewChat = () => {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
  };

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation(id);
    if (id === conversationId) handleNewChat();
    await refreshConversations();
  };

  /* ── 发送消息并消费 SSE ── */
  const handleSend = async (content: string) => {
    if (!kbId || isStreaming) return;

    const userMessage: UiChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      sources: [],
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: UiChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      sources: [],
      streaming: true,
    };

    const history = [...messages, userMessage].map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const patchAssistant = (
      patch: Partial<UiChatMessage> | ((current: UiChatMessage) => Partial<UiChatMessage>),
    ) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m,
        ),
      );

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ kbId, conversationId: conversationId ?? undefined, messages: history }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `请求失败（${response.status}）`);
      }

      let createdConversationId: string | null = null;
      await consumeSse(response.body, (event) => {
        switch (event.type) {
          case 'meta':
            createdConversationId = event.conversationId;
            setConversationId(event.conversationId);
            break;
          case 'sources':
            patchAssistant({ sources: event.items });
            break;
          case 'delta':
            patchAssistant((m) => ({ content: m.content + event.delta }));
            break;
          case 'error':
            patchAssistant({ error: true, content: event.message });
            break;
        }
      });

      if (createdConversationId) await refreshConversations();
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // 用户主动停止：保留已生成的内容，结束流式态由 finally 兜底
      } else {
        patchAssistant({
          streaming: false,
          error: true,
          content: `⚠️ ${error instanceof Error ? error.message : '生成失败'}`,
        });
      }
    } finally {
      patchAssistant({ streaming: false });
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  if (fatalError) {
    return (
      <main className="flex h-screen items-center justify-center">
        <div className="max-w-md rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-red-100">
          <p className="text-sm font-medium text-red-600">初始化失败</p>
          <p className="mt-2 text-xs text-slate-500">{fatalError}</p>
          <p className="mt-3 text-xs text-slate-400">请确认 Docker 中的 PostgreSQL 已启动、已执行 pnpm db:init，且 .env.local 配置正确。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen overflow-hidden">
      <Sidebar
        kbs={kbs}
        kbId={kbId}
        conversations={conversations}
        conversationId={conversationId}
        userEmail={session?.user?.email ?? ''}
        onSwitchKb={setKbId}
        onCreateKb={handleCreateKb}
        onNewChat={handleNewChat}
        onSelectConversation={(id) => void handleSelectConversation(id)}
        onDeleteConversation={handleDeleteConversation}
        onSignOut={() => void signOut({ callbackUrl: '/login' })}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <h1 className="text-sm font-semibold text-slate-700">
            {kbs.find((k) => k.id === kbId)?.name ?? '知识库问答'}
          </h1>
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
          >
            {showUpload ? '收起文档面板' : '管理文档'}
          </button>
        </header>

        {showUpload && kbId && (
          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3">
            <UploadPanel kbId={kbId} onDocsChange={setDocCount} />
          </div>
        )}

        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          hasDocuments={docCount > 0}
          onSend={(text) => void handleSend(text)}
          onStop={handleStop}
          onCite={setCitation}
        />
      </section>

      <CitationDrawer source={citation} onClose={() => setCitation(null)} />
    </main>
  );
}
