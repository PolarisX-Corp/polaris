"use client";

import type { ChatModel } from "@/lib/ai/providers";

export function ModelSelect({
  models,
  value,
  onChange,
  disabled,
}: {
  models: ChatModel[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  if (models.length === 0) {
    return (
      <span className="text-sm text-red-600">
        利用可能なモデルがありません(APIキー未設定)
      </span>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
