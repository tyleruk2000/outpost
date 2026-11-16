/**
 * Saved nuclear effects scenarios attached to an emergency plan, as illustrations: each
 * shown as its picture with its caveat, opened in the workspace from here, and taken
 * off again. A scenario never changes the plan's steps; it is held by id, like a linked
 * note, and is said to be missing if it has been deleted.
 */
import { computeEffects, type EmergencyPlanLink, type PlanResolved } from "@outpost/shared";
import { Link } from "react-router";
import { Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useScenarios } from "./data";
import { ScenarioPicture } from "./picture";
import { burstText, yieldText } from "./words";

export function PlanIllustrations({
  links,
  resolved,
  onChange,
}: {
  links: EmergencyPlanLink[];
  resolved: PlanResolved;
  onChange: (links: EmergencyPlanLink[]) => void;
}) {
  const attached = links.filter((link) => link.kind === "scenario");
  const scenarios = useScenarios();
  if (attached.length === 0) return null;
  return (
    <Section
      title="Scenarios attached as illustrations"
      description="Pictures from the nuclear preparedness workspace's effects simulator, kept beside this plan to show what a published model says about one hypothetical case. They are not forecasts, and none of this plan's steps changes with them."
    >
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {attached.map((link) => {
          const title = resolved.links.find((each) => each.kind === "scenario" && each.id === link.id)?.title ?? null;
          const scenario = scenarios.data?.find((each) => each.id === link.id);
          const answer = scenario ? computeEffects(scenario.effects) : null;
          const remove = (
            <Button variant="ghost" onClick={() => onChange(links.filter((each) => !(each.kind === "scenario" && each.id === link.id)))}>
              Take it off this plan
            </Button>
          );
          return (
            <li key={link.id} className="grid grid-cols-[minmax(0,1fr)] gap-2 border-t border-border pt-3">
              {title === null ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-small text-warning">A scenario that is no longer in Outpost</span>
                  {remove}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/prepare/nuclear?scenario=${link.id}`} className="text-body text-primary underline underline-offset-2">
                        {title}
                      </Link>
                      {scenario ? (
                        <p className="text-small text-ink-muted">
                          {yieldText(scenario.effects.yieldKt)}, {burstText(scenario.effects)}. An illustration, not a forecast.
                        </p>
                      ) : null}
                    </div>
                    {remove}
                  </div>
                  {scenarios.isPending ? (
                    <Skeleton className="size-56" />
                  ) : scenarios.isError ? (
                    <p className="text-small text-danger">The scenario could not be read. {errorMessage(scenarios.error)}</p>
                  ) : answer?.ok ? (
                    <ScenarioPicture result={answer.result} />
                  ) : (
                    <p className="text-small text-ink-muted">
                      The model no longer gives a picture for this scenario: open it in the workspace to see why.
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
