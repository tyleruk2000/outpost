import type { StorageKind } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, Switch } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { FolderPicker, type PickedFolder } from "./folder-picker";

const kinds: Array<{ value: StorageKind; label: string; description: string }> = [
  { value: "external", label: "External drive", description: "USB disk or SSD that may be unplugged" },
  { value: "network", label: "Network share", description: "NAS mounted over SMB or NFS" },
  { value: "internal", label: "Internal", description: "A folder on this device's own disk" },
  { value: "volume", label: "Docker volume", description: "A named volume managed by Docker" },
];

export function AddLocationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const client = useQueryClient();
  const [folder, setFolder] = useState<PickedFolder>({ path: undefined, writable: false });
  const [name, setName] = useState("");
  const [kind, setKind] = useState<StorageKind>("external");
  const [makeDefault, setMakeDefault] = useState(false);

  const add = useMutation({
    mutationFn: (target: string) => api.post("/api/storage/locations", { name: name.trim(), path: target, kind, makeDefault }),
    onSuccess: () => {
      toast.success(`Added “${name.trim()}”.`);
      onOpenChange(false);
      return client.invalidateQueries({ queryKey: ["storage"] });
    },
  });

  // Start clean each time the dialog opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open
  useEffect(() => {
    if (open) {
      setName("");
      setKind("external");
      setMakeDefault(false);
      add.reset();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add a storage location"
        description="Pick the folder Outpost should use. A small marker file is written there so the drive is recognised when it is reconnected."
        size="lg"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (folder.path) add.mutate(folder.path);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="grid gap-5">
            {open ? <FolderPicker label="Folder" onChange={setFolder} /> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" hint="How this location is shown in Outpost.">
                {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} placeholder="Field SSD" maxLength={80} required />}
              </Field>
              <Field label="Kind" hint="Used for labels and warnings only.">
                {(ids) => <Select {...ids} value={kind} onChange={setKind} options={kinds} />}
              </Field>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span id="make-default-label">
                <span className="block text-small font-medium text-ink">Use for new downloads</span>
                <span className="block text-small text-ink-muted">You can still choose a different location for any single download.</span>
              </span>
              <Switch checked={makeDefault} onCheckedChange={setMakeDefault} aria-labelledby="make-default-label" />
            </div>

            {add.isError ? <Notice tone="danger">{errorMessage(add.error)}</Notice> : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!folder.path || !folder.writable || !name.trim()} loading={add.isPending}>
              Add location
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
