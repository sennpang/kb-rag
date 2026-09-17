import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

export const ACCEPTED_MIME_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/markdown': '.md',
  'text/plain': '.txt',
};

export function isSupportedFile(filename: string, mimeType: string): boolean {
  if (ACCEPTED_MIME_TYPES[mimeType]) return true;
  // 部分系统对 .md/.txt 给出空/怪异 MIME，回退到扩展名判断
  return /\.(pdf|docx|md|txt)$/i.test(filename);
}

/** 从上传文件中抽取纯文本。仅在 Node 运行时调用。 */
export async function parseFileToText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = detectType(file.name, file.type);

  switch (type) {
    case 'pdf': {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return normalize(Array.isArray(text) ? text.join('\n') : text);
    }
    case 'docx': {
      const result = await mammoth.extractRawText({ buffer });
      return normalize(result.value);
    }
    case 'md':
    case 'txt':
      return normalize(buffer.toString('utf-8'));
    default:
      throw new Error(`不支持的文件类型：${file.name}`);
  }
}

function detectType(filename: string, mimeType: string): 'pdf' | 'docx' | 'md' | 'txt' {
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(filename)) return 'pdf';
  if (mimeType.includes('wordprocessingml') || /\.docx$/i.test(filename)) return 'docx';
  if (/\.md$/i.test(filename) || mimeType === 'text/markdown') return 'md';
  return 'txt';
}

/** 统一空白：去 BOM、规范化换行、压缩 3 个以上连续空行。 */
function normalize(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
