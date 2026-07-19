"use client";

import { useEffect, useState } from "react";
import type { ActivityRecord } from "@/lib/activity/types";

export function ActivityPanel({
  conversationId,
  open,
  refreshKey,
  onClose,
}: {
  conversationId: string;
  open: boolean;
  refreshKey: number;
  onClose: () => void;
}) {
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(false);
    fetch(`/api/conversations/${conversationId}/activity`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: { records: ActivityRecord[] }) => {
        if (active) setRecords(data.records);
      })
      .catch(() => {
        if (active) {
          setRecords([]);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [open, conversationId, refreshKey]);

  if (!open) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-20 flex w-96 max-w-full flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <span className="text-sm font-semibold">監査ログ</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          ×
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {error && (
          <p className="text-sm text-red-600">
            取得に失敗しました。パネルを開き直してください。
          </p>
        )}
        {!error && records.length === 0 && (
          <p className="text-sm text-gray-400">まだ記録はありません。</p>
        )}
        {records.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-gray-200 dark:border-gray-800"
          >
            <button
              type="button"
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left"
            >
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium dark:bg-gray-800">
                {r.kind}
              </span>
              {r.boundary && (
                <span className="text-xs text-gray-400">{r.boundary}</span>
              )}
              <span className="flex-1 truncate text-xs text-gray-600 dark:text-gray-300">
                {r.summary}
              </span>
              <time className="shrink-0 text-[10px] text-gray-400">
                {new Date(r.createdAt).toLocaleTimeString("ja-JP")}
              </time>
            </button>
            {expanded === r.id && (
              <dl className="space-y-1 border-t border-gray-100 px-3 py-2 text-xs dark:border-gray-800">
                {r.details.map((d) => (
                  <div key={d.label} className="flex gap-2">
                    <dt className="shrink-0 text-gray-400">{d.label}</dt>
                    <dd className="break-all font-mono text-gray-700 dark:text-gray-300">
                      {d.value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
