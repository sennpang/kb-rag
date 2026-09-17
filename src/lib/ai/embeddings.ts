import { embedMany } from 'ai';
import { getEmbeddingModel } from './provider';
import { env } from '@/lib/env';

/** Embedding 单批条数：受供应商 TPM/单请求条数限制，保守取 32 */
const BATCH_SIZE = 32;
const MAX_RETRIES = 3;

/** 单条文本向量化（检索问题用）。 */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  if (!vector) throw new Error('Embedding 返回为空');
  return vector;
}

/**
 * 批量文本向量化，自动分片、指数退避重试。
 * 返回顺序与输入严格一致。
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const result: number[][] = new Array(texts.length);

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    const embeddings = await embedWithRetry(batch);

    embeddings.forEach((vector, i) => {
      result[start + i] = assertDimension(vector);
    });
  }

  return result;
}

async function embedWithRetry(values: string[]): Promise<number[][]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const { embeddings } = await embedMany({ model: getEmbeddingModel(), values });
      return embeddings;
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES) break;
      await delay(2 ** attempt * 500);
    }
  }
  throw new Error(`Embedding 调用失败（已重试 ${MAX_RETRIES} 次）: ${String(lastError)}`);
}

function assertDimension(vector: number[]): number[] {
  if (vector.length !== env.EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding 维度 ${vector.length} 与配置 EMBEDDING_DIMENSIONS=${env.EMBEDDING_DIMENSIONS} 不一致。` +
        '请检查 EMBEDDING_MODEL，或修正维度后重新执行 pnpm db:init。',
    );
  }
  return vector;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
