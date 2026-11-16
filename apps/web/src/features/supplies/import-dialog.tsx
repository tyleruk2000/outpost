/**
 * Bringing supplies in from a CSV file: read first and shown, nothing changed until the
 * person says. Rows that are already in the supplies (by Outpost's own id from an
 * export, or the same product in the same place with the same date) are skipped,
 * updated or added again, as chosen; rows that cannot be read are listed with why.
 */
import { categoryLabel, type ImportPreview, SUPPLY_LIMITS } from "@outpost/shared";
import { FileUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Segmented, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { previewImport, useApplyImport } from "./data";
import { dateWords, quantityWords } from "./words";

type Duplicates = "skip" | "update" | "add";

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicates>("skip");
  const apply = useApplyImport();

  const read = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setPreview(null);
    if (file.size > SUPPLY_LIMITS.csvBytes) return setProblem("That file is larger than Outpost reads as a list of supplies (2 MB).");
    setReading(true);
    setName(file.name);
    try {
      setPreview(await previewImport(await file.text()));
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setReading(false);
    }
  };

  const readable = preview?.rows.filter((row) => row.item) ?? [];
  const fresh = readable.filter((row) => !row.duplicateOf);
  const same = readable.filter((row) => row.duplicateOf);
  const failed = preview?.rows.filter((row) => row.error) ?? [];
  const bringing = fresh.length + (duplicates === "skip" ? 0 : same.length);

  const submit = () => {
    if (!preview) return;
    const rows = readable.map((row) => {
      if (!row.duplicateOf) return { action: "add" as const, item: row.item! };
      if (duplicates === "update") return { action: "update" as const, id: row.duplicateOf.id, item: row.item! };
      return { action: duplicates === "add" ? ("add" as const) : ("skip" as const), item: row.item! };
    });
    apply.mutate(rows, {
      onSuccess: (result) => {
        toast.success(
          [
            result.added > 0 ? `${plural(result.added, "row")} added` : null,
            result.updated > 0 ? `${plural(result.updated, "item")} updated` : null,
            result.skipped > 0 ? `${plural(result.skipped, "duplicate")} skipped` : null,
          ]
            .filter(Boolean)
            .join(", ") || "Nothing was changed.",
        );
        onClose();
      },
      onError: (error) => setProblem(errorMessage(error)),
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        title="Bring in a CSV file"
        description="A spreadsheet saved as CSV, with a first row naming its columns: at least a name; quantity, unit, place, date, kcal, litres and barcode if it has them. Nothing changes until you choose."
      >
        <DialogBody className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="supplies-csv"
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(event) => void read(event.target.files?.[0])}
            />
            <Button asChild variant={preview ? "secondary" : "primary"}>
              <label htmlFor="supplies-csv" className="cursor-pointer">
                <FileUp />
                {preview ? "Choose another file" : "Choose a file"}
              </label>
            </Button>
            {reading ? (
              <Spinner label="Reading the file" />
            ) : name ? (
              <span className="min-w-0 truncate text-small text-ink-muted">{name}</span>
            ) : null}
          </div>
          {problem ? <Notice tone="danger">{problem}</Notice> : null}
          {preview ? (
            <>
              <p className="text-body text-ink">
                {plural(preview.rows.length, "row")} in the file: {fresh.length} new, {same.length} already in your supplies,{" "}
                {failed.length} that cannot be read.
                {preview.ignoredColumns.length > 0 ? ` Columns not read: ${preview.ignoredColumns.join(", ")}.` : ""}
              </p>
              {same.length > 0 ? (
                <div className="grid gap-1.5">
                  <span className="text-small font-medium text-ink">The {plural(same.length, "row")} already in your supplies</span>
                  <Segmented<Duplicates>
                    label="Rows already in your supplies"
                    value={duplicates}
                    onChange={setDuplicates}
                    options={[
                      { value: "skip", label: "Skip" },
                      { value: "update", label: "Update them" },
                      { value: "add", label: "Add again" },
                    ]}
                    className="justify-self-start"
                  />
                </div>
              ) : null}
              <ul className="max-h-80 divide-y divide-border overflow-y-auto border-y border-border" aria-label="Rows of the file">
                {preview.rows.map((row) => (
                  <li key={row.line} className="py-2 text-small">
                    <span className="tabular text-ink-muted">Line {row.line}: </span>
                    {row.item ? (
                      <>
                        <span className="font-medium text-ink">{row.item.name}</span>
                        <span className="text-ink-muted">
                          {" "}
                          · {quantityWords(row.item.quantity, row.item.unit)} · {categoryLabel(row.item.category)}
                          {row.item.location ? ` · ${row.item.location}` : ""}
                          {row.item.date ? ` · ${dateWords(row.item)}` : ""}
                        </span>
                        {row.duplicateOf ? (
                          <span className="block text-warning">
                            Already in your supplies{row.duplicateOf.by === "id" ? " (exported from here)" : ""}:{" "}
                            {duplicates === "skip" ? "skipped" : duplicates === "update" ? "will be updated" : "will be added again"}.
                          </span>
                        ) : null}
                        {row.warnings.map((warning) => (
                          <span key={warning} className="block text-ink-muted">
                            {warning}
                          </span>
                        ))}
                      </>
                    ) : (
                      <span className="text-danger">{row.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!preview || readable.length === 0} loading={apply.isPending} onClick={submit}>
            {preview && bringing === 0 && same.length > 0 ? "Change nothing" : `Bring in ${plural(bringing, "row")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
