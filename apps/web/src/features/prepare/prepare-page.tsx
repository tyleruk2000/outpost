import { SectionPage } from "@/components/section";
import { GettingReady } from "./getting-ready";
import { prepareScreens } from "./screens";

export default function PreparePage() {
  return (
    <SectionPage
      title="Preparedness"
      description="Plans, supplies and reference for when things go wrong: made ahead of time, kept on this device, and readable with no connection."
      screens={prepareScreens}
      lead={<GettingReady />}
      listTitle="Everything in Preparedness"
    >
      This is general preparedness, not instructions for an emergency in progress. In a real emergency, follow what the emergency services
      and your local authorities say.
    </SectionPage>
  );
}
