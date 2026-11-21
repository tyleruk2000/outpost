/**
 * Settings → Mesh radio → "Use the household's broker": finding a broker that is already
 * running, testing a sign-in step by step, and Mosquitto's dynamic security. Each button
 * asks the server to connect out once, when pressed; nothing is asked by itself.
 */
import type { MeshBrokerFound, MeshBrokerTestInput, MeshDynsecResult } from "@outpost/shared";
import { CircleAlert, CircleCheck, CircleMinus, Search, UserPlus, Wifi } from "lucide-react";
import { useId, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { suggestPassword, useAddRadioAccount, useDynsec, useFindBrokers, useTestBroker } from "./data";

const mono = "font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]";

const WHERE: Record<MeshBrokerFound["where"], string> = {
  "this-computer": "this computer",
  "container-host": "the computer Outpost's container runs on",
  named: "the address typed",
};

/** "Find a broker": what answers on this computer (and the container's computer), and at the address typed. */
export function FindBroker({
  host,
  port,
  disabled,
  onUse,
}: {
  host: string;
  port: number | null;
  disabled: boolean;
  onUse: (found: MeshBrokerFound) => void;
}) {
  const find = useFindBrokers();
  const found = find.data?.found ?? [];
  const brokers = found.filter((entry) => ["needs-login", "open-to-anyone", "outpost"].includes(entry.answer));
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          size="sm"
          disabled={disabled}
          loading={find.isPending}
          onClick={() => find.mutate(host.trim() ? { host: host.trim(), ...(port ? { port } : {}) } : {})}
        >
          <Search aria-hidden /> Find a broker
        </Button>
        <p className="min-w-0 flex-1 text-small text-ink-muted">
          Looks on this computer at ports 1883 and 8883{host.trim() ? `, and at ${host.trim()}` : ""}. Signs in to nothing.
        </p>
      </div>
      {find.isError ? (
        <p role="alert" className="text-small text-danger">
          {errorMessage(find.error)}
        </p>
      ) : null}
      {find.data ? (
        <div role="status" className="grid gap-1.5 text-small">
          {brokers.length === 0 ? <p className="text-ink">No broker found where Outpost looked.</p> : null}
          <ul aria-label="Where Outpost looked" className="divide-y divide-border border-y border-border">
            {found.map((entry) => (
              <li key={`${entry.host}:${entry.port}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                <div className="min-w-0 flex-1">
                  <p>
                    <span className={mono}>
                      {entry.host}:{entry.port}
                    </span>
                    <span className="text-ink-muted">
                      {" "}
                      on {WHERE[entry.where]}
                      {entry.tls ? ", TLS" : ""}
                    </span>
                  </p>
                  <p className={cn(entry.answer === "open-to-anyone" ? "text-warning" : "text-ink-muted")}>
                    {entry.words}
                    {entry.certificate && !entry.certificate.trusted && entry.certificate.problem ? ` ${entry.certificate.problem}` : ""}
                  </p>
                </div>
                {entry.answer === "needs-login" || entry.answer === "open-to-anyone" ? (
                  <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onUse(entry)}>
                    Use this one
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {find.data.inContainer ? (
            <p className="text-ink-muted">
              Outpost runs in a container, where 127.0.0.1 is the container itself. A Mosquitto published on the computer answers at{" "}
              {find.data.containerHost ? <span className={mono}>{find.data.containerHost}</span> : "that computer's address"}, or at its
              address on the home network.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const STEP_ICON = {
  true: <CircleCheck aria-hidden className="size-4 shrink-0 translate-y-0.5 text-success" />,
  false: <CircleAlert aria-hidden className="size-4 shrink-0 translate-y-0.5 text-danger" />,
  null: <CircleMinus aria-hidden className="size-4 shrink-0 translate-y-0.5 text-ink-muted" />,
};
const STEP_LABEL = { true: "Done", false: "Failed", null: "Nothing yet" };

/** "Test": sign in, subscribe, a check message, listen; each step in words. */
export function TestBroker({ input, disabled }: { input: MeshBrokerTestInput | null; disabled: boolean }) {
  const test = useTestBroker();
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button size="sm" disabled={disabled || input === null} loading={test.isPending} onClick={() => input && test.mutate(input)}>
          <Wifi aria-hidden /> Test
        </Button>
        <p className="min-w-0 flex-1 text-small text-ink-muted">
          {test.isPending
            ? "Signing in, then listening for a radio for up to 8 seconds…"
            : "Signs in as typed here (the saved password if none is typed), sends one check message under the root topic, and listens for a radio. Nothing is saved."}
        </p>
      </div>
      {test.isError ? (
        <p role="alert" className="text-small text-danger">
          {errorMessage(test.error)}
        </p>
      ) : null}
      {test.data ? (
        <div role="status">
          <ol aria-label="What the test found" className="grid gap-1.5 text-small">
            {test.data.steps.map((step) => (
              <li key={step.step} className="flex items-start gap-2">
                {STEP_ICON[String(step.ok) as "true"]}
                <span className="sr-only">{STEP_LABEL[String(step.ok) as "true"]}: </span>
                <span className={cn("min-w-0 [overflow-wrap:anywhere]", step.ok === false ? "text-danger" : "text-ink")}>{step.words}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/** Mosquitto's dynamic security: whether Outpost's account may manage it, and an account for a radio. */
export function DynamicSecurity({ saved, disabled, rootTopic }: { saved: boolean; disabled: boolean; rootTopic: string }) {
  const check = useDynsec();
  const add = useAddRadioAccount();
  const [userName, setUserName] = useState("radio-1");
  const [password, setPassword] = useState("");
  const headingId = useId();
  const result: MeshDynsecResult | undefined = add.data ?? check.data;
  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <h4 id={headingId} className="text-small font-medium text-ink">
        Accounts on the household's broker
      </h4>
      <p className="text-small text-ink-muted">
        With Mosquitto's dynamic security plugin on, and Outpost's account given its admin role, Outpost can add an account for each radio
        here, allowed only the radio's topics ({rootTopic}/#), with no file edited. Otherwise the guide below has the lines to add yourself.
      </p>
      <div>
        <Button size="sm" variant="secondary" disabled={disabled || !saved} loading={check.isPending} onClick={() => check.mutate()}>
          Check dynamic security
        </Button>
        {!saved ? <p className="mt-1 text-small text-ink-muted">Save the household broker first: this uses the saved set-up.</p> : null}
      </div>
      {check.isError || add.isError ? (
        <p role="alert" className="text-small text-danger">
          {errorMessage(check.error ?? add.error)}
        </p>
      ) : null}
      {result ? (
        <p role="status" className={cn("text-small", result.state === "failed" ? "text-danger" : "text-ink")}>
          {result.words}
        </p>
      ) : null}
      {check.data?.state === "on" ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate({ userName: userName.trim(), password });
          }}
        >
          <Field label="The radio's user name">
            {(ids) => (
              <Input
                {...ids}
                value={userName}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setUserName(event.target.value)}
              />
            )}
          </Field>
          <Field label="The radio's password" hint="Shown, to type into the radio's app. Not kept by Outpost.">
            {(ids) => (
              <div className="flex flex-wrap gap-2">
                <Input
                  {...ids}
                  value={password}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-[10rem] flex-1 font-mono text-small"
                  onChange={(event) => setPassword(event.target.value)}
                />
                <Button onClick={() => setPassword(suggestPassword())}>Suggest one</Button>
              </div>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={disabled || password.length < 12 || !userName.trim()} loading={add.isPending}>
              <UserPlus aria-hidden /> Add the account
            </Button>
            {password.length > 0 && password.length < 12 ? <p className="mt-1 text-small text-ink-muted">At least 12 characters.</p> : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}

/** Outpost's own broker could not listen: the port is taken. A free port, or the broker already there. */
export function PortInUse({
  port,
  freePort,
  onFreePort,
  onUseExisting,
  disabled,
}: {
  port: number;
  freePort: number | null;
  onFreePort: (port: number) => void;
  onUseExisting: () => void;
  disabled: boolean;
}) {
  return (
    <Notice tone="danger" icon={<CircleAlert aria-hidden />} title={`Port ${port} is already in use on this computer`}>
      <p>
        Another program has it, so Outpost's broker cannot listen there. If it is an MQTT broker you already run (a Mosquitto, say), use it:
        Outpost then needs no port of its own.{freePort ? ` Otherwise port ${freePort} is free now.` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" disabled={disabled} onClick={onUseExisting}>
          Use the broker on port {port}
        </Button>
        {freePort ? (
          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onFreePort(freePort)}>
            Use port {freePort} instead
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-ink-muted">Either fills in the form below; nothing changes until you save.</p>
    </Notice>
  );
}
