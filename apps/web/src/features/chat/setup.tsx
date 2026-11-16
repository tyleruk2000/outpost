/**
 * Chat before a model server has been set up: what a local model is, what to install,
 * and the two ways on from here. "Look for Ollama on this computer" asks the address
 * Ollama listens on, once, when the button is pressed; nothing looks before that.
 */
import type { ChatLookResult, ChatStatus } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Radar } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { EmptyState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useUpdateSettings } from "@/lib/queries";
import { chatApi, chatKeys, SETTINGS_MODEL } from "./chat-data";
import { modelFacts } from "./model-picker";

export function ChatSetup({ status }: { status: ChatStatus }) {
  const client = useQueryClient();
  const save = useUpdateSettings();
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<ChatLookResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [model, setModel] = useState<string | undefined>(undefined);

  const look = async () => {
    setLooking(true);
    setFailed(null);
    try {
      const result = await chatApi.lookForOllama();
      setFound(result);
      setModel(result.models[0]?.id);
    } catch (error) {
      setFailed(errorMessage(error));
    } finally {
      setLooking(false);
    }
  };

  const use = () => {
    if (!found?.address) return;
    save.mutate(
      { "answers.enabled": true, "answers.endpoint": found.address, "answers.model": model ?? "" },
      { onSuccess: () => void client.invalidateQueries({ queryKey: chatKeys.all }) },
    );
  };

  // Switched on, but the address is one Outpost will not use: the reason is the whole of the next step.
  const refused = status.enabled && status.reason;

  return (
    <EmptyState
      seed={11}
      title="Chat needs a language model on your own computer"
      action={
        <>
          <Button variant="primary" loading={looking} onClick={() => void look()}>
            {looking ? null : <Radar aria-hidden />} Look for Ollama on this computer
          </Button>
          <Button asChild>
            <Link to={SETTINGS_MODEL}>Open the setting</Link>
          </Button>
        </>
      }
    >
      <p>
        A language model is a program that writes text. Outpost does not include one: a model is a download of a gigabyte or more, and which
        to run is your choice. Nothing you write here leaves your own network.
      </p>
      <p className="mt-3">
        The usual way is Ollama, a free program from <span className="font-mono text-[0.875rem] text-ink">ollama.com</span>. Install it,
        fetch a model with{" "}
        <code className="rounded-[3px] bg-surface-strong px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink">ollama pull llama3.2:3b</code>{" "}
        (2.0 GB), then come back here.
      </p>
      {refused ? (
        <Notice tone="warning" className="mt-4" title="The address in Settings cannot be used">
          {status.reason}
        </Notice>
      ) : null}
      {failed ? (
        <Notice tone="danger" className="mt-4">
          {failed}
        </Notice>
      ) : null}
      {found && !found.found ? (
        <Notice tone="info" className="mt-4" title="Ollama was not found">
          {found.message}
        </Notice>
      ) : null}
      {found?.found ? (
        <Notice tone="success" icon={<CircleCheck aria-hidden />} className="mt-4" title="Found a model server">
          <p>{found.message}</p>
          {found.models.length > 0 ? (
            <div className="mt-3 grid max-w-sm gap-3">
              <Select
                aria-label="Model to use"
                value={model}
                onChange={setModel}
                options={found.models.map((entry) => ({
                  value: entry.id,
                  label: <span className="font-mono text-[0.8125rem]">{entry.id}</span>,
                  description: modelFacts(entry) || undefined,
                }))}
              />
              <Button variant="primary" className="justify-self-start" loading={save.isPending} onClick={use}>
                Use it for Outpost
              </Button>
            </div>
          ) : null}
        </Notice>
      ) : null}
    </EmptyState>
  );
}
