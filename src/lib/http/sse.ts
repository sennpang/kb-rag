/**
 * SSE 响应工厂：统一帧格式（`data: <json>\n\n`）与连接断开语义。
 * produce 负责业务事件序列（含把生成异常转成 error 事件），本层只管传输。
 */

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

export interface SseSink {
  /** 下发一个事件帧 */
  send(event: unknown): void;
  /** 客户端断开后变为 aborted，用于中断上游生成 */
  signal: AbortSignal;
}

export function sseResponse(produce: (sink: SseSink) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const abortController = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const send = (event: unknown) =>
        streamController.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        await produce({ send, signal: abortController.signal });
      } finally {
        streamController.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
