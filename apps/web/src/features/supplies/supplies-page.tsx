/**
 * Supplies, under Preparedness: food, water and the kit beside them, who they are for,
 * how long they last, and what to buy. Made for a phone in a cupboard first.
 *
 * Four views of one set of data, chosen by `?view=` so that each has an address a note
 * can link to: the stock, how long it lasts, the shopping list, and the household.
 */
import type { SupplyItemInput } from "@outpost/shared";
import { FileDown, FileUp, Link2, Plus, ScanBarcode } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { ErrorState, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { copyText } from "@/lib/clipboard";
import { exportHref, useSupplies } from "./data";
import { HouseholdView } from "./household-view";
import { ImportDialog } from "./import-dialog";
import { ItemDialog } from "./item-form";
import { OutlookView } from "./outlook-view";
import { ShoppingView } from "./shopping-view";
import { StockView } from "./stock-view";

// The scanner carries the barcode reader: loaded when Scan is pressed, not with the screen.
const ScannerDialog = lazy(() => import("./scanner-dialog").then((module) => ({ default: module.ScannerDialog })));

const VIEWS = ["stock", "days", "shopping", "household"] as const;
type View = (typeof VIEWS)[number];

/** Copies an address inside Outpost, for pasting as a link on a page in Notes; says so, or shows it to copy by hand. */
export async function copyAddress(path: string): Promise<void> {
  const copied = await copyText(path);
  if (copied) toast.success(`Copied ${path}. On a page in Notes, select some words and paste it as the link.`);
  else toast.message(`This browser would not copy. The address is ${path}`);
}

export default function SuppliesPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("view");
  const view: View = VIEWS.includes(asked as View) ? (asked as View) : "stock";
  const supplies = useSupplies();
  const [adding, setAdding] = useState<{ start?: Partial<SupplyItemInput> } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);

  const setView = (next: string) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === "stock") copy.delete("view");
        else copy.set("view", next);
        return copy;
      },
      { replace: true },
    );

  return (
    <Page width="wide">
      <PageHeader
        title="Supplies"
        description="Food, water and the kit beside them: what you keep and where, how long it lasts for your household, and what to buy."
        actions={
          <>
            <Button size="lg" onClick={() => setScanning(true)}>
              <ScanBarcode />
              Scan
            </Button>
            <Button size="lg" variant="primary" onClick={() => setAdding({})}>
              <Plus />
              Add
            </Button>
          </>
        }
      />

      {supplies.isPending ? (
        <div className="grid gap-3" role="status" aria-label="Loading supplies">
          <Skeleton className="h-9 w-full max-w-md" />
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-14" />
          ))}
        </div>
      ) : supplies.isError ? (
        <ErrorState error={supplies.error} onRetry={() => void supplies.refetch()} />
      ) : (
        <Tabs value={view} onValueChange={setView}>
          <TabsList className="mb-6" aria-label="Supplies">
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="days">How long it lasts</TabsTrigger>
            <TabsTrigger value="shopping">Shopping list</TabsTrigger>
            <TabsTrigger value="household">Household</TabsTrigger>
          </TabsList>
          <TabsContent value="stock">
            <StockView items={supplies.data.items} locations={supplies.data.locations} onAdd={() => setAdding({})} />
          </TabsContent>
          <TabsContent value="days">
            <OutlookView items={supplies.data.items} household={supplies.data.household} onHousehold={() => setView("household")} />
          </TabsContent>
          <TabsContent value="shopping">
            <ShoppingView items={supplies.data.items} />
          </TabsContent>
          <TabsContent value="household">
            <HouseholdView key={supplies.data.household.updatedAt ?? 0} household={supplies.data.household} />
          </TabsContent>
        </Tabs>
      )}

      <footer className="mt-12 flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={() => setImporting(true)}>
          <FileUp />
          Bring in a CSV file
        </Button>
        <Button variant="ghost" asChild>
          <a href={exportHref()} download>
            <FileDown />
            Save as CSV
          </a>
        </Button>
        <Button variant="ghost" onClick={() => void copyAddress(`/prepare/supplies${view === "stock" ? "" : `?view=${view}`}`)}>
          <Link2 />
          Copy a link for a page
        </Button>
      </footer>

      {adding ? <ItemDialog start={adding.start} locations={supplies.data?.locations ?? []} onClose={() => setAdding(null)} /> : null}
      {scanning ? (
        <Suspense fallback={null}>
          <ScannerDialog
            onClose={() => setScanning(false)}
            onNew={(start) => {
              setScanning(false);
              setAdding({ start });
            }}
          />
        </Suspense>
      ) : null}
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
    </Page>
  );
}
