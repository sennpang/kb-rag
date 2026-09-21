import { generateText } from 'ai';
import { getChatModel } from '@/lib/ai/provider';
import {
  getFirstChunkContent,
  insertFolder,
  listFolders,
  listUnclassifiedDocuments,
  setDocumentFolder,
} from '@/lib/db/repositories';

/** 送给分类模型的内容片段上限（约 2000 token，足够判断主题且成本极低）。 */
const SAMPLE_MAX_CHARS = 1500;

/** 从内存中的切片数组拼出分类样本（上传流水线直接复用，零回查）。 */
export function buildSampleFromChunks(chunks: string[]): string {
  return chunks.join('\n').slice(0, SAMPLE_MAX_CHARS);
}

/**
 * 让模型判断文档应归入的文件夹名。
 * - 明显属于已有文件夹时必须复用其确切名称；
 * - 否则给出一个新建文件夹名（2–6 字、无标点）；
 * - 无法判断返回 null（调用方保持文档为未分类）。
 *
 * 任何模型/解析异常都收敛为 null，绝不向上抛出影响主流程。
 */
export async function classifyTextToFolder(input: {
  existingFolders: string[];
  sample: string;
}): Promise<string | null> {
  const { existingFolders, sample } = input;
  const folderList = existingFolders.length ? JSON.stringify(existingFolders) : '（暂无）';

  try {
    const { text } = await generateText({
      model: getChatModel(),
      temperature: 0.1,
      prompt: `你是文档分类助手。知识库中已有的文件夹：${folderList}

请阅读下面的文档内容片段并判断归属，规则：
1. 只有当文档的主题与某个已有文件夹的主题**高度一致**时，才原样复用该文件夹的确切名称，不得改名或新建近义文件夹；
2. 仅仅是沾边、部分相关、或你没有十足把握时，**一律新建文件夹，禁止勉强塞入任何已有文件夹**；
3. 需要新建时，给出一个 2–6 字、准确概括文档主题的文件夹名，不加标点或序号；
4. 内容过少、完全无法判断主题时返回 null。

只输出一行 JSON，不要输出任何解释：
{"folder":"文件夹名"} 或 {"folder":null}

文档内容：
"""
${sample.slice(0, SAMPLE_MAX_CHARS)}
"""`,
    });

    return parseFolderJson(text);
  } catch (error) {
    console.error('[classify] 模型调用失败：', error);
    return null;
  }
}

/** 容错解析模型输出：提取首个 {...} 并校验 folder 为非空字符串。 */
function parseFolderJson(text: string): string | null {
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { folder?: unknown };
    if (typeof parsed.folder !== 'string') return null;
    const name = parsed.folder.trim();
    return name ? name.slice(0, 50) : null;
  } catch {
    return null;
  }
}

/** 名称归一化：忽略首尾空格与大小写做复用匹配。 */
const normalizeName = (name: string) => name.trim().toLowerCase();

/**
 * 单文档归类：分类 → 复用/新建顶层文件夹 → 回写文档。
 * 自动分类只在顶层建文件夹；多级整理由用户手动完成。
 */
export async function placeDocument(input: {
  kbId: string;
  docId: string;
  sample: string;
}): Promise<boolean> {
  const { kbId, docId, sample } = input;
  const folders = await listFolders(kbId);

  const targetName = await classifyTextToFolder({
    existingFolders: folders.map((f) => f.name),
    sample,
  });
  if (!targetName) return false; // 未分类，等用户手动处理或点 AI 整理

  const existing = folders.find((f) => f.parentId === null && normalizeName(f.name) === normalizeName(targetName));
  if (existing) {
    await setDocumentFolder(docId, existing.id);
    return true;
  }

  try {
    const folder = await insertFolder({ kbId, parentId: null, name: targetName });
    await setDocumentFolder(docId, folder.id);
    return true;
  } catch (error) {
    // 并发/同名撞唯一索引：重查一次复用已有文件夹
    const [refreshed] = (await listFolders(kbId)).filter(
      (f) => f.parentId === null && normalizeName(f.name) === normalizeName(targetName),
    );
    if (refreshed) {
      await setDocumentFolder(docId, refreshed.id);
      return true;
    }
    console.error('[classify] 新建文件夹失败：', error);
    return false;
  }
}

export interface OrganizeResult {
  total: number;
  organized: number;
}

/**
 * AI 一键整理：把知识库内所有未分类文档逐个归类。
 * 单篇失败不影响其他文档；无切片的失败文档跳过。
 */
export async function organizeUnclassified(kbId: string): Promise<OrganizeResult> {
  const docs = await listUnclassifiedDocuments(kbId);
  let organized = 0;

  for (const doc of docs) {
    try {
      const sample = await getFirstChunkContent(doc.id);
      if (!sample) continue;
      if (await placeDocument({ kbId, docId: doc.id, sample })) organized += 1;
    } catch (error) {
      console.error(`[classify] 文档 ${doc.id} 整理失败：`, error);
    }
  }

  return { total: docs.length, organized };
}
