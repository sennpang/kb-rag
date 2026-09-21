import postgres, { type Sql } from 'postgres';
import { env } from '@/lib/env';

/**
 * 懒加载的全局连接池：
 * - Next dev 热更新反复加载模块，挂 globalThis 避免连接数暴涨；
 * - 首次执行 SQL 时才读取 DATABASE_URL 创建连接，构建期不要求环境变量存在。
 */
const globalForDb = globalThis as unknown as { __kbragSql?: Sql };

function createClient(): Sql {
  if (globalForDb.__kbragSql) return globalForDb.__kbragSql;

  globalForDb.__kbragSql = postgres(env.DATABASE_URL, {
    max: 10,
    // Neon 等托管库的 pooled 连接走 PgBouncer 事务模式，与服务端 prepared statement 不兼容；
    // 本地直连 Postgres 关闭它也无副作用，故统一关闭，保证同一套配置两处可跑。
    prepare: false,
    // Neon 计算节点休眠后冷启动实测可达 17s，默认 10s 会误报 CONNECT_TIMEOUT
    connect_timeout: 30,
    onnotice: () => undefined, // RRF 提示等 NOTICE 不刷屏
  });
  return globalForDb.__kbragSql;
}

/** 透明代理：sql`...` / sql.begin / sql.unsafe 全部转发到真实连接池。 */
export const sql: Sql = new Proxy((() => {}) as unknown as Sql, {
  apply(_target, thisArg, args) {
    return Reflect.apply(createClient(), thisArg, args);
  },
  get(_target, property, receiver) {
    const client = createClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
