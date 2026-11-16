/** A switch with its label and a line of help beside it: the trainer's on-or-off settings. */
import { useId } from "react";
import { Switch } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function SwitchField({
  label,
  hint,
  checked,
  onChange,
  className,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-3", className)}>
      {/* The switch sits in a 44 px row on a phone, so a thumb does not miss it. */}
      <div className="flex h-6 items-center max-md:h-11">
        <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={hint ? `${id}-hint` : undefined} />
      </div>
      <div className="grid gap-0.5 pt-0.5 max-md:pt-2.5">
        <label htmlFor={id} className="text-small font-medium text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-small text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
