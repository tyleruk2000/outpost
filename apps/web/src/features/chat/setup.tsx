/**
 * Chat before a model server has been set up: what Chat is for, what it needs (a writing
 * model, which Outpost does not include), where that is installed, and the same three
 * steps Settings offers (features/setup/model-setup.tsx): find Ollama, choose a model,
 * try it. Nothing is asked of any model server until a button is pressed, and when the
 * last step passes the server switches chat on by itself.
 */
import { type ChatStatus, SETUP_GUIDE_PATH } from "@outpost/shared";
import { Link } from "react-router";
import { EmptyState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { writingModelWords } from "@/features/setup/answers-offer";
import { ModelSetup } from "@/features/setup/model-setup";
import { SETTINGS_MODEL } from "./chat-data";

export function ChatSetup({ status }: { status: ChatStatus }) {
  // Switched on, but the address is one Outpost will not use: the reason is the whole of the next step.
  const refused = status.enabled && status.reason;

  return (
    <EmptyState
      seed={11}
      title="Chat needs a writing model"
      action={
        <>
          <Button asChild>
            <Link to={`${SETUP_GUIDE_PATH}#answers-and-chat`}>Set-up guide</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to={SETTINGS_MODEL}>Open the setting</Link>
          </Button>
        </>
      }
    >
      <p>
        Chat is a conversation in your own words: ask anything, ask again, and have it look things up in your library, quoting what it used.{" "}
        {writingModelWords()} That is a download of about 2 GB that needs the internet; after that nothing you write here leaves your own
        network.
      </p>
      <p className="mt-2">Until then, Search finds things in your library by their words, and by meaning when that is on.</p>
      {refused ? (
        <Notice tone="warning" className="mt-4" title="The address in Settings cannot be used">
          {status.reason}
        </Notice>
      ) : null}
      <ModelSetup className="mt-5" />
    </EmptyState>
  );
}
