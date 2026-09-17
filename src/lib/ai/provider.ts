import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/lib/env';

/**
 * 模型客户端按需创建（env 在首次调用时才校验）。
 * 对话默认 DeepSeek、Embedding 默认硅基流动 BGE-m3，均走 OpenAI 兼容协议；
 * 换模型只改 .env.local：baseURL / key / model。
 * 注意：DeepSeek 不提供 embedding 接口，因此两者使用独立配置。
 */

type ChatModel = ReturnType<ReturnType<typeof createOpenAI>>;
type EmbeddingModel = ReturnType<ReturnType<typeof createOpenAI>['embedding']>;

let chatModelInstance: ChatModel | null = null;
let embeddingModelInstance: EmbeddingModel | null = null;

export function getChatModel(): ChatModel {
  chatModelInstance ??= createOpenAI({
    baseURL: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
  })(env.LLM_MODEL);
  return chatModelInstance;
}

export function getEmbeddingModel(): EmbeddingModel {
  embeddingModelInstance ??= createOpenAI({
    baseURL: env.EMBEDDING_BASE_URL,
    apiKey: env.EMBEDDING_API_KEY,
  }).embedding(env.EMBEDDING_MODEL);
  return embeddingModelInstance;
}
