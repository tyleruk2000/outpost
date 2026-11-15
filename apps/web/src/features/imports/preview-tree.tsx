/**
 * The pages an import would create, as a tree that opens and closes. Each row says
 * what the page is and, when it already exists, what the current choice will do to it.
 */
import type { ImportDuplicatePolicy, ImportItem } from "@outpost/shared";
import { ChevronRight, FileText, Folder, Paperclip, Table2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/misc";
import { cn, plural } from "@/lib/utils";
import { initiallyOpen, type PreviewNode, type PreviewTree } from "./preview-model";

/** Children shown before the rest are asked for; a folder of thousands of notes should not flood the page. */
const SHOWN = 100;

function iconFor(item: ImportItem) {
  if (item.kind === "database") return Table2;
  return item.format === "folder" ? Folder : FileText;
}

/** What the duplicate choice means for one page that already exists. */
function DuplicateBadge({ item, policy }: { item: ImportItem; policy: ImportDuplicatePolicy }) {
  if (!item.duplicateOf) return null;
  if (policy === "copy") return <Badge>Imported again as a copy</Badge>;
  if (policy === "replace" && item.duplicateOf.reason === "imported-before") return <Badge tone="warning">Will be overwritten</Badge>;
  return <Badge>Already here</Badge>;
}

function Row({
  node,
  depth,
  open,
  toggle,
  policy,
}: {
  node: PreviewNode;
  depth: number;
  open: Set<string>;
  toggle: (path: string) => void;
  policy: ImportDuplicatePolicy;
}) {
  const [showAll, setShowAll] = useState(false);
  const { item, children } = node;
  const expanded = open.has(item.path);
  const Icon = iconFor(item);
  const shown = showAll ? children : children.slice(0, SHOWN);

  return (
    <li>
      <div className="flex min-h-9 items-start gap-1.5 py-1.5 max-md:min-h-11" style={{ paddingLeft: `${Math.min(depth, 8) * 1.25}rem` }}>
        {children.length > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} the ${plural(children.length, "page")} inside ${item.title}`}
            onClick={() => toggle(item.path)}
            className="-my-1 grid size-7 shrink-0 place-content-center rounded-control text-ink-muted hover:bg-surface-strong hover:text-ink max-md:size-9"
          >
            <ChevronRight aria-hidden className={cn("size-4 transition-transform duration-150", expanded && "rotate-90")} />
          </button>
        ) : (
          <span aria-hidden className="size-7 shrink-0 max-md:size-9" />
        )}
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={1.6} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="min-w-0 break-words text-small text-ink">{item.title}</span>
          {item.kind === "database" ? <span className="text-micro text-ink-muted">table</span> : null}
          {!expanded && node.descendants > 0 ? (
            <span className="tabular text-micro text-ink-muted">{plural(node.descendants, "page")} inside</span>
          ) : null}
          {node.attachments > 0 ? (
            <span className="tabular flex items-center gap-1 text-micro text-ink-muted">
              <Paperclip aria-hidden className="size-3.5" />
              {plural(node.attachments, "picture or file", "pictures and files")}
            </span>
          ) : null}
          {item.warnings.length > 0 ? (
            <span className="tabular flex items-center gap-1 text-micro text-warning">
              <TriangleAlert aria-hidden className="size-3.5" />
              {plural(item.warnings.length, "warning")}
            </span>
          ) : null}
          <DuplicateBadge item={item} policy={policy} />
        </div>
      </div>
      {expanded ? (
        <ul>
          {shown.map((child) => (
            <Row key={child.item.path} node={child} depth={depth + 1} open={open} toggle={toggle} policy={policy} />
          ))}
          {shown.length < children.length ? (
            <li style={{ paddingLeft: `${Math.min(depth + 1, 8) * 1.25 + 1.75}rem` }} className="py-1.5">
              <button type="button" onClick={() => setShowAll(true)} className="text-small text-primary underline underline-offset-2">
                Show the other {plural(children.length - shown.length, "page")}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

export function PreviewTreeView({ tree, policy, label }: { tree: PreviewTree; policy: ImportDuplicatePolicy; label: string }) {
  const [open, setOpen] = useState(() => initiallyOpen(tree));
  const [showAll, setShowAll] = useState(false);
  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const parents: string[] = [];
  const collect = (node: PreviewNode) => {
    if (node.children.length === 0) return;
    parents.push(node.item.path);
    node.children.forEach(collect);
  };
  tree.roots.forEach(collect);
  const allOpen = parents.length > 0 && parents.every((path) => open.has(path));
  const shown = showAll ? tree.roots : tree.roots.slice(0, SHOWN);

  return (
    <div>
      {parents.length > 1 ? (
        <div className="mb-1 flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(allOpen ? new Set() : new Set(parents))}
            className="text-small text-primary underline underline-offset-2"
          >
            {allOpen ? "Close all" : "Open all"}
          </button>
        </div>
      ) : null}
      <ul aria-label={label} className="border-y border-border py-1.5">
        {shown.map((node) => (
          <Row key={node.item.path} node={node} depth={0} open={open} toggle={toggle} policy={policy} />
        ))}
        {shown.length < tree.roots.length ? (
          <li className="py-1.5 pl-7">
            <button type="button" onClick={() => setShowAll(true)} className="text-small text-primary underline underline-offset-2">
              Show the other {plural(tree.roots.length - shown.length, "page")}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
