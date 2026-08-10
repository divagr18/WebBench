import type { ChatMessage, ChatOptions, ChatResponse, ToolDef, UsageInfo } from '@echobench/llm';

export interface LlmLike {
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResponse>;
}

export type { ChatMessage, ChatOptions, ChatResponse, ToolDef, UsageInfo };
