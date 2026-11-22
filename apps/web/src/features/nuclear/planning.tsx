/**
 * The workspace's Planning tab: the household's own preparation, built on the screens
 * that already hold it rather than beside them. Plans for a radiation emergency are
 * emergency plans (made from the radiation emergency template, opened and used on the
 * emergency plans screens); places are the saved places of the Maps screen, measured
 * against each other here on this device; supplies are Supplies' own figures; how the
 * household keeps in touch is the plan's and Radio's. A saved scenario can be attached
 * to a plan as an illustration, never as a forecast.
 */
import {
  type EmergencyPlanResponse,
  type EmergencyPlanSummary,
  type EmergencyPlanUpdate,
  haversineMeters,
  type MarkerDto,
  type NuclearScenario,
  planFromTemplate,
  templateById,
} from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ListChecks, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select, Skeleton } from "@/components/ui/misc";
import { conflictOf, inputOf, planKeys, useCreatePlan, usePlans } from "@/features/emergency-plans/data";
import { DaysHeld } from "@/features/emergency-plans/supplies-section";
import { guessEmergencyNumber } from "@/features/emergency-plans/words";
import { useHomeCountry } from "@/features/frequencies/home-country";
import { useHome } from "@/features/households/home";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { localId } from "@/lib/utils";
import { distanceText } from "./words";

export const RADIATION_TEMPLATE_ID = "radiation";

/** A plan for a radiation emergency: made from its template, or named so by the household. */
export const isRadiationPlan = (plan: Pick<EmergencyPlanSummary, "templateId" | "kindText" | "scenarios">) =>
  plan.templateId === RADIATION_TEMPLATE_ID || /radiation|nuclear|fallout/i.test(plan.kindText) || plan.scenarios.length > 0;

/** Every pair of the household's places but one with itself: from one place, how far each other is. */
export function distancesFrom(
  from: Pick<MarkerDto, "id" | "lat" | "lon">,
  places: MarkerDto[],
): Array<{ place: MarkerDto; metres: number }> {
  return places
    .filter((place) => place.id !== from.id)
    .map((place) => ({ place, metres: haversineMeters(from.lat, from.lon, place.lat, place.lon) }))
    .sort((a, b) => a.metres - b.metres);
}

/**
 * Adds a saved scenario to a plan's links, as an illustration. The plan is read and
 * written back with the version it was read at; if it was changed in between, the
 * link is added again to the newer version, so nothing anyone else saved is replaced.
 */
async function attachScenario(planId: string, scenarioId: string, tries = 2): Promise<void> {
  const { plan } = await api.get<EmergencyPlanResponse>(`/api/emergency-plans/${planId}`);
  const input = inputOf(plan);
  if (input.body.links.some((link) => link.kind === "scenario" && link.id === scenarioId)) return;
  input.body = { ...input.body, links: [...input.body.links, { kind: "scenario", id: scenarioId }] };
  const update: EmergencyPlanUpdate = { ...input, baseUpdatedAt: plan.updatedAt };
  try {
    await api.put<EmergencyPlanResponse>(`/api/emergency-plans/${planId}`, update);
  } catch (error) {
    if (tries > 1 && conflictOf(error)) return attachScenario(planId, scenarioId, tries - 1);
    throw error;
  }
}

export function PlanningPanel({
  places,
  placesLoading,
  scenarios,
  openId,
}: {
  places: MarkerDto[];
  placesLoading: boolean;
  scenarios: NuclearScenario[];
  /** The saved scenario open in the Scenario tab, offered first to attach. */
  openId: string | null;
}) {
  const plans = usePlans();
  const create = useCreatePlan();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);
  const chosen = scenarios.find((item) => item.id === (scenarioId ?? openId)) ?? scenarios[0] ?? null;
  const ours = (plans.data ?? []).filter(isRadiationPlan);
  const template = templateById(RADIATION_TEMPLATE_ID)!;
  const home = useHomeCountry();

  const make = () =>
    create.mutate(planFromTemplate(template, localId, guessEmergencyNumber(undefined, home?.code)), {
      onSuccess: (response) => navigate(`/prepare/plans/${response.plan.id}`),
      onError: (error) => notify.error(errorMessage(error)),
    });

  const attach = async (plan: EmergencyPlanSummary) => {
    if (!chosen) return;
    setAttaching(plan.id);
    try {
      await attachScenario(plan.id, chosen.id);
      await client.invalidateQueries({ queryKey: planKeys.all, exact: true });
      await client.invalidateQueries({ queryKey: planKeys.one(plan.id) });
      toast.success(`“${chosen.name}” is attached to “${plan.name}” as an illustration.`);
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setAttaching(null);
    }
  };

  const [fromId, setFromId] = useState<string | null>(null);
  // From the current household's home place first (a portable household's position is not a saved place).
  const homeId = useHome().home?.id ?? null;
  const from = places.find((place) => place.id === fromId) ?? places.find((place) => place.id === homeId) ?? places[0] ?? null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <Notice tone="info" title="Made in advance, from published guidance">
        These plans are your household's own, made ahead from official guidance. In a real emergency, follow the emergency services and
        official warnings: what they say comes first.
      </Notice>

      <Section
        title="Plans for a radiation emergency"
        description="Emergency plans made from the radiation emergency template (go in, stay in, tune in, from the UK Health Security Agency), or named for one. Made, changed and used on the emergency plans screens."
      >
        {plans.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
        ) : ours.length === 0 ? (
          <EmptyState
            title="No plan of this kind yet"
            compact
            action={
              <Button variant="primary" onClick={make} loading={create.isPending}>
                <Plus aria-hidden /> Make a plan from the template
              </Button>
            }
          >
            The template's steps are the UK Health Security Agency's words on GOV.UK, each with its source; where the guidance says nothing
            it leaves a question for you to decide.
          </EmptyState>
        ) : (
          <>
            {scenarios.length > 0 ? (
              <div className="mb-3 grid gap-1.5">
                <Select
                  aria-label="Scenario to attach"
                  value={chosen?.id}
                  onChange={setScenarioId}
                  options={scenarios.map((item) => ({ value: item.id, label: item.name }))}
                />
                <p className="text-small text-ink-muted">
                  A saved scenario can be attached to a plan as an illustration of one hypothetical case. It is not a forecast, and the
                  plan's steps do not change with it.
                </p>
              </div>
            ) : (
              <p className="mb-3 text-small text-ink-muted">Save a scenario to attach it to a plan as an illustration.</p>
            )}
            <Rows className="border-y border-border">
              {ours.map((plan) => {
                const attached = chosen ? plan.scenarios.includes(chosen.id) : false;
                return (
                  <li key={plan.id} className="grid grid-cols-[minmax(0,1fr)] gap-2 py-3">
                    <Link to={`/prepare/plans/${plan.id}`} className="text-body text-primary underline underline-offset-2">
                      {plan.name}
                    </Link>
                    <p className="text-small text-ink-muted">
                      {plan.steps} steps
                      {plan.scenarios.length > 0
                        ? `, ${plan.scenarios.length} ${plan.scenarios.length === 1 ? "scenario" : "scenarios"} attached as illustrations`
                        : ""}
                      .
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild>
                        <Link to={`/prepare/plans/${plan.id}/use`}>
                          <ListChecks aria-hidden /> Use now
                        </Link>
                      </Button>
                      <Button asChild variant="ghost">
                        <Link to={`/prepare/plans/${plan.id}/cards`}>Cards to print</Link>
                      </Button>
                      {chosen ? (
                        <Button
                          variant="ghost"
                          disabled={attached}
                          loading={attaching === plan.id}
                          onClick={() => attach(plan)}
                          aria-label={attached ? `“${chosen.name}” is attached to ${plan.name}` : `Attach “${chosen.name}” to ${plan.name}`}
                        >
                          {attached ? "Attached" : "Attach the scenario"}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </Rows>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={make} loading={create.isPending}>
                <Plus aria-hidden /> Another plan from the template
              </Button>
              <Button asChild variant="ghost">
                <Link to="/prepare/plans">Every emergency plan</Link>
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section
        title="Places that matter"
        description="Your saved places from the Maps screen (home, work, a meeting point, a shelter) and how far apart they are, worked out on this device. They stay on this Outpost: nothing here sends them anywhere."
      >
        {placesLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : places.length === 0 ? (
          <p className="text-small text-ink-muted">
            No saved places yet. Save home, work, a meeting point or a shelter on the{" "}
            <Link to="/maps" className="text-primary underline underline-offset-2">
              Maps screen
            </Link>
            ; an emergency plan can then link them as places to meet.
          </p>
        ) : places.length === 1 || !from ? (
          <p className="text-small text-ink-muted">One saved place, {places[0]!.name}. Save another to see how far apart they are.</p>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <Select
              aria-label="Distances from"
              value={from.id}
              onChange={setFromId}
              options={places.map((place) => ({ value: place.id, label: `From ${place.name}` }))}
            />
            <Rows className="border-y border-border" aria-label={`Distances from ${from.name}`}>
              {distancesFrom(from, places).map(({ place, metres }) => (
                <li key={place.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                  <span className="text-body text-ink">{place.name}</span>
                  <span className="tabular text-small text-ink-muted">{distanceText(metres)} in a straight line</span>
                </li>
              ))}
            </Rows>
          </div>
        )}
      </Section>

      <Section
        title="Supplies for staying in"
        description="The UK Health Security Agency says you may be advised to stay inside for one to two days, longer if a release goes on; Be Ready's household plan asks for water and food for at least 3 days. Set beside what Supplies holds."
      >
        <DaysHeld days={3} />
      </Section>

      <Section
        title="If the phones fail"
        description="How the household keeps in touch: each plan's own part on this, and a radio communication plan."
      >
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 text-small">
          {ours.map((plan) => (
            <li key={plan.id}>
              <Link to={`/prepare/plans/${plan.id}`} className="text-primary underline underline-offset-2">
                {plan.name}: if the phones fail
              </Link>
            </li>
          ))}
          <li>
            <Link to="/radio/plans" className="text-primary underline underline-offset-2">
              Radio communication plans
            </Link>
          </li>
        </ul>
      </Section>

      <Section
        title="Notes, documents and attachments"
        description="Saved guidance and your own notes, linked from a plan's “Notes and links”."
      >
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 text-small">
          <li>
            <Link to="/library" className="text-primary underline underline-offset-2">
              The library
            </Link>
            <span className="text-ink-muted">: official guidance you saved, the first-aid manual.</span>
          </li>
          <li>
            <Link to="/notes" className="text-primary underline underline-offset-2">
              Notes
            </Link>
            <span className="text-ink-muted">: photos and files are attached to a page of notes, which a plan can link.</span>
          </li>
        </ul>
      </Section>
    </div>
  );
}
