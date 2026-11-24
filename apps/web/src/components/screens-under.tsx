import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { allNav } from "./nav";

/**
 * The screens under this one, as links near its top: the sidebar shows them indented
 * under it, and the screen itself says where they are, on a phone as on a wide display.
 * Drawn from the navigation's description (nav.ts), so a screen added there appears here.
 */
export function ScreensUnder({ parent, className }: { parent: string; className?: string }) {
  const item = allNav.find((entry) => entry.to === parent);
  if (!item?.children?.length) return null;
  return (
    <nav aria-label={`Screens under ${item.label}`} className={cn("flex flex-wrap gap-x-6 gap-y-1", className)}>
      {item.children.map((child) => (
        <Link
          key={child.to}
          to={child.to}
          className="inline-flex min-h-11 items-center gap-2 text-body text-primary underline decoration-1 underline-offset-[3px] hover:decoration-2 md:min-h-9 md:pointer-coarse:min-h-11"
        >
          <child.icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.6} />
          {child.label}
        </Link>
      ))}
    </nav>
  );
}
