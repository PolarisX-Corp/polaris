import type { UIMessage } from "ai";

function ToolPart({ part }: { part: Extract<UIMessage["parts"][number], { type: string }> }) {
  // Tool parts have type like "tool-<name>" or "dynamic-tool".
  const anyPart = part as {
    type: string;
    toolName?: string;
    state?: string;
  };
  const name =
    anyPart.toolName ?? anyPart.type.replace(/^tool-/, "").replace(/^dynamic-tool$/, "tool");
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900">
      🔧 ドキュメント検索: {name}
    </div>
  );
}

export function Message({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const toolParts = message.parts.filter(
    (part) => part.type.startsWith("tool-") || part.type === "dynamic-tool",
  );

  return (
    <div className={isUser ? "flex justify-end" : "flex flex-col items-start gap-1"}>
      {!isUser &&
        toolParts.map((part, i) => <ToolPart key={i} part={part} />)}
      {(text || isUser) && (
        <div
          className={
            isUser
              ? "max-w-[80%] whitespace-pre-wrap rounded-2xl bg-blue-600 px-4 py-2 text-white"
              : "max-w-[80%] whitespace-pre-wrap rounded-2xl bg-gray-100 px-4 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
          }
        >
          {text || (isUser ? "" : "…")}
        </div>
      )}
    </div>
  );
}
