import { Select } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { CategoryChoice } from "./catalog";

export interface CategoryItem {
  slug: CategoryChoice;
  label: string;
  /** Entries matching the current filter; null where a count would mislead (maps live on their own screen). */
  count: number | null;
}

/**
 * Categories as a quiet list beside the entries on wide screens and a single select on
 * narrow ones, where thirteen long names would not fit a row.
 */
export function CategoryNav({
  items,
  value,
  onChange,
}: {
  items: CategoryItem[];
  value: CategoryChoice;
  onChange: (slug: CategoryChoice) => void;
}) {
  return (
    <>
      <nav aria-label="Categories" className="max-lg:hidden lg:sticky lg:top-6 lg:self-start">
        <ul className="grid gap-px">
          {items.map((item) => {
            const current = item.slug === value;
            return (
              <li key={item.slug}>
                <button
                  type="button"
                  aria-current={current ? "true" : undefined}
                  onClick={() => onChange(item.slug)}
                  className={cn(
                    "-ml-2.5 flex w-[calc(100%+0.625rem)] items-baseline justify-between gap-3 rounded-control px-2.5 py-1.5 text-left text-small transition-colors duration-150",
                    current ? "bg-primary-soft font-medium text-primary-soft-ink" : "text-ink-muted hover:bg-surface hover:text-ink",
                    !current && item.count === 0 && "text-ink-faint",
                  )}
                >
                  <span>{item.label}</span>
                  {item.count !== null ? <span className="tabular text-micro">{item.count}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="lg:hidden">
        <Select<CategoryChoice>
          aria-label="Category"
          value={value}
          onChange={onChange}
          options={items.map((item) => ({ value: item.slug, label: item.count === null ? item.label : `${item.label} (${item.count})` }))}
        />
      </div>
    </>
  );
}
