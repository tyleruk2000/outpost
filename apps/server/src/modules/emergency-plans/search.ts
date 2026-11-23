/**
 * Emergency plans in search, and the power cut card.
 *
 * Each plan is indexed with its name, what it is for, its steps by phase, the supplies,
 * where things are, its places, the people to call (names and notes) and how the
 * household keeps in touch. What a person must remember for their health
 * (`people[].medical`) is never indexed: it is medical, and medical sheets are left out
 * of search unless the household chooses otherwise. Nothing that is an encrypted
 * message is indexed either.
 *
 * A plan belongs to one household and is found only while that household is the current
 * one (search/owners.ts). With several households, a result names whose plan it is.
 * The index follows every change to plans and households (`emergency-plans.changed`,
 * `households.changed`), writing only the plans that changed.
 */
import { type EmergencyPlan, emptyPlanBody, isArmoredMessage, PLAN_PHASES, type PlanBody, planKindLabel } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import type { CardSource } from "../search/cards.ts";
import type { IndexEntity } from "../search/service.ts";
import { stem } from "../search/stem.ts";

export const PLAN_SEARCH_KIND = "plan";

interface PlanRow {
  id: string;
  householdId: string;
  name: string;
  kind: string;
  kindText: string;
  body: string;
}

/** Plain text that may be indexed: not an encrypted message. */
const plain = (text: string | null | undefined) => (text && !isArmoredMessage(text) ? text.trim() : "");
const lines = (items: string[]) => items.map(plain).filter(Boolean).join("\n");

/** What the index holds for one plan. */
export function planEntity(row: PlanRow, body: PlanBody, household: { name: string; several: boolean }): IndexEntity {
  const what = row.kindText.trim() || planKindLabel(row.kind);
  const sections = [
    ...PLAN_PHASES.map((phase) => ({
      heading: phase.label,
      text: lines(body.steps.filter((step) => step.phase === phase.id).map((step) => step.text)),
    })),
    {
      heading: "Supplies",
      text: lines(body.supplies.map((item) => [item.quantity ?? "", item.unit, item.name].join(" ").replace(/\s+/g, " "))),
    },
    { heading: "Where things are", text: lines(body.where.map((item) => `${plain(item.what)}: ${plain(item.where)}`)) },
    { heading: "Places", text: lines(body.places.map((place) => [plain(place.name), plain(place.note)].filter(Boolean).join(": "))) },
    {
      heading: "People",
      // Names and what to remember; never what they need for their health.
      text: lines(body.people.map((person) => [plain(person.name), plain(person.remember)].filter(Boolean).join(": "))),
    },
    {
      heading: "People to call",
      text: lines(body.contacts.map((contact) => [plain(contact.name), plain(contact.note)].filter(Boolean).join(": "))),
    },
    { heading: "Keeping in touch", text: lines([body.comms?.text ?? "", body.comms?.frequency ?? "", body.comms?.schedule ?? ""]) },
    { heading: "Notes", text: plain(body.notes) },
  ].filter((section) => section.text);
  return {
    kind: PLAN_SEARCH_KIND,
    entityId: row.id,
    title: plain(row.name) || what,
    subtitle: household.several ? `${what}, for ${household.name}` : what,
    collection: "Emergency plans",
    url: `/prepare/plans/${row.id}`,
    household: row.householdId,
    tags: [],
    sections,
  };
}

const POWER = new Set(["power cut", "power outage", "blackout", "power failure"]);
const POWER_WORDS = new Set(["blackout", "outage"].map((word) => stem(word)));

/** Indexes every plan now and after every change, and offers the household's power cut plan for a power cut. */
export function indexPlans(ctx: AppContext, list: () => Array<Pick<EmergencyPlan, "id" | "name" | "kind">>): () => void {
  const { sqlite } = ctx;
  const sync = () => {
    const households = ctx.services.households.list();
    const names = new Map(households.map((household) => [household.id, household.name]));
    const rows = sqlite
      .prepare("SELECT id, household_id AS householdId, name, kind, kind_text AS kindText, body FROM emergency_plans")
      .all() as PlanRow[];
    ctx.services.search.syncKind(
      PLAN_SEARCH_KIND,
      rows.map((row) =>
        planEntity(
          row,
          { ...emptyPlanBody(), ...(JSON.parse(row.body) as Partial<PlanBody>) },
          {
            name: names.get(row.householdId) ?? "another household",
            several: households.length > 1,
          },
        ),
      ),
    );
  };
  sync();
  const stop = ctx.events.subscribe((event) => {
    if (event.type === "emergency-plans.changed" || event.type === "households.changed") sync();
  });

  const card: CardSource = {
    id: "power-cut-plan",
    order: 10,
    card(query) {
      const asked = query.phrases.some((phrase) => POWER.has(phrase)) || [...query.stems].some((word) => POWER_WORDS.has(word));
      if (!asked || query.parsed.required.length > 3) return null;
      // The current household's own: the plan made for a power cut.
      const plan = list().find((candidate) => candidate.kind === "power-cut");
      if (!plan) return null;
      return {
        kind: "plan",
        title: plan.name,
        about: "Your household's plan for a power cut: what to do before, during and after.",
        url: `/prepare/plans/${plan.id}`,
      };
    },
  };
  ctx.services.search.addCards(card);
  return stop;
}
