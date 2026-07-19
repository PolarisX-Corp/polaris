import { getConversationActivity } from "@/lib/activity";
import { auth } from "@/lib/auth";
import { canAccessConversation } from "@/lib/db/access";
import { getConversation } from "@/lib/db/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversation(id);
  if (!canAccessConversation(conversation, session.user.id)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const records = await getConversationActivity(id);
  return Response.json({ records });
}
