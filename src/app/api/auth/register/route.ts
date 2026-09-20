import {
  claimUnownedKnowledgeBases,
  consumeVerificationCode,
  getUserByEmail,
  getLatestVerificationCode,
  incrementCodeAttempts,
  insertUser,
} from '@/lib/db/repositories';
import { hashPassword } from '@/lib/auth/password';
import { handleRoute, parseJsonBody, ApiError } from '@/lib/http/route';
import { sha256Hex } from '@/lib/crypto';
import { registerSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs'; // bcrypt / nodemailer 依赖均需 Node runtime
export const maxDuration = 30;

const MAX_CODE_ATTEMPTS = 5; // 单条验证码最多容错次数，防 6 位数字码在线爆破

/**
 * 注册：校验邮箱验证码（确认邮箱真实归属）→ 查重 → 哈希落库 → 认领历史无主知识库。
 * 不直接建立会话：前端注册成功后调用 signIn，职责单一。
 */
export async function POST(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const { email, password, name, code } = await parseJsonBody(req, registerSchema);

    if (await getUserByEmail(email)) {
      throw new ApiError('该邮箱已注册，请直接登录', 409);
    }

    const record = await getLatestVerificationCode(email, 'register');
    if (!record || record.consumedAt) throw new ApiError('请先获取验证码', 422);
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      throw new ApiError('验证码已过期，请重新获取', 422);
    }
    if (record.attempts >= MAX_CODE_ATTEMPTS) {
      throw new ApiError('验证码错误次数过多，请重新获取', 422);
    }

    if (record.codeHash !== sha256Hex(new TextEncoder().encode(code))) {
      const updated = await incrementCodeAttempts(record.id);
      throw new ApiError(
        updated.attempts >= MAX_CODE_ATTEMPTS
          ? '验证码错误次数过多，请重新获取'
          : `验证码不正确，还可尝试 ${MAX_CODE_ATTEMPTS - updated.attempts} 次`,
        422,
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await insertUser({ email, name: name ?? null, passwordHash });
    await consumeVerificationCode(record.id); // 单次有效，防止验证码复用

    const claimed = await claimUnownedKnowledgeBases(user.id);
    if (claimed > 0) console.log(`[auth] 用户 ${email} 认领了 ${claimed} 个历史知识库`);

    return Response.json({ id: user.id, email: user.email }, { status: 201 });
  });
}
