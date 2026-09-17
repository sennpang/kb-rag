import type { ZodType, ZodError } from 'zod';

/**
 * 路由层统一设施：业务代码只抛 ApiError / 调用 parse*，
 * 错误到 JSON 响应的转换全部由 handleRoute 收口。
 */

/** 携带 HTTP 状态码的业务错误 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function zodMessage(error: ZodError): string {
  return error.issues.map((i) => i.message).join('；');
}

/** Next 内部控制流错误（构建期静态探测/重定向），必须原样上抛，不能当作业务异常捕获 */
const NEXT_CONTROL_FLOW_DIGESTS = new Set(['DYNAMIC_SERVER_USAGE', 'NEXT_REDIRECT']);

/** 路由执行器：ApiError 按其状态码返回，未预期异常记日志并返回 500，响应体始终为 JSON。 */
export async function handleRoute(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (typeof digest === 'string' && NEXT_CONTROL_FLOW_DIGESTS.has(digest)) throw error;

    console.error('[api] 未处理异常：', error);
    return Response.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

/** 解析并校验 JSON 请求体，失败抛 422。 */
export async function parseJsonBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(zodMessage(parsed.error), 422);
  return parsed.data;
}

/** 校验 URL 查询参数（以对象形式传入 zod schema），失败抛 422。 */
export function parseQuery<T>(searchParams: URLSearchParams, schema: ZodType<T>): T {
  const parsed = schema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) throw new ApiError(zodMessage(parsed.error), 422);
  return parsed.data;
}

/** 校验路径/表单参数对象，失败抛 422。 */
export function parseParams<T>(params: Record<string, unknown>, schema: ZodType<T>): T {
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw new ApiError(zodMessage(parsed.error), 422);
  return parsed.data;
}
