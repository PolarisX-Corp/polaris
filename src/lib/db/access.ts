/** True when the conversation exists and belongs to the given user. */
export function canAccessConversation(
  conversation: { userId: string } | null | undefined,
  userId: string,
): boolean {
  return conversation != null && conversation.userId === userId;
}
