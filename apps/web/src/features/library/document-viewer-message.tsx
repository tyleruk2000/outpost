import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * What the viewing area says when there is no document to show in it: the drive is
 * away, the file is damaged, a password is needed. Plain words where the pages would be.
 */
export function ViewerMessage({
  icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("scroll-quiet h-full overflow-y-auto bg-surface", className)}>
      <div className="mx-auto max-w-[34rem] px-6 py-12 md:py-20">
        {icon ? (
          <span aria-hidden className="mb-4 block text-ink-muted [&_svg]:size-6">
            {icon}
          </span>
        ) : null}
        <h2 className="font-title text-heading text-ink">{title}</h2>
        {children ? <div className="mt-2 space-y-2 text-body text-ink-muted">{children}</div> : null}
        {actions ? <div className="mt-6 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
