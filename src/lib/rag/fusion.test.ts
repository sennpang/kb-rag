import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reciprocalRankFusion } from './fusion';

describe('reciprocalRankFusion', () => {
  it('单路列表保持原顺序，分数按 1/(k+rank) 递减', () => {
    const fused = reciprocalRankFusion([{ items: [{ id: 'a' }, { id: 'b' }] }], 60);
    assert.deepEqual(fused.map((f) => f.item.id), ['a', 'b']);
    assert.ok(fused[0]!.score > fused[1]!.score);
    assert.ok(Math.abs(fused[0]!.score - 1 / 61) < 1e-9);
  });

  it('被两路同时召回的文档融合分更高（即使排名都不是第一）', () => {
    const listA = [{ id: 'x' }, { id: 'shared' }];
    const listB = [{ id: 'y' }, { id: 'shared' }];
    const fused = reciprocalRankFusion([{ items: listA }, { items: listB }]);

    assert.equal(fused[0]!.item.id, 'shared');
  });

  it('weight 更高的路对排名影响更大', () => {
    const lowWeight = reciprocalRankFusion(
      [
        { items: [{ id: 'a' }, { id: 'b' }], weight: 1 },
        { items: [{ id: 'b' }, { id: 'a' }], weight: 3 },
      ],
      60,
    );
    assert.equal(lowWeight[0]!.item.id, 'b');
  });

  it('空列表安全返回空数组', () => {
    assert.deepEqual(reciprocalRankFusion([]), []);
  });
});
