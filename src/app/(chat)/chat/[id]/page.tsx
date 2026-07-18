import type { UIMessage } from "ai";
import { notFound } from "next/navigation";
import { Chat } from "@/components/chat";
import { auth } from "@/lib/auth";
import { canAccessConversation } from "@/lib/db/access";
import { getConversation, getMessages } from "@/lib/db/queries";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) notFound();

  const conversation = await getConversation(id);
  if (!canAccessConversation(conversation, userId)) notFound();

  const rows = await getMessages(id);
  const initialMessages: UIMessage[] = rows.map((r) => ({
    id: r.id,
    role: r.role,
    parts: r.parts,
  }));

  return <Chat conversationId={id} initialMessages={initialMessages} />;
}
