/**
 * Choosing who is learning. In the reader's bar it sets the learner of this device (a
 * shared tablet: one press opens it, a second picks the other child); in the Library's
 * Learning view it chooses whose progress to show, "Everyone" included.
 */
import { JUST_ME, learnerLabel, learnerName } from "@outpost/shared";
import { ChevronDown, CircleSlash, UserRound, UsersRound } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useLearners } from "./data";
import { setRecording, useLearningDevice } from "./device";

/** The names to offer: those with progress, then the household's people, then whoever is chosen now. */
export function useLearnerNames(chosen: string | null): string[] {
  const learners = useLearners();
  return useMemo(() => {
    const names = new Set<string>();
    for (const learner of learners.data?.learners ?? []) if (learner.name) names.add(learner.name);
    for (const name of learners.data?.household ?? []) names.add(name);
    if (chosen) names.add(chosen);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [learners.data, chosen]);
}

function SomeoneElse({
  open,
  onOpenChange,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const tidy = learnerName(name);
    if (!tidy) return;
    onChoose(tidy);
    setName("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Who is learning?"
        size="sm"
        description="A first name is enough. It is remembered on this device. There is no password: anyone in the house can choose any name and see everyone's progress."
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            <Field label="Name">
              {(ids) => (
                <Input
                  {...ids}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={40}
                  autoComplete="off"
                  autoFocus
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!learnerName(name)}>
              Use this name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The learner of this device, in the reader's bar. It says when recording is off, and
 * when no one has been chosen yet (nothing is recorded until someone is).
 */
export function DeviceLearnerSwitch({ onChoose, className }: { onChoose: (name: string) => void; className?: string }) {
  const device = useLearningDevice();
  const names = useLearnerNames(device.learner);
  const [asking, setAsking] = useState(false);
  const label = !device.recording ? "Not recording" : device.learner === null ? "Who is learning?" : learnerLabel(device.learner);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn("max-w-[11rem] gap-1.5 px-2", !device.recording && "text-ink-muted", className)}
            aria-label={
              !device.recording
                ? "Progress is not being recorded on this device. Change"
                : device.learner === null
                  ? "Choose who is learning"
                  : `Learning: ${learnerLabel(device.learner)}. Switch learner`
            }
          >
            {device.recording ? <UserRound aria-hidden /> : <CircleSlash aria-hidden />}
            <span className="truncate">{label}</span>
            <ChevronDown aria-hidden className="text-ink-faint" />
          </Button>
        </MenuTrigger>
        <MenuContent className="max-w-[min(20rem,calc(100vw-1rem))]">
          <MenuLabel>Who is learning on this device</MenuLabel>
          {names.map((name) => (
            <MenuCheckItem key={name} checked={device.recording && device.learner === name} onSelect={() => onChoose(name)}>
              {name}
            </MenuCheckItem>
          ))}
          <MenuCheckItem checked={device.recording && device.learner === ""} onSelect={() => onChoose("")}>
            {JUST_ME}
          </MenuCheckItem>
          <MenuItem onSelect={() => setAsking(true)}>
            <UserRound aria-hidden /> Someone else…
          </MenuItem>
          <MenuSeparator />
          {device.recording ? (
            <MenuItem onSelect={() => setRecording(false)}>
              <CircleSlash aria-hidden /> Stop recording on this device
            </MenuItem>
          ) : (
            <MenuItem onSelect={() => setRecording(true)}>
              <UserRound aria-hidden /> Record progress on this device
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
      <SomeoneElse open={asking} onOpenChange={setAsking} onChoose={onChoose} />
    </>
  );
}

/** Whose progress the Learning view shows. `null` is everyone. */
export function WhoseSwitch({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const names = useLearnerNames(value);
  const learners = useLearners();
  const unnamed = (learners.data?.learners ?? []).some((learner) => learner.name === "") || value === "";
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button className="gap-1.5" aria-label={`Showing ${value === null ? "everyone" : learnerLabel(value)}. Change`}>
          {value === null ? <UsersRound aria-hidden /> : <UserRound aria-hidden />}
          <span className="truncate">{value === null ? "Everyone" : learnerLabel(value)}</span>
          <ChevronDown aria-hidden className="text-ink-faint" />
        </Button>
      </MenuTrigger>
      <MenuContent align="start" className="max-w-[min(20rem,calc(100vw-1rem))]">
        <MenuLabel>Whose progress</MenuLabel>
        {names.map((name) => (
          <MenuCheckItem key={name} checked={value === name} onSelect={() => onChange(name)}>
            {name}
          </MenuCheckItem>
        ))}
        {unnamed ? (
          <MenuCheckItem checked={value === ""} onSelect={() => onChange("")}>
            {JUST_ME}
          </MenuCheckItem>
        ) : null}
        <MenuSeparator />
        <MenuCheckItem checked={value === null} onSelect={() => onChange(null)}>
          Everyone
        </MenuCheckItem>
      </MenuContent>
    </Menu>
  );
}
