import { Chat } from "@/components/chat";
import { UserMenu } from "@/components/user-menu";

export default function Home() {
  return <Chat userSlot={<UserMenu />} />;
}
