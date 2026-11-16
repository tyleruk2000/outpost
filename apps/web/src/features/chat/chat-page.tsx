/** The chat routes: `/chat` (start one, or pick one) and `/chat/:id` (a conversation). */
import { useParams } from "react-router";
import { ChatHome } from "./chat-home";
import { ConversationScreen } from "./conversation-screen";

export default function ChatPage() {
  const { id } = useParams();
  return id ? <ConversationScreen key={id} id={id} /> : <ChatHome />;
}
