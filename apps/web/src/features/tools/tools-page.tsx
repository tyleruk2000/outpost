import { SectionPage } from "@/components/section";
import { toolScreens } from "./screens";

export default function ToolsPage() {
  return (
    <SectionPage
      title="Tools"
      description="Calculators and small tools. Everything here works with no connection, and nothing typed into them leaves this device unless a tool says so."
      screens={toolScreens}
    >
      A calculator gives the answer its formula gives. Each says where its formula comes from and what it leaves out; check anything that
      matters against a second source.
    </SectionPage>
  );
}
