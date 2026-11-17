/**
 * Tools → Solar clock: the time from the sun and the stars, worked out on this device
 * with no internet. Four tabs: Now (the sun at the chosen place by this device's clock),
 * Clock recovery (the time from a shadow, for when the clocks are wrong), Make a sundial
 * and Make a nocturnal. The tab is in the address (`?tab=`), so each can be linked to.
 * The place and the clock are chosen once, above the tabs, and remembered on the device.
 */
import { useSearchParams } from "react-router";
import { Notice, Page, PageHeader } from "@/components/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { NocturnalTab } from "./nocturnal-tab";
import { NowTab } from "./now-tab";
import { usePlaceAndZone } from "./place";
import { RecoveryTab } from "./recovery-tab";
import { SundialTab } from "./sundial-tab";

export const SOLAR_TABS = ["now", "recover", "sundial", "nocturnal"] as const;
export type SolarTab = (typeof SOLAR_TABS)[number];

export default function SolarClockPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const active: SolarTab = SOLAR_TABS.includes(asked as SolarTab) ? (asked as SolarTab) : "now";
  const setTab = (next: string) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === "now") copy.delete("tab");
        else copy.set("tab", next);
        return copy;
      },
      { replace: true },
    );
  const { place, zone, picker } = usePlaceAndZone();

  return (
    <Page width="reading">
      <PageHeader
        title="Solar clock"
        description="The time from the sun and the stars, worked out on this device with no internet: where the sun is now, setting your clocks from a shadow after a power cut, and how to make a sundial and a nocturnal."
      />
      <Notice tone="warning" title="Never look at the sun directly" className="mb-6">
        Not for a moment, and not through sunglasses, binoculars, a camera or a phone: measure shadows instead. These methods give the time
        roughly, for setting clocks; they are no good for navigation or for anything where safety depends on the time.
      </Notice>
      <section aria-label="Place and clock" className="mb-8">
        {picker}
      </section>
      <Tabs value={active} onValueChange={setTab}>
        <TabsList className="mb-6" aria-label="Solar clock">
          <TabsTrigger value="now">Now</TabsTrigger>
          <TabsTrigger value="recover">Clock recovery</TabsTrigger>
          <TabsTrigger value="sundial">Make a sundial</TabsTrigger>
          <TabsTrigger value="nocturnal">Make a nocturnal</TabsTrigger>
        </TabsList>
        <TabsContent value="now">
          <NowTab place={place} zone={zone} />
        </TabsContent>
        <TabsContent value="recover">
          <RecoveryTab place={place} zone={zone} />
        </TabsContent>
        <TabsContent value="sundial">
          <SundialTab place={place} zone={zone} />
        </TabsContent>
        <TabsContent value="nocturnal">
          <NocturnalTab place={place} zone={zone} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
