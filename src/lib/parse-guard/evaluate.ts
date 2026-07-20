export type ObservationStatus = "sufficient" | "empty";

function isBlank(s: unknown): boolean {
  return typeof s === "string" && s.trim().length === 0;
}

/**
 * Defensively detect an empty retrieval result across the shapes an MCP tool
 * may return (string, array, or a CallToolResult-like { content: [...] }).
 * Only definite emptiness yields "empty" (zero false positives); anything with
 * real content is "sufficient". Future scoring/heuristics slot in here.
 */
export function evaluateRetrieval(result: unknown): {
  status: ObservationStatus;
} {
  if (result == null) return { status: "empty" };
  if (typeof result === "string") {
    return { status: isBlank(result) ? "empty" : "sufficient" };
  }
  if (Array.isArray(result)) {
    return { status: result.length === 0 ? "empty" : "sufficient" };
  }
  if (typeof result === "object") {
    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const hasText = content.some((part) => {
        const text = (part as { text?: unknown })?.text;
        return typeof text === "string" ? !isBlank(text) : part != null;
      });
      return { status: hasText ? "sufficient" : "empty" };
    }
  }
  return { status: "sufficient" };
}
