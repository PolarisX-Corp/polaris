import { and, asc, desc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "./index";
import {
  conversations,
  messages,
  type MessageRole,
} from "./schema";

export async function getConversation(id: string) {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listConversations(userId: string) {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
}

/** Create the conversation if it does not exist; otherwise bump updatedAt. */
export async function upsertConversation(params: {
  id: string;
  userId: string;
  title: string;
}) {
  await db
    .insert(conversations)
    .values({
      id: params.id,
      userId: params.userId,
      title: params.title,
    })
    .onConflictDoUpdate({
      target: conversations.id,
      set: { updatedAt: new Date() },
    });
}

export async function touchConversation(id: string) {
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id));
}

/** Delete a conversation only if owned by the user. Returns true when deleted. */
export async function deleteConversation(id: string, userId: string) {
  const deleted = await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning({ id: conversations.id });
  return deleted.length > 0;
}

export type NewMessage = {
  id: string;
  conversationId: string;
  role: MessageRole;
  parts: UIMessage["parts"];
  modelId?: string | null;
};

export async function saveMessages(rows: NewMessage[]) {
  if (rows.length === 0) return;
  await db
    .insert(messages)
    .values(rows.map((r) => ({ ...r, modelId: r.modelId ?? null })))
    .onConflictDoNothing();
}

export async function getMessages(conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}
