import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Polaris</h1>
        <p className="mt-2 text-sm text-gray-500">社内向けAIエージェント</p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
        >
          Googleでログイン
        </button>
      </form>
    </main>
  );
}
