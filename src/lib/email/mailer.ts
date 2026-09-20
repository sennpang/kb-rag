import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/env';

let transporter: Transporter | null = null;

/** SMTP 连接懒加载单例（首次发信时才建立连接，构建期无副作用）。 */
function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // 465 走 SSL；其他端口走 STARTTLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

/** 发送注册验证码邮件。发件失败向上抛出，由调用方转 502。 */
export async function sendVerificationCodeEmail(to: string, code: string): Promise<void> {
  const minutes = 10;
  await getTransporter().sendMail({
    from: env.EMAIL_FROM ?? `"RAG 知识库" <${env.SMTP_USER}>`,
    to,
    subject: `【RAG 知识库】注册验证码 ${code}`,
    text: `你的注册验证码是 ${code}，${minutes} 分钟内有效。若非本人操作，请忽略此邮件。`,
    html: verificationHtml(code, minutes),
  });
}

function verificationHtml(code: string, minutes: number): string {
  return `
  <div style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,sans-serif;">
    <div style="max-width:400px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;color:#6366f1;">RAG · KNOWLEDGE BASE</p>
      <h1 style="margin:0 0 20px;font-size:18px;color:#1e293b;">注册验证码</h1>
      <div style="background:#f1f5f9;border-radius:12px;padding:18px;text-align:center;">
        <span style="font-size:30px;font-weight:700;letter-spacing:8px;color:#4f46e5;">${code}</span>
      </div>
      <p style="margin:16px 0 0;font-size:13px;color:#64748b;line-height:1.7;">
        验证码 <b>${minutes}</b> 分钟内有效，请勿向任何人泄露。<br/>
        如果这不是你本人的操作，请忽略本邮件。
      </p>
    </div>
  </div>`;
}
