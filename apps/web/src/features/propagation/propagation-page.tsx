import { useSearchParams } from "react-router";
import { Page, PageHeader } from "@/components/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Datasets } from "./datasets";
import { Equipment } from "./equipment";
import { Planner } from "./planner";

const TABS = ["plan", "equipment", "data"] as const;

/** HF propagation: the planner, the equipment it is asked about, and the data it rests on. */
export default function PropagationPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((name) => name === params.get("tab")) ?? "plan";
  return (
    <Page>
      <PageHeader
        title="HF propagation"
        description="How well a shortwave signal is predicted to get from one place to another, hour by hour and band by band. Worked out on this computer by VOACAP, from monthly maps of the ionosphere: a planning aid, not a reading of today's conditions."
      />
      <Tabs value={tab} onValueChange={(next) => setParams(next === "plan" ? {} : { tab: next }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="data">Engine and data</TabsTrigger>
        </TabsList>
        <TabsContent value="plan" className="pt-8">
          <Planner />
        </TabsContent>
        <TabsContent value="equipment" className="pt-8">
          <Equipment />
        </TabsContent>
        <TabsContent value="data" className="pt-8">
          <Datasets />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
