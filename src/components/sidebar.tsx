import Link from "next/link";
import { auth } from "@/lib/auth";
import { listConversations } from "@/lib/db/queries";
import { mcpServerUrl } from "@/lib/mcp/config";
import { getConnection } from "@/lib/mcp/connection";
import { ConversationItem } from "./conversation-item";
import { UserMenu } from "./user-menu";

export async function Sidebar() {
  const session = await auth();
  const userId = session?.user?.id;
  const conversations = userId ? await listConversations(userId) : [];
  const serverUrl = mcpServerUrl();
  const mcpConnected =
    userId && serverUrl
      ? (await getConnection(userId, serverUrl))?.status === "connected"
      : false;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
      <div className="p-3">
        <Link
          href="/"
          className="block rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新しいチャット
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {conversations.length === 0 && (
          <p className="px-2 py-4 text-xs text-gray-400">
            まだ会話はありません
          </p>
        )}
        {conversations.map((c) => (
          <ConversationItem key={c.id} id={c.id} title={c.title} />
        ))}
      </nav>

      <div className="space-y-2 border-t border-gray-200 p-3 dark:border-gray-800">
        <Link
          href="/settings"
          className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/50"
        >
          <span>設定</span>
          <span
            className={
              "text-xs " +
              (mcpConnected ? "text-green-600" : "text-gray-400")
            }
            title="ドキュメント接続状態"
          >
            ● {mcpConnected ? "接続済み" : "未接続"}
          </span>
        </Link>
        <UserMenu />
      </div>
    </aside>
  );
}
