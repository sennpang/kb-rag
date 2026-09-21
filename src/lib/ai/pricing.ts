/**
 * Token 金额估算（前后端通用的纯计算模块，不依赖任何运行时环境）。
 *
 * 口径说明：
 * - 单价取 DeepSeek 官方最新公开价（2026-09 起），单位：元 / 百万 tokens；
 * - 峰谷定价：北京时间工作日 9:00-12:00、14:00-18:00 为高峰，其余为空闲（半价）；
 * - AI SDK 的 usage 不提供缓存命中数，输入一律按「缓存未命中」单价计算，
 *   因此结果为费用上限；实际请求命中上下文缓存时只会更低；
 * - 法定节假日未纳入自动判断（节假日官方按空闲价计费，影响方向也是高估）；
 * - 向量化使用硅基流动 BAAI/bge-m3，当前免费，不计入成本。
 */

export interface CostEstimate {
  /** 模型展示名 */
  modelLabel: string;
  /** 是否按高峰价计算 */
  peak: boolean;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

interface TierPrice {
  label: string;
  /** 输入（缓存未命中），元 / 百万 tokens */
  input: number;
  /** 输入（缓存命中），仅用于参考展示 */
  inputCacheHit: number;
  /** 输出，元 / 百万 tokens */
  output: number;
}

interface ModelPricing {
  peak: TierPrice;
  offPeak: TierPrice;
}

/**
 * 模型定价表（单位：元 / 百万 tokens）。
 * deepseek-chat / deepseek-reasoner 为兼容旧名，官方分别路由到
 * deepseek-v4-flash 的非思考 / 思考模式，同价计费。
 */
const PRICING_TABLE: Record<string, ModelPricing> = {
  'deepseek-v4-flash': {
    peak: { label: 'DeepSeek V4 Flash', input: 2, inputCacheHit: 0.04, output: 8 },
    offPeak: { label: 'DeepSeek V4 Flash', input: 1, inputCacheHit: 0.02, output: 4 },
  },
};

/** 兼容模型名 → 定价表 key */
const MODEL_ALIASES: Record<string, string> = {
  'deepseek-chat': 'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-flash',
  'deepseek-flash': 'deepseek-v4-flash',
};

/** 按用量与时刻估算金额；模型未收录时返回 null（不估算总比乱算好）。 */
export function estimateCost(
  model: string,
  usage: { input: number; output: number },
  at: Date = new Date(),
): CostEstimate | null {
  const key = MODEL_ALIASES[model] ?? model;
  const pricing = PRICING_TABLE[key];
  if (!pricing) return null;

  const peak = isPeakHour(at);
  const tier = peak ? pricing.peak : pricing.offPeak;
  const inputCost = (usage.input / 1_000_000) * tier.input;
  const outputCost = (usage.output / 1_000_000) * tier.output;

  return {
    modelLabel: tier.label,
    peak,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * 判断给定时刻（UTC）在北京时间下是否属于高峰时段：
 * 工作日（周一至周五）9:00-12:00、14:00-18:00；周末全天空闲。
 */
export function isPeakHour(at: Date): boolean {
  // 偏移到 UTC+8 后直接读取“北京时间”的小时与星期
  const bj = new Date(at.getTime() + 8 * 3_600_000);
  const hour = bj.getUTCHours();
  const weekday = bj.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/**
 * 金额格式化：不足 1 元保留 4 位小数（如 ¥0.0026），否则保留 2 位并加千分位。
 */
export function formatCost(value: number): string {
  if (value === 0) return '¥0';
  if (Math.abs(value) < 1) {
    return `¥${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
  }
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
