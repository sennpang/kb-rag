import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { splitText } from './splitters';

describe('splitText', () => {
  it('空文本返回空数组', () => {
    assert.deepEqual(splitText('   \n\n  '), []);
  });

  it('短文本只产出一个切片', () => {
    const chunks = splitText('这是一段很短的文本。', { chunkSize: 500, overlap: 80 });
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0], '这是一段很短的文本。');
  });

  it('段落聚合不超过 chunkSize，并保留段落分隔', () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `第 ${i} 段，内容约十五个字左右。`);
    const chunks = splitText(paragraphs.join('\n\n'), { chunkSize: 60, overlap: 10 });

    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 60 * 2, '单段超长时允许硬切，但普通聚合切片不应远超上限');
    }
    assert.match(chunks[0]!, /第 0 段/);
  });

  it('单段超长时硬切，且相邻切片存在重叠', () => {
    const long = '字'.repeat(1000);
    const chunks = splitText(long, { chunkSize: 300, overlap: 50 });

    assert.equal(chunks.length, 4); // 300 / 250 / 250 / 200
    // 第二片的开头 50 字与第一片结尾 50 字相同（overlap）
    assert.equal(chunks[1]!.slice(0, 50), chunks[0]!.slice(-50));
  });

  it('chunkSize 不大于 overlap 时直接报错', () => {
    assert.throws(() => splitText('abc', { chunkSize: 10, overlap: 10 }), /chunkSize/);
  });
});
