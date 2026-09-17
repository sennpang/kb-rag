import type { RetrievedChunk } from './types';

/**
 * Rerank（精排）抽象层。
 *
 * 默认实现为 NoopReranker：保持 RRF 融合后的顺序。
 * 接入 Cohere Rerank / 硅基流动 rerank / 自托管 BGE-reranker 时，
 * 只需实现本接口（入参为问题与候选段，输出按相关性重排后的结果），
 * 在 retrieve.ts 中替换实例即可，上层调用无需改动。
 */
export interface Reranker {
  readonly name: string;
  rerank(question: string, candidates: RetrievedChunk[], topK: number): Promise<RetrievedChunk[]>;
}

export class NoopReranker implements Reranker {
  readonly name = 'noop';

  async rerank(_question: string, candidates: RetrievedChunk[], topK: number): Promise<RetrievedChunk[]> {
    return candidates.slice(0, topK);
  }
}
