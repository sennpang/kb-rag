import {
  countRecentVerificationCodes,
  getUserByEmail,
  getLatestVerificationCode,
  insertVerificationCode,
} from '@/lib/db/repositories';
import { sendVerificationCodeEmail } from '@/lib/email/mailer';
import { getClientIp } from '@/lib/http/client-ip';
import { generateDigitCode, sha256Hex } from '@/lib/crypto';
import { handleRoute, parseJsonBody, ApiError } from '@/lib/http/route';
import { sendCodeSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const PURPOSE = 'register';
const RESEND_INTERVAL_S = 60; // 同邮箱最短间隔
const CODE_TTL_S = 10 * 60; // 验证码有效期

// 频控配额（双维度：邮箱防单点轰炸，IP 防换邮箱刷接口）
const EMAIL_HOURLY_LIMIT = 5;
const IP_HOURLY_LIMIT = 20;
const IP_DAILY_LIMIT = 50;

/**
 * POST /api/auth/send-code：注册验证码发送。
 * 防护链：已注册 → 409；同邮箱 60s → 429；邮箱/IP 配额超限 → 429；
 *         邮件投递失败 → 502。IP 仅以哈希落库。
 */
export async function POST(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const { email } = await parseJsonBody(req, sendCodeSchema);

    if (await getUserByEmail(email)) {
      throw new ApiError('该邮箱已注册，请直接登录', 409);
    }

    // 取不到 IP（如本地开发）时统一归入 unknown 桶，避免攻击者靠隐藏 IP 绕过频控
    const ipHash = sha256Hex(new TextEncoder().encode(getClientIp(req) ?? 'unknown'));

    const latest = await getLatestVerificationCode(email, PURPOSE);
    const elapsedS = latest
      ? (Date.now() - new Date(latest.createdAt).getTime()) / 1000
      : Infinity;
    if (elapsedS < RESEND_INTERVAL_S) {
      throw new ApiError(`发送过于频繁，请 ${Math.ceil(RESEND_INTERVAL_S - elapsedS)} 秒后重试`, 429);
    }

    const [emailHourly, ipHourly, ipDaily] = await Promise.all([
      countRecentVerificationCodes({ email, purpose: PURPOSE, withinSeconds: 3600 }),
      countRecentVerificationCodes({ ipHash, purpose: PURPOSE, withinSeconds: 3600 }),
      countRecentVerificationCodes({ ipHash, purpose: PURPOSE, withinSeconds: 86400 }),
    ]);
    if (emailHourly >= EMAIL_HOURLY_LIMIT) {
      throw new ApiError('该邮箱请求次数过多，请 1 小时后再试', 429);
    }
    if (ipHourly >= IP_HOURLY_LIMIT || ipDaily >= IP_DAILY_LIMIT) {
      throw new ApiError('当前网络请求过于频繁，请稍后再试', 429);
    }

    const code = generateDigitCode();
    await insertVerificationCode({
      email,
      purpose: PURPOSE,
      codeHash: sha256Hex(new TextEncoder().encode(code)),
      ipHash,
      ttlSeconds: CODE_TTL_S,
    });

    try {
      await sendVerificationCodeEmail(email, code);
    } catch (error) {
      console.error('[email] 验证码邮件发送失败：', error);
      throw new ApiError('验证码邮件发送失败，请稍后重试', 502);
    }

    return Response.json({ sent: true, ttlSeconds: CODE_TTL_S });
  });
}
