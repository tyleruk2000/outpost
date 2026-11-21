/**
 * The offline drill's steps with the server out of reach: the same list, answered on
 * this phone, kept here until the result is kept on Outpost's own Offline drill screen.
 */
import { Page } from "@/components/page";
import { DrillSteps } from "@/features/readiness/drill-steps";
import { DEVICE } from "./device";

export default function KeptDrillScreen() {
  return (
    <Page width="reading">
      <h1 className="font-title text-title text-ink">Offline drill</h1>
      <p className="mt-2 max-w-[60ch] text-ink-muted">
        The server is out of reach, which is part of the drill. Answer the steps here: they are kept on this {DEVICE}. When everything is
        back on, open Preparedness, Offline drill, and keep the result.
      </p>
      <DrillSteps className="mt-6" />
    </Page>
  );
}
