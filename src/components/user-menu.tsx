import Image from "next/image";
import { auth, signOut } from "@/lib/auth";

export async function UserMenu() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  return (
    <div className="flex items-center gap-2">
      {user.image && (
        <Image
          src={user.image}
          alt={user.name ?? ""}
          width={28}
          height={28}
          className="rounded-full"
        />
      )}
      <span className="hidden text-sm text-gray-600 sm:inline dark:text-gray-300">
        {user.name ?? user.email}
      </span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="rounded-md px-2 py-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
        >
          ログアウト
        </button>
      </form>
    </div>
  );
}
