/**
 * A section of Outpost that is a list of screens: Tools, Preparedness. Each has a
 * registry (features/<section>/screens.ts) that the navigation and the section's own
 * page are both drawn from, so a screen is added in one place: one more entry there,
 * and a route in app.tsx.
 */
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { EmptyState, Page, PageHeader, Rows } from "@/components/page";

export interface SectionScreen {
  /** Its address, under the section's own: "/tools/water". */
  to: string;
  /** Its name, as the sidebar, the More sheet, the quick search and its own heading give it. */
  label: string;
  icon: LucideIcon;
  /** One or two sentences on what it is for, shown on the section's page. */
  about: string;
  /** Other names the quick search finds it by. */
  keywords?: string;
}

export function SectionPage({
  title,
  description,
  screens,
  children,
}: {
  title: string;
  description: string;
  screens: readonly SectionScreen[];
  /** Said under the list: a caution that belongs to the whole section. */
  children?: ReactNode;
}) {
  return (
    <Page width="reading">
      <PageHeader title={title} description={description} />
      {screens.length === 0 ? (
        <EmptyState title="Nothing here yet">This section has no screens in this version of Outpost.</EmptyState>
      ) : (
        <Rows className="border-y border-border">
          {screens.map((screen) => (
            <li key={screen.to}>
              <Link
                to={screen.to}
                className="group flex items-center gap-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <screen.icon aria-hidden className="size-5 shrink-0 text-ink-muted" strokeWidth={1.6} />
                <span className="min-w-0 flex-1">
                  <span className="block text-lead text-ink group-hover:text-primary">{screen.label}</span>
                  <span className="mt-0.5 block text-small text-ink-muted">{screen.about}</span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint" />
              </Link>
            </li>
          ))}
        </Rows>
      )}
      {children ? <div className="mt-6 text-small text-ink-muted">{children}</div> : null}
    </Page>
  );
}
