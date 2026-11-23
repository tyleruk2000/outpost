/**
 * The radio plans the book takes, read from this Outpost when the book is made: the list
 * under Radio › Plans and, for each plan chosen, the matrix last worked out for it as it
 * stands. Nothing is worked out or fetched from the internet here; a plan with no matrix
 * kept goes in without one, and the book says how to work it out.
 */
import { type BookAnswers, bookRadioPlanIds, type CommunicationPlan, type PlanResult } from "@outpost/shared";
import { ApiError, api } from "@/lib/api";
import type { BookRadioPlan } from "./book-radio";

export async function gatherRadioPlans(
  answers: Pick<BookAnswers, "radioPlanChoice" | "radioPlanIds">,
  list: { data?: CommunicationPlan[]; refetch: () => Promise<{ data?: CommunicationPlan[] }> },
): Promise<BookRadioPlan[]> {
  const plans = list.data ?? (await list.refetch()).data ?? [];
  const chosen = new Set(bookRadioPlanIds(answers, plans));
  return Promise.all(
    plans
      .filter((plan) => chosen.has(plan.id))
      .map(async (plan) => {
        if (!plan.workedOut) return { plan, result: null };
        try {
          const kept = await api.get<{ matrix: PlanResult }>(`/api/radio/communication-plans/${plan.id}/matrix`);
          return { plan, result: kept.matrix };
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) return { plan, result: null };
          throw error;
        }
      }),
  );
}
