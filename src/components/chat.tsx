"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ChatModel } from "@/lib/ai/providers";
import { ActivityPanel } from "./activity-panel";
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
  const [showActivity, setShowActivity] = useState(false);
  const [activityKey, setActivityKey] = useState(0);

  const { messages, sendMessage, status, error, clearError } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onFinish: () => {
      // Refresh the sidebar so a message send is reflected (ordering, etc.).
      //
      // Skip this for a brand-new chat. Its URL was swapped to /chat/<id> via
      // history.replaceState (no Next navigation), so a refresh reconciles the
      // route from "/" (NewChatPage) to /chat/[id] (ConversationPage). That
      // remounts <Chat> and re-seeds useChat from getMessages() — which does
      // not yet contain the just-streamed assistant reply (it is persisted
      // asynchronously in the route's onFinish). The reply would vanish from
      // the view and, because the remount tears down the stream, never finish
      // persisting. The new conversation still appears in the sidebar on the
      // next navigation or reload.
      if (!isNew) router.refresh();
      // Refetch the activity panel so new receipts show up. This only bumps a
      // key passed to <ActivityPanel>; it does not remount <Chat>, so it is
      // safe on the first turn of a new chat too.
      setActivityKey((k) => k + 1);
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
        <div className="flex items-center gap-2">
          <ModelSelect
            models={models}
            value={modelId}
            onChange={setModelId}
            disabled={isBusy}
          />
          <button
            type="button"
            onClick={() => setShowActivity((v) => !v)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            監査ログ
          </button>
        </div>
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

      <ActivityPanel
        conversationId={conversationId}
        open={showActivity}
        refreshKey={activityKey}
        onClose={() => setShowActivity(false)}
      />
    </div>
  );
}
