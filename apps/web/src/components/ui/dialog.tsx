import { X } from "lucide-react";
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlay = "fixed inset-0 z-(--z-overlay) bg-overlay data-[state=open]:animate-fade";
const panel =
  "fixed z-(--z-dialog) flex max-h-[min(86dvh,46rem)] w-[calc(100vw-2rem)] flex-col rounded-panel border border-border bg-raised shadow-dialog focus:outline-none data-[state=open]:animate-enter left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";

export function DialogContent({
  title,
  description,
  size = "md",
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content className={cn(panel, width, className)} {...props} aria-describedby={description ? undefined : undefined}>
        <header className="flex items-start gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-lead font-semibold text-ink">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-small text-ink-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-1.5 -mt-0.5">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </header>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<"footer">) {
  return (
    <footer className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3.5", className)} {...props} />
  );
}

/**
 * A confirmation for actions that cannot be undone. The confirm button names the
 * action; there is no generic "OK".
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  onConfirm,
  loading,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  /** What staying put is called here, when "Cancel" would be ambiguous: "Keep drawing". */
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  onConfirm: () => void;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={overlay} />
        <AlertPrimitive.Content className={cn(panel, "max-w-md")}>
          <div className="px-5 pt-5 pb-4">
            <AlertPrimitive.Title className="text-lead font-semibold text-ink">{title}</AlertPrimitive.Title>
            <AlertPrimitive.Description asChild>
              <div className="mt-2 text-small leading-relaxed text-ink-muted">{description}</div>
            </AlertPrimitive.Description>
            {children ? <div className="mt-4">{children}</div> : null}
          </div>
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3.5">
            <AlertPrimitive.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AlertPrimitive.Cancel>
            <Button variant={confirmVariant} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </footer>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
