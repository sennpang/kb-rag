import type { ChatStreamEvent } from './types';

/** 消费 text/event-stream：按空行切帧、提取 data: 行并解析为事件，容忍跨 chunk 到达。 */
export async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice('data: '.length)) as ChatStreamEvent);
      } catch {
        // 忽略不完整/非 JSON 帧（如代理注入的注释行）
      }
    }
  }
}
