import { describe, expect, it } from "vitest";
import { availableModels, defaultModelId, resolveModel } from "./providers";

const env = (overrides: Record<string, string>) => overrides;

describe("availableModels", () => {
  it("returns only models whose provider API key is set", () => {
    const models = availableModels(env({ ANTHROPIC_API_KEY: "sk-x" }));
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === "anthropic")).toBe(true);
  });

  it("returns empty when no keys are set", () => {
    expect(availableModels(env({}))).toEqual([]);
  });
});

describe("resolveModel", () => {
  it("throws for unknown model id", () => {
    expect(() => resolveModel("nope:x", env({ ANTHROPIC_API_KEY: "k" }))).toThrow(/unknown/i);
  });

  it("throws when provider key is missing", () => {
    expect(() => resolveModel("anthropic:claude-sonnet-5", env({}))).toThrow(/not configured/i);
  });

  it("resolves a configured model", () => {
    const model = resolveModel("anthropic:claude-sonnet-5", env({ ANTHROPIC_API_KEY: "k" }));
    expect(model).toBeDefined();
  });
});

describe("defaultModelId", () => {
  it("prefers claude-sonnet-5 when anthropic is configured", () => {
    expect(defaultModelId(env({ ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k" }))).toBe(
      "anthropic:claude-sonnet-5",
    );
  });

  it("returns null when no provider is configured", () => {
    expect(defaultModelId(env({}))).toBeNull();
  });
});
