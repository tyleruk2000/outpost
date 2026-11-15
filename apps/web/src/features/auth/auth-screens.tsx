import type { SessionInfo } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Contour } from "@/components/contour";
import { LogoMark } from "@/components/logo";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";

function Frame({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-spine px-4 py-10 text-spine-ink">
      <Contour seed={21} columns={96} rows={60} levels={11} className="absolute inset-0 -z-10 size-full text-spine-ink-muted opacity-25" />
      <main className="w-full max-w-[26rem]">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="size-8" />
          <span className="font-title text-heading">Outpost</span>
        </div>
        <div className="rounded-panel bg-page p-6 text-ink shadow-dialog sm:p-8">
          <h1 className="font-title text-heading">{title}</h1>
          <p className="mt-1.5 text-small text-ink-muted">{lead}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-5 text-small text-spine-ink-muted">Knowledge beyond the network. Everything here is served from this device.</p>
      </main>
    </div>
  );
}

export function SignIn({ session }: { session: SessionInfo }) {
  const client = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const setup = session.setupRequired;

  const submit = useMutation({
    mutationFn: () =>
      setup
        ? api.post("/api/auth/setup", { username: username.trim(), password, setupToken: setupToken.trim() || undefined })
        : api.post("/api/auth/login", { username: username.trim(), password }),
    onSuccess: () => client.invalidateQueries(),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit.mutate();
  };

  return (
    <Frame
      title={setup ? "Create the administrator account" : "Sign in"}
      lead={
        setup
          ? "This account can change storage, downloads and settings. It exists only on this device; there is no cloud account."
          : "This Outpost asks for a sign-in because it is reachable from other devices."
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field label="Username">
          {(ids) => (
            <Input
              {...ids}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              required
            />
          )}
        </Field>
        <Field label="Password" hint={setup ? "At least 10 characters. A few unrelated words work well." : undefined}>
          {(ids) => (
            <Input
              {...ids}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={setup ? "new-password" : "current-password"}
              minLength={setup ? 10 : undefined}
              required
            />
          )}
        </Field>
        {setup && session.setupTokenRequired ? (
          <Field label="Setup token" hint="Printed in the server log when Outpost started. It proves you are the person who installed it.">
            {(ids) => (
              <Input
                {...ids}
                value={setupToken}
                onChange={(event) => setSetupToken(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                required
              />
            )}
          </Field>
        ) : null}
        {submit.isError ? <Notice tone="danger">{errorMessage(submit.error)}</Notice> : null}
        <Button type="submit" variant="primary" size="lg" loading={submit.isPending} className="mt-1">
          {setup ? "Create account" : "Sign in"}
        </Button>
      </form>
    </Frame>
  );
}

export function ServerDown({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame title="The server is not responding" lead="The Outpost app loaded, but it cannot reach its server on this device.">
      <p className="text-small text-ink-muted">
        If you just started or restarted Outpost, give it a few seconds. Otherwise check that the Outpost service or container is running.
      </p>
      <Button variant="primary" className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </Frame>
  );
}
