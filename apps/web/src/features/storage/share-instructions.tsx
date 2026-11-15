/**
 * Where Outpost cannot connect a share itself (in a container, on Linux), the same
 * details are turned into the exact text to use instead. These are instructions: the
 * person makes the change, and Outpost says so. It never asks for the password here.
 */
import {
  dockerShareInstructions,
  type InstructionStep,
  linuxShareInstructions,
  PASSWORD_PLACEHOLDER,
  parseShareServer,
  type ShareHostMode,
  type ShareInstructionHints,
  type ShareInstructionInput,
  shareInstructionProblem,
} from "@outpost/shared";
import { Info } from "lucide-react";
import { useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { CopyBlock, dialogColumn, phoneSheetFooter } from "./parts";

const plainText = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } as const;

function Steps({ steps }: { steps: InstructionStep[] }) {
  return (
    <ol className="divide-y divide-border border-y border-border">
      {steps.map((step, index) => (
        <li key={step.title} className="grid gap-2 py-4">
          <h3 className="text-small font-semibold text-ink">
            <span className="tabular text-ink-muted">{index + 1}.</span> {step.title}
          </h3>
          <p className="max-w-[70ch] text-small text-ink-muted">{step.body}</p>
          {step.code ? <CopyBlock label={step.codeLabel ?? "Text"} text={step.code} /> : null}
          {step.more ? <CopyBlock label={step.more.codeLabel} text={step.more.code} /> : null}
        </li>
      ))}
    </ol>
  );
}

export function ShareInstructions({ mode, hints, onClose }: { mode: ShareHostMode; hints: ShareInstructionHints; onClose: () => void }) {
  const [protocol, setProtocol] = useState<"smb" | "nfs">("smb");
  const [server, setServer] = useState("");
  const [share, setShare] = useState("");
  const [userName, setUserName] = useState("");
  const [exportPath, setExportPath] = useState("");

  const parsed = parseShareServer(server);
  const input: ShareInstructionInput | undefined = parsed
    ? { protocol, host: parsed.host, port: parsed.port, share: share.trim(), userName: userName.trim(), exportPath: exportPath.trim() }
    : undefined;
  const filled = Boolean(server.trim()) && (protocol === "smb" ? Boolean(share.trim() && userName.trim()) : Boolean(exportPath.trim()));
  const problem = !filled
    ? undefined
    : input
      ? shareInstructionProblem(input)
      : "Enter the server’s name or address, for example nas.local or 192.168.1.20.";
  const steps =
    filled && input && !problem
      ? mode === "docker"
        ? dockerShareInstructions(input, hints)
        : linuxShareInstructions(input, hints)
      : undefined;

  return (
    <>
      <DialogBody className={dialogColumn}>
        <Notice tone="info" icon={<Info />} title="Outpost cannot connect this share for you here">
          {mode === "docker"
            ? "It runs in a container, and Docker decides what a container can see. Enter the share’s details and Outpost writes out what to add to your Compose file. Nothing changes until you make those changes yourself."
            : "Connecting a share on Linux needs administrator rights, which Outpost does not have. Enter the share’s details and Outpost writes out what to add to the system. Nothing changes until you make those changes yourself."}
        </Notice>

        <Segmented
          label="Kind of share"
          value={protocol}
          onChange={setProtocol}
          options={[
            { value: "smb", label: "SMB" },
            { value: "nfs", label: "NFS" },
          ]}
          className="self-start max-md:[&_button]:h-11 max-md:[&_button]:px-4"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Server" hint="The NAS’s name or address, for example nas.local or 192.168.1.20.">
            {(ids) => (
              <Input
                {...ids}
                {...plainText}
                value={server}
                onChange={(event) => setServer(event.target.value)}
                inputMode="url"
                autoComplete="off"
              />
            )}
          </Field>
          {protocol === "smb" ? (
            <>
              <Field
                label="Share"
                hint="The shared folder’s name, typed as the NAS shows it, for example media. Outpost does not look up the NAS’s list of shares here: that needs the password, which this form never asks for."
              >
                {(ids) => (
                  <Input {...ids} {...plainText} value={share} onChange={(event) => setShare(event.target.value)} autoComplete="off" />
                )}
              </Field>
              <Field label="User name" hint="The password is not asked for: you put it in a file yourself, in the first step.">
                {(ids) => (
                  <Input
                    {...ids}
                    {...plainText}
                    value={userName}
                    onChange={(event) => setUserName(event.target.value)}
                    autoComplete="off"
                  />
                )}
              </Field>
            </>
          ) : (
            <Field label="Exported folder" hint="As the NAS shows it, for example /volume1/outpost.">
              {(ids) => (
                <Input
                  {...ids}
                  {...plainText}
                  value={exportPath}
                  onChange={(event) => setExportPath(event.target.value)}
                  autoComplete="off"
                />
              )}
            </Field>
          )}
        </div>

        {problem ? <Notice tone="warning">{problem}</Notice> : null}

        {steps ? (
          <section aria-label="What to do">
            <h2 className="mb-2 text-lead font-semibold text-ink">What to do</h2>
            <Steps steps={steps} />
            <p className="mt-3 max-w-[70ch] text-small text-ink-muted">
              {protocol === "smb" ? (
                <>
                  Replace <span className="font-mono text-[0.8125rem] text-ink">{PASSWORD_PLACEHOLDER}</span> with the real password where
                  it appears.{" "}
                </>
              ) : null}
              {mode === "docker"
                ? "These lines follow Docker’s own way of mounting a share as a volume. Outpost cannot run them or check the result from inside its container; if the share does not appear, the messages from docker compose up say why."
                : "These lines follow the usual Linux way of mounting a share at start-up. They were written for your details but have not been tried on your system; if the mount command reports an error, nothing in Outpost has changed."}
            </p>
          </section>
        ) : !problem ? (
          <p className="text-small text-ink-muted">The steps appear here once the details above are filled in.</p>
        ) : null}
      </DialogBody>
      <DialogFooter className={phoneSheetFooter}>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
