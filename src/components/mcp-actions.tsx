"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function McpActions({ status }: { status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const connect = () => {
    window.location.href = "/api/mcp/auth/start";
  };

  const disconnect = async () => {
    setBusy(true);
    const res = await fetch("/api/mcp/disconnect", { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
  };

  if (status === "connected") {
    return (
      <button
        type="button"
        onClick={disconnect}
        disabled={busy}
        className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        切断する
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={connect}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
    >
      接続する
    </button>
  );
}
