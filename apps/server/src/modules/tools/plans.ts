/**
 * Emergency plans: the plans held, and one plan's steps, meeting places and how the
 * household will keep in touch, from `ctx.services.emergencyPlans` (the screens' own).
 *
 * The plan's contacts and its people's medical notes are left out: contacts are never
 * given to a model, and the medical lines are for each person's own wallet card.
 */
import { PLACE_ROLES, PLAN_PHASES, planKindLabel } from "@outpost/shared";
import { z } from "zod";
import { dayOf, defineTool, pageOf, type ToolDefinition } from "./types.ts";

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const emergencyPlans = defineTool({
  name: "emergency_plans",
  title: "emergency plans",
  area: "plans",
  description:
    "The household's emergency plans (power cut, flooding, leaving home and others). Give plan, a name or id, to read that plan's steps and meeting places.",
  input: z.object({
    plan: z.string().trim().min(1).max(120).optional().describe('A plan\'s name or id, e.g. "power cut". Leave out to list the plans.'),
    page: z.number().int().min(1).max(20).optional().describe("Which page of the plan's steps, from 1."),
  }),
  run({ plan, page }, { ctx }) {
    const service = ctx.services.emergencyPlans;
    const plans = service.list();
    if (plans.length === 0) {
      return {
        held: false,
        text: "No emergency plans are held. Plans are made under Preparedness → Emergency plans.",
        url: "/prepare/plans",
      };
    }
    if (!plan) {
      const { shown, line } = pageOf(plans, page ?? 1, 15);
      return {
        held: true,
        label: `${plans.length} plan${plans.length === 1 ? "" : "s"}`,
        url: "/prepare/plans",
        text: [
          "Emergency plans held in Outpost:",
          ...shown.map(
            (entry) =>
              `- ${entry.name} (${entry.kindText || planKindLabel(entry.kind)}): ${entry.steps} steps, last looked over ${dayOf(entry.reviewedAt)}. id ${entry.id}`,
          ),
          line,
          "Ask again with plan to read one.",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    const asked = fold(plan);
    const summary =
      plans.find((entry) => entry.id === plan.trim()) ??
      plans.find((entry) => fold(entry.name) === asked) ??
      plans.find((entry) => fold(`${entry.name} ${entry.kindText} ${planKindLabel(entry.kind)}`).includes(asked));
    if (!summary) {
      return {
        held: false,
        text: `No plan called "${plan}" is held. The plans are: ${plans.map((entry) => entry.name).join(", ")}.`,
        url: "/prepare/plans",
      };
    }
    const { plan: full } = service.get(summary.id);
    const phase = (id: string) => PLAN_PHASES.find((entry) => entry.id === id)?.label ?? id;
    const steps = full.body.steps.map((step, index) => `${index + 1}. (${phase(step.phase)}) ${step.text}`);
    const { shown, line } = pageOf(steps, page ?? 1, 15);
    const atStart = (page ?? 1) === 1;
    const places = full.body.places.map(
      (place) =>
        `- ${place.name} (${PLACE_ROLES.find((role) => role.id === place.role)?.label ?? place.role})${place.note ? `: ${place.note}` : ""}`,
    );
    const comms = [full.body.comms.text, full.body.comms.frequency, full.body.comms.schedule].filter(Boolean).join("; ");
    return {
      held: true,
      label: full.name,
      url: `/prepare/plans/${full.id}`,
      text: [
        `Plan: ${full.name} (${full.kindText || planKindLabel(full.kind)}), last looked over ${dayOf(full.reviewedAt)}. Emergency number: ${full.emergencyNumber || "not given"}.`,
        steps.length > 0 ? "Steps:" : "The plan has no steps.",
        ...shown,
        line,
        atStart && places.length > 0 ? "Meeting places:" : null,
        ...(atStart ? places : []),
        atStart && comms ? `Keeping in touch: ${comms}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
});

export const PLANS_TOOLS: ToolDefinition[] = [emergencyPlans];
