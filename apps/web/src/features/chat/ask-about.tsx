/**
 * "Ask about this": the way from a document or a page of notes into a conversation
 * about that one item. It leads to the Chat screen with the item named above the
 * message box; nothing is sent, and no conversation exists, until a message is.
 *
 * Offered only once a model server has been set up, like "Answer from my library":
 * a person who runs no model is not shown a way into something they do not have.
 */
import { MessageSquareText } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { MenuItem } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/misc";
import { useChatStatus } from "./chat-data";

interface About {
  kind: "document" | "note";
  id: string;
  title: string;
}

const to = ({ kind, id }: About) => ({ pathname: "/chat", search: `?about=${kind}:${encodeURIComponent(id)}` });
const words = (kind: About["kind"]) => (kind === "note" ? "Ask about this page" : "Ask about this document");

/** An icon button for a toolbar. */
export function AskAboutButton(about: About) {
  const status = useChatStatus().data;
  if (!status?.usable) return null;
  return (
    <Tooltip label={words(about.kind)}>
      <Button asChild variant="ghost" size="icon-sm">
        <Link to={to(about)} state={{ title: about.title }} aria-label={words(about.kind)}>
          <MessageSquareText />
        </Link>
      </Button>
    </Tooltip>
  );
}

/** An item for a menu of actions. */
export function AskAboutMenuItem(about: About) {
  const status = useChatStatus().data;
  if (!status?.usable) return null;
  return (
    <MenuItem asChild>
      <Link to={to(about)} state={{ title: about.title }}>
        <MessageSquareText /> {words(about.kind)}
      </Link>
    </MenuItem>
  );
}
