"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ChatModel } from "@/lib/ai/providers";
import { ChatInput } from "./chat-input";
import { Message } from "./message";
import { ModelSelect } from "./model-select";

export function Chat({
  conversationId,
  initialMessages,
  isNew,
}: {
  conversationId: string;
  initialMessages?: UIMessage[];
  isNew?: boolean;
}) {
  const router = useRouter();
  const [models, setModels] = useState<ChatModel[]>([]);
  const [modelId, setModelId] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const urlUpdated = useRef(false);

  const { messages, sendMessage, status, error, clearError } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onFinish: () => {
      // Refresh the sidebar so a newly created conversation appears.
      router.refresh();
    },
  });

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data: { models: ChatModel[]; defaultModelId: string | null }) => {
        setModels(data.models);
        if (data.defaultModelId) setModelId(data.defaultModelId);
      })
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isBusy = status === "submitted" || status === "streaming";

  const handleSend = (text: string) => {
    if (!modelId) return;
    clearError();
    // On the first message of a new chat, reflect the conversation URL
    // without a navigation so the component (and stream) stays mounted.
    if (isNew && !urlUpdated.current) {
      window.history.replaceState(null, "", `/chat/${conversationId}`);
      urlUpdated.current = true;
    }
    void sendMessage({ text }, { body: { conversationId, modelId } });
  };

  const retry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (text) handleSend(text);
  };

  return (
    <div className="mx-auto flex h-screen w-full max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <span className="font-semibold">Polaris</span>
        <ModelSelect
          models={models}
          value={modelId}
          onChange={setModelId}
          disabled={isBusy}
        />
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <p className="pt-20 text-center text-sm text-gray-400">
            メッセージを送信して会話を始めましょう
          </p>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {error && (
          <div className="flex flex-col items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            <span>エラーが発生しました。もう一度お試しください。</span>
            {error.message && (
              <span className="font-mono text-xs opacity-80">
                {error.message}
              </span>
            )}
            <button
              type="button"
              onClick={retry}
              className="rounded-md bg-red-600 px-3 py-1 text-white"
            >
              再試行
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
        <ChatInput onSend={handleSend} disabled={isBusy || !modelId} />
      </div>
    </div>
  );
}
