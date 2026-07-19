import { getReceipts } from "@/lib/db/queries";
import { receiptsToActivity } from "./receipts-source";
import type { ActivityRecord } from "./types";

export function sortActivity(records: ActivityRecord[]): ActivityRecord[] {
  return [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Aggregate all activity sources for a conversation. v1: receipts only. */
export async function getConversationActivity(
  conversationId: string,
): Promise<ActivityRecord[]> {
  const receiptRows = await getReceipts(conversationId);
  return sortActivity(receiptsToActivity(receiptRows));
}
