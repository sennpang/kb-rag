/**
 * 提取真实客户端 IP。
 * Vercel / 反向代理会在 x-forwarded-for 中按「客户端, 代理1, 代理2」排列，取第一个。
 * 注意：该头可被客户端伪造，但平台代理通常会覆写为真实链路，仅用于频控不用于鉴权。
 */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || null;
}
