/**
 * Marking a fixed household's home without leaving its page: from this device's location
 * (asked only on the press) or a point pressed on the map. It saves a place on the map with
 * the home icon, as the Maps screen would, and makes it the household's home place: the one
 * step that used to mean going to Maps, saving a place, coming back and choosing it.
 */
import type { HouseholdDto } from "@outpost/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useSaveMarker } from "@/features/maps/data";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useUpdateHousehold } from "./data";
import { type HereChoice, HereChooser } from "./here";

export function HomePlaceDialog({
  household,
  open,
  onOpenChange,
}: {
  household: HouseholdDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [choice, setChoice] = useState<HereChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const saveMarker = useSaveMarker();
  const update = useUpdateHousehold(household.id);
  const close = (next: boolean) => {
    if (!next) setChoice(null);
    onOpenChange(next);
  };
  const confirm = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      const name = choice.name?.trim() || household.name;
      const { marker } = await saveMarker.mutateAsync({
        name,
        note: "",
        lat: choice.lat,
        lon: choice.lon,
        color: "teal",
        icon: "home",
        isFavorite: true,
      });
      await update.mutateAsync({ homePlaceId: marker.id });
      toast.success(`${name} is ${household.name}'s home place, and saved on the map.`);
      close(false);
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={`Where ${household.name} is`}
        description="Saved as a place on the map with the home icon. Warnings, weather, meeting places and the household book start from it."
      >
        <DialogBody>
          <HereChooser
            value={choice}
            onChange={setChoice}
            sources={["map", "device"]}
            nameHint={`Shown on the map. Left empty, it is called ${household.name}.`}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!choice} loading={busy} onClick={() => void confirm()}>
            Make it home
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
