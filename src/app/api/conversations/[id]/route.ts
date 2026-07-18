import { auth } from "@/lib/auth";
import { deleteConversation } from "@/lib/db/queries";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteConversation(id, session.user.id);
  if (!deleted) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
