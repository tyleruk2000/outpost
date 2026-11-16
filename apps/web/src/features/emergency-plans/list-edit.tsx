/** Moving, changing and removing the entries of a plan's lists, the same way in every section. */
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const replaceAt = <T,>(list: T[], index: number, value: T): T[] => list.map((item, at) => (at === index ? value : item));
export const removeAt = <T,>(list: T[], index: number): T[] => list.filter((_, at) => at !== index);
export function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

/** Up, down and remove, for an entry called `name`. */
export function RowTools({
  name,
  first,
  last,
  onMove,
  onRemove,
}: {
  name: string;
  first: boolean;
  last: boolean;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <Button size="icon" variant="ghost" aria-label={`Move up: ${name}`} disabled={first} onClick={() => onMove(-1)}>
        <ArrowUp />
      </Button>
      <Button size="icon" variant="ghost" aria-label={`Move down: ${name}`} disabled={last} onClick={() => onMove(1)}>
        <ArrowDown />
      </Button>
      <Button size="icon" variant="ghost" aria-label={`Remove: ${name}`} onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}
