/**
 * Reciprocal Rank Fusion（RRF，倒数排名融合）。
 *
 * 向量相似度分数与全文检索分数量纲不同，不能直接相加；
 * RRF 只使用文档在各路结果中的排名：score(d) = Σ weight / (k + rank(d))。
 * k 常取 60，作用是压低头部排名的权重差异。
 *
 * 参考：https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
 */

export interface RankedItem {
  id: string;
}

export interface FusedItem<T extends RankedItem> {
  item: T;
  score: number;
}

export function reciprocalRankFusion<T extends RankedItem>(
  rankedLists: Array<{ items: T[]; weight?: number }>,
  k = 60,
): FusedItem<T>[] {
  const scores = new Map<string, number>();
  const registry = new Map<string, T>();

  for (const list of rankedLists) {
    const weight = list.weight ?? 1;
    list.items.forEach((item, index) => {
      const contribution = weight / (k + index + 1);
      scores.set(item.id, (scores.get(item.id) ?? 0) + contribution);
      registry.set(item.id, item);
    });
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ item: registry.get(id)!, score }))
    .sort((a, b) => b.score - a.score);
}
