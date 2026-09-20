import bcrypt from 'bcryptjs';

/**
 * 密码哈希：bcrypt 自带随机盐，cost=12 在安全性与 serverless 冷启动耗时间平衡。
 * 仅服务端调用，永不下发哈希。
 */
const COST_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
