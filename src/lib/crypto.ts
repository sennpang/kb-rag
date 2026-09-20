import { createHash } from 'node:crypto';

/** 计算字节数据的 SHA-256 十六进制指纹（服务端去重与验证码哈希共用）。 */
export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** 生成 6 位数字验证码（密码学随机，避免模偏差：拒绝大于阈值的采样）。 */
export function generateDigitCode(length = 6): string {
  const max = 10 ** length;
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0]!;
  } while (value >= limit);
  return String(value % max).padStart(length, '0');
}
