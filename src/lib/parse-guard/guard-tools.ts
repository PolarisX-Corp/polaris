import type { ToolSet } from "ai";
import { evaluateRetrieval, type ObservationStatus } from "./evaluate";

const INJECTION =
  "PARSE_GUARD: The document search returned no relevant results. " +
  "Tell the user the information was not found in the documents and do not " +
  "fabricate document-grounded claims.";

export type GuardRecord = {
  toolName: string;
  args: unknown;
  status: ObservationStatus;
  action: "allow" | "annotate";
};

export type GuardContext = {
  onRecord: (record: GuardRecord) => void;
};

/**
 * Wrap each MCP tool's execute so an empty retrieval result is replaced with a
 * warning the model must not ignore, and every call is recorded via onRecord.
 * Tools without an execute function are passed through unchanged.
 */
export function guardTools(tools: ToolSet, ctx: GuardContext): ToolSet {
  const wrapped: ToolSet = {};

  for (const [name, tool] of Object.entries(tools)) {
    const original = tool.execute as
      | ((args: unknown, options: unknown) => Promise<unknown>)
      | undefined;

    if (typeof original !== "function") {
      wrapped[name] = tool;
      continue;
    }

    wrapped[name] = {
      ...tool,
      execute: (async (args: unknown, options: unknown) => {
        const result = await original(args, options);
        const { status } = evaluateRetrieval(result);
        if (status === "empty") {
          ctx.onRecord({ toolName: name, args, status, action: "annotate" });
          return INJECTION;
        }
        ctx.onRecord({ toolName: name, args, status, action: "allow" });
        return result;
      }) as typeof tool.execute,
    } as typeof tool;
  }

  return wrapped;
}
