/** 检索结果中的单个切片（含展示与溯源所需信息） */
export interface RetrievedChunk {
  id: string;
  docId: string;
  /** 冗余文档名，避免生成 prompt 时再回查 */
  docName: string;
  chunkIndex: number;
  content: string;
  /** 该路/融合后的相关度分数（仅用于调试面板展示） */
  score: number;
}

export interface RetrievalOptions {
  /** 最终返回给 LLM 的切片数 */
  topK: number;
  /** 每路召回的候选数（融合前），通常为 topK 的 2 倍 */
  candidateMultiplier: number;
}

export const DEFAULT_RETRIEVAL_OPTIONS: RetrievalOptions = {
  topK: 6,
  candidateMultiplier: 2,
};
