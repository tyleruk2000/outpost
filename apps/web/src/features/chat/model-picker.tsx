/**
 * Which model a conversation uses. The list is the model server's own; when the server
 * is Ollama it also says how large each model is, which is most of what decides
 * whether a small computer can run it.
 */
import { type ChatModel, type ChatModelsResponse, type ChatStatus, formatBytes } from "@outpost/shared";
import { Check, ChevronDown, Settings } from "lucide-react";
import { DropdownMenu as Primitive } from "radix-ui";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { floating, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { SETTINGS_MODEL } from "./chat-data";

/** "llama3.2" and "llama3.2:latest" are one model to Ollama. */
const sameModel = (a: string, b: string) => a === b || `${a}:latest` === b || a === `${b}:latest`;

/** What is known about a model that helps choose it: "2.0 GB, 3.2B parameters, Q4_K_M". */
export function modelFacts(model: ChatModel): string {
  return [
    model.sizeBytes ? formatBytes(model.sizeBytes) : null,
    model.parameters ? `${model.parameters} parameters` : null,
    model.quantization,
  ]
    .filter(Boolean)
    .join(", ");
}

/** True when the server's list was read and the model named is not in it. */
export function isMissing(model: string, list: ChatModelsResponse | undefined): boolean {
  return Boolean(model && list && !list.message && list.models.length > 0 && !list.models.some((entry) => sameModel(entry.id, model)));
}

export function ModelPicker({
  value,
  onChange,
  status,
  list,
  loading,
  open,
  onOpenChange,
  className,
}: {
  /** The conversation's own choice. Empty: the one chosen in Settings. */
  value: string;
  onChange(model: string): void;
  status: ChatStatus | undefined;
  list: ChatModelsResponse | undefined;
  loading: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const current = value || status?.defaultModel || "";
  const models = list?.models ?? [];
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={current ? `Model: ${current}. Choose another.` : "Choose a model"}
          className={cn("max-w-[min(16rem,46vw)] gap-1.5 px-2", !current && "text-ink", className)}
        >
          <span className={cn("truncate", current && "font-mono text-[0.8125rem] text-ink")}>{current || "Choose a model"}</span>
          <ChevronDown aria-hidden className="text-ink-muted" />
        </Button>
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            floating,
            "scroll-quiet max-h-(--radix-dropdown-menu-content-available-height) w-[min(22rem,calc(100vw-1rem))] overflow-y-auto",
          )}
        >
          <MenuLabel className="text-ink-muted">
            {status?.server ? `Models on ${status.place === "this-computer" ? "this computer" : status.server}` : "Models"}
          </MenuLabel>
          {loading && !list ? <p className="px-2.5 py-2 text-ink-muted">Asking the model server for its list…</p> : null}
          {list?.message ? <p className="px-2.5 py-2 text-ink">{list.message}</p> : null}
          {list && !list.message && models.length === 0 ? (
            <p className="px-2.5 py-2 text-ink">
              The model server is running but has no models. Fetch one with its own tool, for example{" "}
              <code className="font-mono text-[0.8125rem]">ollama pull llama3.2:3b</code>.
            </p>
          ) : null}
          <Primitive.RadioGroup value={models.find((entry) => sameModel(entry.id, current))?.id ?? ""} onValueChange={onChange}>
            {models.map((model) => {
              const facts = modelFacts(model);
              return (
                <Primitive.RadioItem
                  key={model.id}
                  value={model.id}
                  className="relative flex cursor-default items-start gap-2 rounded-[4px] py-1.5 pr-8 pl-2.5 outline-none select-none data-highlighted:bg-surface-strong max-md:py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block text-ink">
                      <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{model.id}</span>
                      {sameModel(model.id, status?.defaultModel ?? "") ? (
                        <span className="ml-2 text-micro text-ink-muted">default</span>
                      ) : null}
                    </span>
                    {facts ? <span className="tabular block text-micro text-ink-muted">{facts}</span> : null}
                  </span>
                  <Primitive.ItemIndicator className="absolute top-2 right-2.5">
                    <Check aria-hidden className="size-4 text-primary" />
                  </Primitive.ItemIndicator>
                </Primitive.RadioItem>
              );
            })}
          </Primitive.RadioGroup>
          {isMissing(current, list) ? (
            <p className="px-2.5 py-2 text-small text-ink">
              <span className="font-mono text-[0.8125rem]">{current}</span> is not among them. Choose one that is.
            </p>
          ) : null}
          <MenuSeparator />
          <MenuItem asChild>
            <Link to={SETTINGS_MODEL}>
              <Settings aria-hidden /> Model server settings
            </Link>
          </MenuItem>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
