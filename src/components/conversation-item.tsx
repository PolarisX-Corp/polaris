"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function ConversationItem({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [deleting, setDeleting] = useState(false);
  const isActive = pathname === `/chat/${id}`;

  const handleDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (isActive) router.push("/");
      router.refresh();
    } else {
      setDeleting(false);
    }
  };

  return (
    <div
      className={
        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm " +
        (isActive
          ? "bg-gray-200 dark:bg-gray-800"
          : "hover:bg-gray-100 dark:hover:bg-gray-800/50")
      }
    >
      <Link href={`/chat/${id}`} className="flex-1 truncate" title={title}>
        {title}
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label="削除"
        className="shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 disabled:opacity-40"
      >
        ×
      </button>
    </div>
  );
}
