/**
 * One item of the supplies, at an address of its own (/prepare/supplies/items/:id) so
 * that a page in Notes can link to it. Its count can be changed here as on the list, it can be
 * changed, copied as another batch, used up or removed.
 */
import { categoryLabel, localDay, type SupplyItemInput } from "@outpost/shared";
import { CopyPlus, Link2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink, ErrorState, Notice, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { ApiError, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatDateTime } from "@/lib/utils";
import { useRemoveItem, useSupplies, useSupplyItem, useUpdateItem } from "./data";
import { ItemDialog } from "./item-form";
import { Adjuster, ItemFacts, itemPath } from "./stock-view";
import { copyAddress } from "./supplies-page";

const back = { to: "/prepare/supplies", label: "Supplies" };

export default function SupplyItemPage() {
  const { id = "" } = useParams();
  const item = useSupplyItem(id);
  const supplies = useSupplies();
  const remove = useRemoveItem();
  const update = useUpdateItem();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<{ start?: Partial<SupplyItemInput>; copy: boolean } | null>(null);
  const [removing, setRemoving] = useState(false);

  if (item.isPending)
    return (
      <Page width="reading">
        <BackLink to={back.to}>{back.label}</BackLink>
        <Skeleton className="mt-2 h-10 w-72" />
        <Skeleton className="mt-4 h-24" />
      </Page>
    );
  if (item.isError) {
    const gone = item.error instanceof ApiError && item.error.status === 404;
    return (
      <Page width="reading">
        <PageHeader back={back} title={gone ? "Not in your supplies" : "Supplies"} />
        {gone ? (
          <Notice title="This item is not in your supplies any more">
            It was removed, or the link is from another Outpost. <Link to="/prepare/supplies">See the supplies</Link>.
          </Notice>
        ) : (
          <ErrorState error={item.error} onRetry={() => void item.refetch()} />
        )}
      </Page>
    );
  }

  const data = item.data;
  const path = itemPath(data.id);
  return (
    <Page width="reading">
      <PageHeader back={back} title={data.name} description={categoryLabel(data.category)} />
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-4">
        <ItemFacts item={data} today={localDay()} className="text-body" />
        <Adjuster item={data} />
      </div>
      {data.notes ? <p className="mt-4 whitespace-pre-wrap text-body text-ink">{data.notes}</p> : null}
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
        {data.minimum !== null ? (
          <>
            <dt className="text-ink-muted">Keep at least</dt>
            <dd className="tabular text-ink">{data.minimum}</dd>
          </>
        ) : null}
        {data.barcode ? (
          <>
            <dt className="text-ink-muted">Barcode</dt>
            <dd className="font-mono text-ink">{data.barcode}</dd>
          </>
        ) : null}
        <dt className="text-ink-muted">Last changed</dt>
        <dd className="text-ink">{formatDateTime(data.updatedAt)}</dd>
      </dl>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => setEditing({ copy: false })}>
          <Pencil />
          Change
        </Button>
        <Button onClick={() => setEditing({ copy: true, start: { ...data, quantity: 1, date: null } })}>
          <CopyPlus />
          Add another like this
        </Button>
        {data.quantity > 0 ? (
          <Button
            loading={update.isPending}
            onClick={() =>
              update.mutate({ id: data.id, input: { quantity: 0 } }, { onError: (error) => notify.error(errorMessage(error)) })
            }
          >
            All used up
          </Button>
        ) : null}
        <Button variant="danger-ghost" onClick={() => setRemoving(true)}>
          <Trash2 />
          Remove
        </Button>
      </div>
      <section className="mt-10 grid gap-2">
        <h2 className="text-lead font-semibold text-ink">Link to it from a page</h2>
        <p className="text-small text-ink-muted">
          On a page in Notes, select some words and paste this as the link: <span className="font-mono text-ink break-all">{path}</span>
        </p>
        <Button className="justify-self-start" onClick={() => void copyAddress(path)}>
          <Link2 />
          Copy the link
        </Button>
      </section>

      {editing ? (
        <ItemDialog
          item={editing.copy ? undefined : data}
          start={editing.start}
          locations={supplies.data?.locations ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${data.name}?`}
        description="It goes from the supplies, and from the days and the shopping list. Its barcode, if it had one, is still remembered."
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(data.id, { onSuccess: () => navigate("/prepare/supplies", { replace: true }) })}
      />
    </Page>
  );
}
