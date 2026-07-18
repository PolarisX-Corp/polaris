import { Chat } from "@/components/chat";

export default function NewChatPage() {
  // Fresh conversation id for this new chat; persisted on first message.
  const conversationId = crypto.randomUUID();
  return <Chat conversationId={conversationId} isNew />;
}
