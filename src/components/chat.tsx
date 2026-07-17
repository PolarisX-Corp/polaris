"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import type { ChatModel } from "@/lib/ai/providers";
import { ChatInput } from "./chat-input";
import { Message } from "./message";
import { ModelSelect } from "./model-select";

export function Chat({ userSlot }: { userSlot?: React.ReactNode }) {
  const [models, setModels] = useState<ChatModel[]>([]);
  const [modelId, setModelId] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, clearError } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
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
    void sendMessage({ text }, { body: { modelId } });
  };

  return (
    <div className="mx-auto flex h-screen w-full max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Polaris</span>
          <ModelSelect
            models={models}
            value={modelId}
            onChange={setModelId}
            disabled={isBusy}
          />
        </div>
        {userSlot}
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
            <button
              type="button"
              onClick={() => {
                const lastUser = [...messages]
                  .reverse()
                  .find((m) => m.role === "user");
                const text = lastUser?.parts
                  .filter((p) => p.type === "text")
                  .map((p) => p.text)
                  .join("");
                if (text) handleSend(text);
              }}
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
