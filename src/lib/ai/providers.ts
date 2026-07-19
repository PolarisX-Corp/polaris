import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type Provider = "anthropic" | "openai" | "google";

export type ChatModel = {
  /** "<provider>:<model>" — stable id used by the client and stored on messages */
  id: string;
  label: string;
  provider: Provider;
  providerModelId: string;
};

export const MODEL_CATALOG: ChatModel[] = [
  {
    id: "anthropic:claude-sonnet-5",
    label: "Claude Sonnet 5",
    provider: "anthropic",
    providerModelId: "claude-sonnet-5",
  },
  {
    id: "anthropic:claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    providerModelId: "claude-haiku-4-5-20251001",
  },
  {
    id: "openai:gpt-5",
    label: "GPT-5",
    provider: "openai",
    providerModelId: "gpt-5",
  },
  // Gemini 2.5 Pro is intentionally omitted: it is not available on the
  // Google API free tier (free-tier request quota is 0), so it 429s.
  {
    id: "google:gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "google",
    providerModelId: "gemini-2.5-flash",
  },
];

type Env = Record<string, string | undefined>;

const KEY_VARS: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

function configuredProviders(env: Env): Set<Provider> {
  return new Set(
    (Object.keys(KEY_VARS) as Provider[]).filter((p) => Boolean(env[KEY_VARS[p]])),
  );
}

/** Models whose provider API key is present in the environment. */
export function availableModels(env: Env = process.env): ChatModel[] {
  const providers = configuredProviders(env);
  return MODEL_CATALOG.filter((m) => providers.has(m.provider));
}

/** Preferred default model id, or null when no provider is configured. */
export function defaultModelId(env: Env = process.env): string | null {
  const models = availableModels(env);
  return (
    models.find((m) => m.id === "anthropic:claude-sonnet-5")?.id ?? models[0]?.id ?? null
  );
}

/** Resolve a catalog id to a concrete AI SDK model. Throws when unknown or unconfigured. */
export function resolveModel(id: string, env: Env = process.env): LanguageModel {
  const entry = MODEL_CATALOG.find((m) => m.id === id);
  if (!entry) throw new Error(`unknown model id: ${id}`);
  const apiKey = env[KEY_VARS[entry.provider]];
  if (!apiKey) throw new Error(`provider not configured: ${entry.provider}`);
  switch (entry.provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(entry.providerModelId);
    case "openai":
      return createOpenAI({ apiKey })(entry.providerModelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(entry.providerModelId);
  }
}
