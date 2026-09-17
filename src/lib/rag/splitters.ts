/**
 * 文本切分器：段落聚合 + 固定长度二次切分 + overlap 保持上下文连贯。
 *
 * 经验值：中文问答场景 chunkSize 约 300–600 字，overlap 取 chunk 的 10–20%。
 * 一切以评测集命中率为准（本仓库默认 500/80）。
 */

export interface SplitOptions {
  /** 每个切片的目标最大字符数 */
  chunkSize: number;
  /** 相邻切片重叠的字符数，避免在语义边界处硬切断 */
  overlap: number;
}

export const DEFAULT_SPLIT_OPTIONS: SplitOptions = { chunkSize: 500, overlap: 80 };

export function splitText(text: string, options: SplitOptions = DEFAULT_SPLIT_OPTIONS): string[] {
  const { chunkSize, overlap } = options;
  if (chunkSize <= overlap) {
    throw new Error('chunkSize 必须大于 overlap');
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+\n/g, '\n').trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = '';

  const push = (value: string) => {
    const v = value.trim();
    if (v) chunks.push(v);
  };

  for (const paragraph of paragraphs) {
    // 单段就超长：硬切，并在段内切片间保留 overlap
    if (paragraph.length > chunkSize) {
      if (buffer) {
        push(buffer);
        buffer = '';
      }
      for (let start = 0; start < paragraph.length; start += chunkSize - overlap) {
        push(paragraph.slice(start, start + chunkSize));
        if (start + chunkSize >= paragraph.length) break;
      }
      continue;
    }

    if (buffer && buffer.length + 2 + paragraph.length > chunkSize) {
      push(buffer);
      buffer = buffer.slice(-overlap);
    }
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }

  if (buffer) push(buffer);
  return chunks;
}
