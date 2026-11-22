/**
 * The dialogs that ask for the household PIN: to unlock this device, to set or change the
 * PIN, and to remove it. A wrong PIN, or too many of them, is said beside the field.
 */
import { PIN_MAX_DIGITS, PIN_MIN_DIGITS, PIN_PATTERN } from "@outpost/shared";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { DEVICE } from "../kept/device";
import { useRemovePin, useSetPin, useUnlock } from "./data";

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, PIN_MAX_DIGITS);

function PinInput({
  value,
  onChange,
  autoFocus,
  ids,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  ids: object;
}) {
  return (
    <Input
      {...ids}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      pattern="[0-9]*"
      maxLength={PIN_MAX_DIGITS}
      value={value}
      autoFocus={autoFocus}
      onChange={(event) => onChange(digitsOnly(event.target.value))}
      className="tabular max-w-[12rem]"
    />
  );
}

function PinForm({
  title,
  description,
  submitLabel,
  pending,
  onSubmit,
  error,
  disabled,
  children,
}: {
  title: string;
  description: ReactNode;
  submitLabel: string;
  pending: boolean;
  onSubmit: () => void;
  error: string | null;
  disabled: boolean;
  children: ReactNode;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!disabled) onSubmit();
  };
  return (
    <DialogContent title={title} description={description} size="sm">
      <form onSubmit={submit} className="contents">
        <DialogBody className="grid gap-4">
          {children}
          {error ? (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="submit" variant="primary" loading={pending} disabled={disabled}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function UnlockDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const unlock = useUnlock();
  const [pin, setPin] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: starts empty each time it opens
  useEffect(() => {
    if (open) {
      setPin("");
      unlock.reset();
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <PinForm
        title={`Unlock this ${DEVICE}`}
        description={`With the household PIN, this ${DEVICE} can change and delete things until it is locked again.`}
        submitLabel="Unlock"
        pending={unlock.isPending}
        disabled={pin.length < PIN_MIN_DIGITS}
        // Said under the field and tied to it, so a screen reader hears it with the field.
        error={null}
        onSubmit={() =>
          unlock.mutate(
            { pin },
            {
              onSuccess: () => {
                toast.success(`This ${DEVICE} is unlocked.`);
                onOpenChange(false);
              },
              onError: () => setPin(""),
            },
          )
        }
      >
        <Field label="Household PIN" error={unlock.error ? errorMessage(unlock.error) : undefined}>
          {(ids) => <PinInput ids={ids} value={pin} onChange={setPin} autoFocus />}
        </Field>
      </PinForm>
    </Dialog>
  );
}

/** Sets a PIN where there is none, or changes the one in use. */
export function SetPinDialog({
  open,
  onOpenChange,
  changing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changing: boolean;
}) {
  const setPinNow = useSetPin();
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: starts empty each time it opens
  useEffect(() => {
    if (open) {
      setCurrent("");
      setPin("");
      setAgain("");
      setPinNow.reset();
    }
  }, [open]);
  const mismatch = again.length >= pin.length && again !== pin;
  const ready = PIN_PATTERN.test(pin) && again === pin && (!changing || current.length >= PIN_MIN_DIGITS);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <PinForm
        title={changing ? "Change the household PIN" : "Set a household PIN"}
        description={
          changing
            ? `Every other device is locked by a new PIN until it is entered there. This ${DEVICE} stays unlocked.`
            : `Every device can still read. To change or delete anything, a device needs the PIN once; this ${DEVICE} is unlocked now.`
        }
        submitLabel={changing ? "Change the PIN" : "Set the PIN"}
        pending={setPinNow.isPending}
        disabled={!ready}
        error={setPinNow.error ? errorMessage(setPinNow.error) : null}
        onSubmit={() =>
          setPinNow.mutate(changing ? { pin, current } : { pin }, {
            onSuccess: () => {
              toast.success(changing ? "The household PIN was changed." : "The household PIN is set.");
              onOpenChange(false);
            },
          })
        }
      >
        {changing ? (
          <Field label="PIN in use now">{(ids) => <PinInput ids={ids} value={current} onChange={setCurrent} autoFocus />}</Field>
        ) : null}
        <Field label={changing ? "New PIN" : "PIN"} hint={`${PIN_MIN_DIGITS} to ${PIN_MAX_DIGITS} digits.`}>
          {(ids) => <PinInput ids={ids} value={pin} onChange={setPin} autoFocus={!changing} />}
        </Field>
        <Field label="The same PIN again" error={mismatch ? "The two PINs are not the same." : undefined}>
          {(ids) => <PinInput ids={ids} value={again} onChange={setAgain} />}
        </Field>
      </PinForm>
    </Dialog>
  );
}

export function RemovePinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const remove = useRemovePin();
  const [current, setCurrent] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: starts empty each time it opens
  useEffect(() => {
    if (open) {
      setCurrent("");
      remove.reset();
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <PinForm
        title="Remove the household PIN"
        description="Every device that can reach Outpost will be able to change and delete things again, without a PIN."
        submitLabel="Remove the PIN"
        pending={remove.isPending}
        disabled={current.length < PIN_MIN_DIGITS}
        error={remove.error ? errorMessage(remove.error) : null}
        onSubmit={() =>
          remove.mutate(
            { current },
            {
              onSuccess: () => {
                toast.success("The household PIN was removed.");
                onOpenChange(false);
              },
            },
          )
        }
      >
        <Field label="PIN in use now">{(ids) => <PinInput ids={ids} value={current} onChange={setCurrent} autoFocus />}</Field>
      </PinForm>
    </Dialog>
  );
}
