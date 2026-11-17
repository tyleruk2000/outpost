/**
 * Letting a model look things up in Outpost: the switch for Chat, which parts of the
 * household's data the tools may read, the models not to offer them to, and, changed only
 * at the computer Outpost runs on, whether other programs on the home network may use
 * them over the Model Context Protocol (`/mcp`, docs/mcp.md).
 *
 * The ordinary switches are settings (`PATCH /api/settings`, as the rest of Settings);
 * the `/mcp` switch is not, because it changes who can read what (`PUT /api/tools/mcp`).
 */
import { type ChatModelsResponse, type Settings, TOOL_AREAS, type ToolArea } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Plus, X } from "lucide-react";
import { useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton, Switch } from "@/components/ui/misc";
import { chatKeys } from "@/features/chat/chat-data";
import { api, errorMessage } from "@/lib/api";
import { MoreOptions, SettingRow, SettingsSection } from "./parts";
import { useSetMcp, useToolsStatus } from "./tools-data";

const mono = "font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]";
const code = "rounded-[4px] bg-surface-strong px-1 py-px font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]";
const block = "overflow-x-auto rounded-control bg-surface px-3 py-2 font-mono text-[0.8125rem] leading-relaxed text-ink";

/** The settings key of an area's switch. */
const areaKey = (area: ToolArea) => `tools.${area}` as const satisfies keyof Settings;

export function ToolsSection({
  settings,
  disabled,
  save,
}: {
  settings: Settings;
  disabled: boolean;
  save: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const status = useToolsStatus();
  const data = status.data;
  const enabled = settings["tools.enabled"];

  return (
    <SettingsSection
      id="tools"
      title="Looking things up in Outpost"
      description="A model can ask Outpost for what a passage would not hold: the places on your map, the supplies you hold, the weather as last fetched. The tools only read; they never change anything. Optional."
    >
      {status.isPending ? (
        <div className="grid gap-2" aria-busy>
          <Skeleton className="w-64" />
          <Skeleton className="w-40" />
        </div>
      ) : status.isError || !data ? (
        <Notice tone="danger" icon={<CircleAlert aria-hidden />} title="The state of the tools could not be read">
          {errorMessage(status.error)}
        </Notice>
      ) : (
        <>
          <SettingRow
            htmlFor="tools-switch"
            label="Let the model look things up in Outpost"
            hint="In Chat, a model that can use tools may ask Outpost questions while it writes its answer, and the reply says what it looked at. What the tools return is sent to the model server, as passages are: if that server is on another machine, so is what the tools return."
            control={
              <Switch
                id="tools-switch"
                checked={enabled}
                disabled={disabled}
                onCheckedChange={(value) => save("tools.enabled", value)}
                aria-label="Let the model look things up in Outpost"
              />
            }
          />

          <div>
            <h3 className="text-small font-medium text-ink">What the tools may read</h3>
            <p className="mt-0.5 text-small text-ink-muted">
              For Chat and for other programs alike. Turning one on lets the model server see:
            </p>
            <ul className="mt-2 divide-y divide-border border-y border-border" aria-label="What the tools may read">
              {TOOL_AREAS.map(({ area, label, about }) => (
                <li key={area} className="flex items-start justify-between gap-x-6 py-3">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`tools-area-${area}`} className="text-small font-medium text-ink">
                      {label}
                    </label>
                    <p className="mt-0.5 text-small text-ink-muted">{about}</p>
                  </div>
                  <Switch
                    id={`tools-area-${area}`}
                    className="mt-0.5"
                    checked={settings[areaKey(area)]}
                    disabled={disabled}
                    onCheckedChange={(value) => save(areaKey(area), value)}
                    aria-label={label}
                  />
                </li>
              ))}
              <li className="flex items-start justify-between gap-x-6 py-3" data-testid="tools-never">
                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium text-ink">Notes' encrypted pages</p>
                  <p className="mt-0.5 text-small text-ink-muted">They have no text in the index, so no tool can read them.</p>
                </div>
                <span className="text-small font-medium text-ink">Never</span>
              </li>
            </ul>
          </div>

          <OffForModels settings={settings} disabled={disabled} save={save} />

          <OtherPrograms mcp={data.mcp} />
        </>
      )}
    </SettingsSection>
  );
}

/** "Models not to offer tools to": names, added and removed one at a time. */
function OffForModels({
  settings,
  disabled,
  save,
}: {
  settings: Settings;
  disabled: boolean;
  save: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const names = settings["tools.offForModels"];
  const [draft, setDraft] = useState("");
  // The model server's own list, to choose from, when answers are set up; a name can always be typed.
  const models = useQuery({
    queryKey: [...chatKeys.models, settings["answers.endpoint"]],
    queryFn: () => api.get<ChatModelsResponse>("/api/chat/models"),
    enabled: settings["answers.enabled"],
    staleTime: 60_000,
    retry: false,
  });
  const choices = (models.data?.models ?? []).filter((model) => model.writes && !names.includes(model.id));
  const typed = draft.trim();
  const add = () => {
    if (typed === "" || names.includes(typed)) return setDraft("");
    save("tools.offForModels", [...names, typed]);
    setDraft("");
  };

  return (
    <div>
      <h3 className="text-small font-medium text-ink">
        <label htmlFor="tools-off-model">Models not to offer tools to</label>
      </h3>
      <p className="mt-0.5 text-small text-ink-muted">
        For a model that says it can use tools but uses them badly. Chat does not offer them to the models named here.
      </p>
      {names.length > 0 ? (
        <ul className="mt-2 divide-y divide-border border-y border-border" aria-label="Models not to offer tools to">
          {names.map((name) => (
            <li key={name} className="flex min-h-11 items-center justify-between gap-4 py-1">
              <span className={`min-w-0 ${mono}`}>{name}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  save(
                    "tools.offForModels",
                    names.filter((entry) => entry !== name),
                  )
                }
                aria-label={`Offer tools to ${name} again`}
              >
                <X aria-hidden /> Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-small text-ink-muted">None: every model that can use tools is offered them.</p>
      )}
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          id="tools-off-model"
          value={draft}
          disabled={disabled || names.length >= 50}
          placeholder={choices[0]?.id ?? "Model name, for example llama3.2:3b"}
          spellCheck={false}
          maxLength={200}
          list={choices.length > 0 ? "tools-off-model-choices" : undefined}
          onChange={(event) => setDraft(event.target.value)}
          className="w-72 max-w-full font-mono text-small"
        />
        {choices.length > 0 ? (
          <datalist id="tools-off-model-choices">
            {choices.map((model) => (
              <option key={model.id} value={model.id} />
            ))}
          </datalist>
        ) : null}
        <Button type="submit" size="sm" disabled={disabled || typed === ""}>
          <Plus aria-hidden /> Add
        </Button>
      </form>
    </div>
  );
}

/** The `/mcp` switch, the addresses to give a program, and how two programs are set up, from their own pages. */
function OtherPrograms({ mcp }: { mcp: { enabled: boolean; canChange: boolean; addresses: string[] } }) {
  const setMcp = useSetMcp();
  const example = mcp.addresses.find((address) => !address.includes("//127.")) ?? mcp.addresses[0] ?? "http://127.0.0.1:8080/mcp";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-border pt-5">
      <SettingRow
        htmlFor="tools-mcp-switch"
        label="Let other programs on the home network use these tools"
        hint={
          <>
            With this on, any program on your home network that speaks MCP (the Model Context Protocol) can ask Outpost these questions, and
            whatever that program is connected to receives the answers: a desktop assistant using a model in the cloud would send your
            household's supplies and plans there.
            {mcp.canChange ? null : (
              <span className="mt-1.5 block font-medium text-ink">This can only be changed at the computer Outpost runs on.</span>
            )}
          </>
        }
        control={
          <Switch
            id="tools-mcp-switch"
            checked={setMcp.isPending ? Boolean(setMcp.variables) : mcp.enabled}
            disabled={!mcp.canChange || setMcp.isPending}
            onCheckedChange={(value) => setMcp.mutate(value)}
            aria-label="Let other programs on the home network use these tools"
          />
        }
      />
      {setMcp.isError ? (
        <Notice tone="danger" icon={<CircleAlert aria-hidden />} title="The switch could not be changed">
          {errorMessage(setMcp.error)}
        </Notice>
      ) : null}

      <div>
        <h3 className="text-small font-medium text-ink">{mcp.enabled ? "The address to give a program" : "The address it would have"}</h3>
        <ul className="mt-2 divide-y divide-border border-y border-border" aria-label="Addresses for other programs">
          {mcp.addresses.map((address) => (
            <li key={address} className="flex min-h-11 items-center py-1.5">
              <span className={mono}>{address}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-small text-ink-muted">
          The first is for a program on this computer; the others, if any, for programs on other computers at home. There is no password:
          what decides is whether a program can reach this address.
        </p>
      </div>

      <MoreOptions label="How to connect Claude Code or VS Code">
        <div className="grid gap-2 text-small text-ink-muted">
          <h4 className="font-medium text-ink">Claude Code</h4>
          <p>In a terminal, on the computer the program runs on:</p>
          <pre className={block}>claude mcp add --transport http outpost {example}</pre>
          <p>
            That keeps it for you in the current project, in <span className={code}>~/.claude.json</span>. Add{" "}
            <span className={code}>--scope project</span> to keep it in <span className={code}>.mcp.json</span> at the project's root,
            shared with the project, or <span className={code}>--scope user</span> for all your projects. Written by hand in{" "}
            <span className={code}>.mcp.json</span>:
          </p>
          <pre className={block}>{JSON.stringify({ mcpServers: { outpost: { type: "http", url: example } } }, null, 2)}</pre>
          <p>Claude Code's page says an entry with a url but no type is a configuration error.</p>
        </div>
        <div className="grid gap-2 text-small text-ink-muted">
          <h4 className="font-medium text-ink">VS Code</h4>
          <p>
            In <span className={code}>.vscode/mcp.json</span> in a workspace, or the <span className={code}>mcp.json</span> of your user
            profile:
          </p>
          <pre className={block}>{JSON.stringify({ servers: { outpost: { type: "http", url: example } } }, null, 2)}</pre>
          <p>
            Or run <span className="font-medium text-ink">Chat: Open Customizations</span>, choose{" "}
            <span className="font-medium text-ink">MCP Servers</span>, then <span className="font-medium text-ink">Add Server</span>, and
            give the address. VS Code's page says those two files are deprecated for new Copilot setups, which use{" "}
            <span className={code}>~/.copilot/mcp-config.json</span> instead.
          </p>
        </div>
        <p className="text-small text-ink-muted">
          Written from each program's own documentation as read on 17 November 2026 (code.claude.com/docs/en/mcp and
          code.visualstudio.com/docs/agents/reference/mcp-configuration). Neither has been tried against Outpost.
        </p>
      </MoreOptions>
    </div>
  );
}
