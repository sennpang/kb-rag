'use client';

import { useEffect, useState } from 'react';
import {
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  LibraryBig,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import type { DocumentDto, FolderDto, KnowledgeBaseDto } from '@/lib/types';

/** 单个知识库在树中的懒加载数据。 */
export interface KbTreeData {
  folders: FolderDto[];
  documents: DocumentDto[];
}

interface Props {
  kbs: KnowledgeBaseDto[];
  activeKbId: string | null;
  dataByKb: Record<string, KbTreeData | undefined>;
  keyword: string;
  /** KB 节点首次展开时拉取数据（page 层做缓存）。 */
  onEnsureLoaded: (kbId: string) => Promise<void>;
  onSwitchKb: (kbId: string) => void;
  onCreateFolder: (input: { kbId: string; parentId: string | null; name: string }) => Promise<void>;
  onRenameFolder: (kbId: string, id: string, name: string) => Promise<void>;
  onDeleteFolder: (kbId: string, id: string) => Promise<void>;
  onMoveDocument: (kbId: string, docId: string, folderId: string | null) => Promise<void>;
  onDeleteDocument: (kbId: string, docId: string) => Promise<void>;
}

type EditingState =
  | { kind: 'create'; kbId: string; parentId: string | null }
  | { kind: 'rename'; folderId: string }
  | null;

const INDENT_PX = 12;

export function DocTree({
  kbs,
  activeKbId,
  dataByKb,
  keyword,
  onEnsureLoaded,
  onSwitchKb,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveDocument,
  onDeleteDocument,
}: Props) {
  const [expandedKbs, setExpandedKbs] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditingState>(null);
  const [movingDocId, setMovingDocId] = useState<string | null>(null);

  const searching = keyword.trim().length > 0;

  // 切换问答库时自动展开并确保数据加载
  useEffect(() => {
    if (!activeKbId) return;
    setExpandedKbs((prev) => new Set(prev).add(activeKbId));
    void onEnsureLoaded(activeKbId);
  }, [activeKbId, onEnsureLoaded]);

  const toggleInSet = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const toggleKb = (kbId: string) => {
    const opening = !expandedKbs.has(kbId);
    setExpandedKbs((prev) => toggleInSet(prev, kbId));
    if (opening) void onEnsureLoaded(kbId);
  };

  const hasAnyMatch = kbs.some((kb) =>
    dataByKb[kb.id]?.documents.some((d) =>
      d.filename.toLowerCase().includes(keyword.trim().toLowerCase()),
    ),
  );

  return (
    <div className="px-1 pb-1 text-xs text-slate-600">
      {kbs.map((kb) => {
        const data = dataByKb[kb.id];
        const isOpen = searching || expandedKbs.has(kb.id);
        const isActive = kb.id === activeKbId;
        return (
          <div key={kb.id}>
            <div className="group flex items-center gap-0.5 rounded-lg py-0.5 hover:bg-slate-50">
              <button
                onClick={() => toggleKb(kb.id)}
                className="w-4 shrink-0 text-[9px] text-slate-400"
                aria-label={isOpen ? '折叠' : '展开'}
              >
                {isOpen ? '▾' : '▸'}
              </button>
              <button
                onClick={() => onSwitchKb(kb.id)}
                className={[
                  'flex min-w-0 flex-1 items-center truncate text-left font-medium',
                  isActive ? 'text-brand-700' : 'text-slate-700',
                ].join(' ')}
                title={kb.name}
              >
                <LibraryBig
                  size={15}
                  strokeWidth={1.75}
                  className={['mr-1.5 shrink-0', isActive ? 'text-brand-600' : 'text-slate-400'].join(' ')}
                />
                {kb.name}
              </button>
              <button
                onClick={() => setEditing({ kind: 'create', kbId: kb.id, parentId: null })}
                className="shrink-0 rounded p-0.5 text-slate-400 opacity-40 hover:bg-slate-100 hover:text-brand-600 focus-visible:opacity-100 group-hover:opacity-100"
                title="新建文件夹"
              >
                <FolderPlus size={13} strokeWidth={1.75} />
              </button>
            </div>

            {isOpen &&
              (data ? (
                <KbTreeContent
                  kbId={kb.id}
                  data={data}
                  searching={searching}
                  keyword={keyword}
                  expandedFolders={expandedFolders}
                  editing={editing}
                  movingDocId={movingDocId}
                  onToggleFolder={(id) => setExpandedFolders((prev) => toggleInSet(prev, id))}
                  onStartCreate={(parentId) => setEditing({ kind: 'create', kbId: kb.id, parentId })}
                  onStartRename={(folderId) => setEditing({ kind: 'rename', folderId })}
                  onSubmitEditing={async (name) => {
                    if (editing?.kind === 'create') {
                      await onCreateFolder({ kbId: editing.kbId, parentId: editing.parentId, name });
                      if (editing.parentId) {
                        setExpandedFolders((prev) => new Set(prev).add(editing.parentId!));
                      }
                    } else if (editing?.kind === 'rename') {
                      await onRenameFolder(kb.id, editing.folderId, name);
                    }
                    setEditing(null);
                  }}
                  onCancelEditing={() => setEditing(null)}
                  onDeleteFolder={(targetKbId, id) => onDeleteFolder(targetKbId, id)}
                  onMoveDocument={(targetKbId, docId, folderId) =>
                    onMoveDocument(targetKbId, docId, folderId)
                      .then(() => setMovingDocId(null))
                      .catch((error) => {
                        console.error('[doc-tree] 移动失败：', error);
                        setMovingDocId(null);
                      })
                  }
                  onOpenMoveMenu={setMovingDocId}
                  onCloseMoveMenu={() => setMovingDocId(null)}
                  onDeleteDocument={(targetKbId, id) => onDeleteDocument(targetKbId, id)}
                  onSwitchKb={onSwitchKb}
                />
              ) : (
                <p className="py-1 pl-5 text-[11px] text-slate-300">加载中…</p>
              ))}
          </div>
        );
      })}

      {searching && !hasAnyMatch && (
        <p className="py-6 text-center text-[11px] text-slate-300">没有找到匹配的文档</p>
      )}
    </div>
  );
}

/* ──────────────────────── 单个知识库的树内容 ──────────────────────── */

interface ContentProps {
  kbId: string;
  data: KbTreeData;
  searching: boolean;
  keyword: string;
  expandedFolders: Set<string>;
  editing: EditingState;
  movingDocId: string | null;
  onToggleFolder: (id: string) => void;
  onStartCreate: (parentId: string | null) => void;
  onStartRename: (folderId: string) => void;
  onSubmitEditing: (name: string) => Promise<void>;
  onCancelEditing: () => void;
  onDeleteFolder: (kbId: string, id: string) => Promise<void>;
  onMoveDocument: (kbId: string, docId: string, folderId: string | null) => Promise<void>;
  onOpenMoveMenu: (docId: string) => void;
  onCloseMoveMenu: () => void;
  onDeleteDocument: (kbId: string, id: string) => Promise<void>;
  onSwitchKb: (kbId: string) => void;
}

function KbTreeContent(props: ContentProps) {
  const { kbId, data, searching, keyword } = props;

  // 搜索模式：计算命中文档及其祖先文件夹
  const q = keyword.trim().toLowerCase();
  const matchedDocIds = new Set<string>();
  const visibleFolderIds = new Set<string>();
  if (searching) {
    for (const doc of data.documents) {
      if (doc.filename.toLowerCase().includes(q)) matchedDocIds.add(doc.id);
    }
    for (const doc of data.documents) {
      if (!matchedDocIds.has(doc.id)) continue;
      let folderId = doc.folderId;
      while (folderId) {
        visibleFolderIds.add(folderId);
        folderId = data.folders.find((f) => f.id === folderId)?.parentId ?? null;
      }
    }
  }

  const topFolders = data.folders.filter(
    (f) => f.parentId === null && (!searching || visibleFolderIds.has(f.id)),
  );
  const unclassified = data.documents.filter(
    (d) => d.folderId === null && (!searching || matchedDocIds.has(d.id)),
  );

  return (
    <div className="ml-3 border-l border-slate-100 pl-1">
      {topFolders.map((folder) => (
        <FolderNode
          key={folder.id}
          {...props}
          folder={folder}
          depth={1}
          matchedDocIds={searching ? matchedDocIds : null}
          visibleFolderIds={searching ? visibleFolderIds : null}
        />
      ))}

      {props.editing?.kind === 'create' && props.editing.kbId === kbId && props.editing.parentId === null && (
        <div style={{ paddingLeft: INDENT_PX }} className="py-0.5">
          <InlineInput placeholder="文件夹名称" onSubmit={props.onSubmitEditing} onCancel={props.onCancelEditing} />
        </div>
      )}

      {unclassified.length > 0 && (
        <div className="py-0.5">
          <p className="px-1 py-0.5 text-[10px] text-slate-400">未分类</p>
          {unclassified.map((doc) => (
            <DocLeaf
              key={doc.id}
              kbId={kbId}
              doc={doc}
              depth={1}
              folders={data.folders}
              moving={props.movingDocId === doc.id}
              onOpenMoveMenu={() => props.onOpenMoveMenu(doc.id)}
              onCloseMoveMenu={props.onCloseMoveMenu}
              onMove={(_targetKb, folderId) => props.onMoveDocument(props.kbId, doc.id, folderId)}
              onDelete={() => props.onDeleteDocument(props.kbId, doc.id)}
              onSwitchKb={props.onSwitchKb}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── 文件夹节点（递归） ──────────────────────── */

interface FolderNodeProps extends ContentProps {
  folder: FolderDto;
  depth: number;
  data: KbTreeData;
  matchedDocIds: Set<string> | null;
  visibleFolderIds: Set<string> | null;
}

function FolderNode(props: FolderNodeProps) {
  const { folder, depth, data, expandedFolders, editing } = props;
  const isOpen = props.searching ? true : expandedFolders.has(folder.id);
  const isRenaming = editing?.kind === 'rename' && editing.folderId === folder.id;
  const isCreatingHere = editing?.kind === 'create' && editing.parentId === folder.id;

  const childFolders = data.folders.filter(
    (f) => f.parentId === folder.id && (!props.visibleFolderIds || props.visibleFolderIds.has(f.id)),
  );
  const docs = data.documents.filter(
    (d) => d.folderId === folder.id && (!props.matchedDocIds || props.matchedDocIds.has(d.id)),
  );
  const hasChildren = childFolders.length > 0 || docs.length > 0;

  return (
    <div>
      <div className="group flex items-center gap-0.5 rounded-lg py-0.5 hover:bg-slate-50">
        <button
          onClick={() => props.onToggleFolder(folder.id)}
          className="w-4 shrink-0 text-[9px] text-slate-400"
          aria-label={isOpen ? '折叠' : '展开'}
        >
          {hasChildren ? (isOpen ? '▾' : '▸') : ''}
        </button>
        {isRenaming ? (
          <InlineInput
            initial={folder.name}
            placeholder="文件夹名称"
            onSubmit={props.onSubmitEditing}
            onCancel={props.onCancelEditing}
          />
        ) : (
          <button
            onClick={() => props.onToggleFolder(folder.id)}
            className="flex min-w-0 flex-1 items-center truncate text-left"
            title={folder.name}
          >
            {isOpen ? (
              <FolderOpen
                size={14}
                strokeWidth={1.75}
                fill="currentColor"
                fillOpacity={0.1}
                className="mr-1.5 shrink-0 text-amber-500"
              />
            ) : (
              <Folder
                size={14}
                strokeWidth={1.75}
                fill="currentColor"
                fillOpacity={0.1}
                className="mr-1.5 shrink-0 text-amber-400"
              />
            )}
            {folder.name}
          </button>
        )}
        {!isRenaming && (
          <span className="flex shrink-0 items-center opacity-40 group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={() => props.onStartCreate(folder.id)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
              title="新建子文件夹"
            >
              <FolderPlus size={12} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => props.onStartRename(folder.id)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
              title="重命名"
            >
              <Pencil size={12} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => {
                if (window.confirm('删除该文件夹？其中的子文件夹会一并删除，文档将变为「未分类」（文档本身不删除）。')) {
                  void props.onDeleteFolder(props.kbId, folder.id);
                }
              }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-500"
              title="删除"
            >
              <Trash2 size={12} strokeWidth={1.75} />
            </button>
          </span>
        )}
      </div>

      {isOpen && (
        <div className="ml-3 border-l border-slate-100 pl-1">
          {childFolders.map((child) => (
            <FolderNode key={child.id} {...props} folder={child} depth={depth + 1} />
          ))}

          {isCreatingHere && (
            <div className="py-0.5">
              <InlineInput placeholder="子文件夹名称" onSubmit={props.onSubmitEditing} onCancel={props.onCancelEditing} />
            </div>
          )}

          {docs.map((doc) => (
            <DocLeaf
              key={doc.id}
              kbId={props.kbId}
              doc={doc}
              depth={depth + 1}
              folders={data.folders}
              moving={props.movingDocId === doc.id}
              onOpenMoveMenu={() => props.onOpenMoveMenu(doc.id)}
              onCloseMoveMenu={props.onCloseMoveMenu}
              onMove={(_targetKb, folderId) => props.onMoveDocument(props.kbId, doc.id, folderId)}
              onDelete={() => props.onDeleteDocument(props.kbId, doc.id)}
              onSwitchKb={props.onSwitchKb}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── 文档叶子 ──────────────────────── */

interface DocLeafProps {
  kbId: string;
  doc: DocumentDto;
  depth: number;
  folders: FolderDto[];
  moving: boolean;
  onOpenMoveMenu: () => void;
  onCloseMoveMenu: () => void;
  onMove: (kbId: string, folderId: string | null) => void;
  onDelete: (kbId: string, docId: string) => void;
  onSwitchKb: (kbId: string) => void;
}

/** 文档图标配色：状态优先（失败/处理中），其次按文件类型区分。 */
function docIconClass(filename: string, failed: boolean, pending: boolean): string {
  if (failed) return 'text-red-400';
  if (pending) return 'text-slate-300';
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'text-rose-400';
  if (ext === 'docx' || ext === 'doc') return 'text-sky-400';
  return 'text-slate-400';
}

function DocLeaf(props: DocLeafProps) {
  const { doc, folders, moving } = props;
  const failed = doc.status === 'failed';
  const pending = doc.status === 'pending' || doc.status === 'processing';

  return (
    <div className="group relative flex items-center gap-1 rounded-lg py-0.5 hover:bg-slate-50">
      <FileText
        size={14}
        strokeWidth={1.75}
        className={['mr-1.5 shrink-0', docIconClass(doc.filename, failed, pending)].join(' ')}
      />
      <button
        onClick={() => props.onSwitchKb(props.kbId)}
        className={[
          'min-w-0 flex-1 truncate text-left',
          failed ? 'text-red-400' : doc.status === 'done' ? 'text-slate-600' : 'text-slate-400',
        ].join(' ')}
        title={failed && doc.errorMsg ? doc.errorMsg : doc.filename}
      >
        {doc.filename}
      </button>
      {doc.chunkCount > 0 && <span className="shrink-0 text-[10px] text-slate-300">{doc.chunkCount}段</span>}
      {failed && <span className="shrink-0 text-[10px] text-red-400">失败</span>}
      {(doc.status === 'pending' || doc.status === 'processing') && (
        <span className="shrink-0 text-[10px] text-slate-300">处理中</span>
      )}
      <span className="flex shrink-0 items-center opacity-40 group-hover:opacity-100 focus-within:opacity-100">
        <button
          onClick={props.onOpenMoveMenu}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
          title="移动到文件夹"
        >
          <FolderInput size={12} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => {
            if (window.confirm(`删除文档《${doc.filename}》？切片数据会一并删除，不可恢复。`)) {
              props.onDelete(props.kbId, doc.id);
            }
          }}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-500"
          title="删除文档"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </span>

      {moving && (
        <MoveMenu
          folders={folders}
          currentFolderId={doc.folderId}
          onPick={(folderId) => props.onMove(props.kbId, folderId)}
          onClose={props.onCloseMoveMenu}
        />
      )}
    </div>
  );
}

/** 移动菜单：未分类 + 同库全部文件夹（按层级缩进）。 */
function MoveMenu(props: {
  folders: FolderDto[];
  currentFolderId: string | null;
  onPick: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const depthCache = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    const folder = props.folders.find((f) => f.id === id);
    const depth = folder?.parentId ? depthOf(folder.parentId) + 1 : 0;
    depthCache.set(id, depth);
    return depth;
  };

  const itemClass =
    'block w-full truncate rounded px-2 py-1 text-left text-xs text-slate-600 hover:bg-brand-50 hover:text-brand-700';

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={props.onClose} />
      <div className="absolute right-0 top-5 z-30 max-h-56 w-44 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
        <button
          className={itemClass}
          onClick={() => props.onPick(null)}
        >
          {props.currentFolderId === null ? '✓ ' : '  '}未分类
        </button>
        {props.folders.map((f) => (
          <button
            key={f.id}
            className={itemClass}
            style={{ paddingLeft: 8 + depthOf(f.id) * 10 }}
            onClick={() => props.onPick(f.id)}
            title={f.name}
          >
            {f.id === props.currentFolderId ? '✓ ' : '  '}
            {f.name}
          </button>
        ))}
      </div>
    </>
  );
}

/* ──────────────────────── 内联输入框 ──────────────────────── */

function InlineInput(props: {
  initial?: string;
  placeholder?: string;
  onSubmit: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.initial ?? '');

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) void props.onSubmit(trimmed);
    else props.onCancel();
  };

  return (
    <input
      autoFocus
      value={value}
      placeholder={props.placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') props.onCancel();
      }}
      onBlur={() => props.onCancel()}
      className="min-w-0 flex-1 rounded-lg border border-brand-300 px-2 py-1 text-xs outline-none"
    />
  );
}
