/**
 * Where new things go: a storage location for each kind of content, so that maps can
 * stay on the device's own drive (and work while the NAS is off) and everything else
 * go to the NAS. A kind with none of its own goes to the default location.
 */
import { CONTENT_KINDS, type ContentKind, type StorageLocation } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Section } from "@/components/page";
import { Select } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

const DEFAULT = "default";

export function KindDefaultsSection({ locations }: { locations: StorageLocation[] }) {
  const client = useQueryClient();
  const fallback = locations.find((location) => location.isDefault) ?? locations[0];
  const save = useMutation({
    mutationFn: (body: { kind: ContentKind; locationId: string | null }) => api.put("/api/storage/kind-defaults", body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["storage"] }),
    onError: (error) => notify.error(errorMessage(error)),
  });

  return (
    <Section
      title="Where new things go"
      description="Each kind of download can have a location of its own, such as maps on this device so they work while a network share is off. A download's own picker can still send it elsewhere. Nothing already kept is moved."
    >
      <ul className="divide-y divide-border border-y border-border">
        {CONTENT_KINDS.map((entry) => {
          const own = locations.find((location) => location.defaultFor.includes(entry.kind));
          const id = `kind-default-${entry.kind}`;
          return (
            <li key={entry.kind} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <label htmlFor={id} className="text-small font-medium text-ink">
                  {entry.label}
                </label>
                <p id={`${id}-detail`} className="text-small text-ink-muted">
                  {entry.detail}
                  {own && own.status !== "available" ? `. ${own.name} is not connected, so these cannot be downloaded until it is.` : ""}
                </p>
              </div>
              <Select
                id={id}
                aria-describedby={`${id}-detail`}
                className="w-full sm:w-64"
                value={own?.id ?? DEFAULT}
                onChange={(value) => save.mutate({ kind: entry.kind, locationId: value === DEFAULT ? null : value })}
                options={[
                  { value: DEFAULT, label: fallback ? `The default (${fallback.name})` : "The default" },
                  ...locations.map((location) => ({
                    value: location.id,
                    label: location.status === "available" ? location.name : `${location.name} (not connected)`,
                  })),
                ]}
              />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
