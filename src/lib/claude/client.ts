/**
 * Claude API client wrapper
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODELS = {
  // Use Haiku for fast, cheap operations (extraction, simple Q&A)
  fast: "claude-3-haiku-20240307",
  // Use Sonnet for complex reasoning (solutions, evaluation)
  smart: "claude-3-5-sonnet-20241022",
} as const;

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeOptions {
  model?: keyof typeof MODELS;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

/**
 * Send a message to Claude and get a response
 */
export async function askClaude(
  prompt: string,
  options: ClaudeOptions = {}
): Promise<string> {
  const {
    model = "fast",
    maxTokens = 4096,
    temperature = 0.3,
    system,
  } = options;

  const response = await anthropic.messages.create({
    model: MODELS[model],
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text || "";
}

/**
 * Send a message to Claude and parse JSON response
 */
export async function askClaudeJson<T>(
  prompt: string,
  options: ClaudeOptions = {}
): Promise<T> {
  const response = await askClaude(prompt, options);

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    response.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  try {
    return JSON.parse(jsonMatch[1]) as T;
  } catch (error) {
    console.error("Failed to parse Claude JSON:", response);
    throw new Error("Invalid JSON in Claude response");
  }
}

/**
 * Chat with Claude using message history
 */
export async function chatWithClaude(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {}
): Promise<string> {
  const {
    model = "smart",
    maxTokens = 4096,
    temperature = 0.5,
    system,
  } = options;

  const response = await anthropic.messages.create({
    model: MODELS[model],
    max_tokens: maxTokens,
    temperature,
    system,
    messages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text || "";
}

export { anthropic };
