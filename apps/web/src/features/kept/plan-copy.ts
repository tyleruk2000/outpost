/**
 * Keeping an emergency plan on this phone, ticking it while the server is out of
 * reach, and sending those ticks when the server is back.
 *
 * The copy is the server's answer for the plan (`GET /api/emergency-plans/:id`), filed
 * in the plan's own cache like every other kept thing. Ticks made on the phone are not
 * written into that copy: they are kept beside it, as a list of what the person did
 * (`PendingTicks`), so that the server can apply them by its rule and nothing the
 * server holds is overwritten by an old copy. The rule is the server's
 * (`PlanTickMerge` in `@outpost/shared`): the union of ticks with the earliest time; an
 * untick only takes away the very tick the phone saw; a reset on the server since the
 * copy wins over what the phone did before it.
 *
 * With several households, the copy and its line in the list carry the household's
 * name (`EmergencyPlanResponse.household`), so that the phone says whose plan it is.
 */
import type { EmergencyPlanResponse, PlanTickMerge, PlanTickMergeResponse } from "@outpost/shared";
import { ApiError, api } from "@/lib/api";
import { keptKey } from "@/sw/rules";
import { getKept, type KeptPlan, openKept, putKept, putKeptJson, readKeptJson } from "./store";

export const planPath = (id: string) => `/api/emergency-plans/${id}`;
/** Where the ticks waiting to be sent are filed, in the plan's own cache. Never an address the server answers. */
const pendingPath = (id: string) => `/__kept-pending/emergency-plans/${encodeURIComponent(id)}`;

export type PendingTicks = PlanTickMerge;

const nothingPending = (knownStartedAt: number | null): PendingTicks => ({ knownStartedAt, ticks: {}, unticks: {} });
const pendingCount = (pending: PendingTicks) => Object.keys(pending.ticks).length + Object.keys(pending.unticks).length;

/** Files the server's answer as the copy, and its line in the list. Ticks waiting to be sent are left as they are. */
async function store(answer: EmergencyPlanResponse, before: KeptPlan | undefined, pending: number): Promise<KeptPlan> {
  const { plan } = answer;
  const cache = await openKept("plan", plan.id);
  const bytes = await putKeptJson(cache, planPath(plan.id), answer);
  const now = Date.now();
  const item: KeptPlan = {
    kind: "plan",
    id: plan.id,
    title: plan.name,
    updatedAt: plan.updatedAt,
    steps: plan.body.steps.length,
    pending,
    ...(answer.household?.several ? { household: answer.household.name } : {}),
    bytes,
    keptAt: before?.keptAt ?? now,
    refreshedAt: now,
  };
  await putKept(item);
  return item;
}

/** Keeps a plan on this phone, or brings the copy up to date. */
export async function keepPlan(id: string): Promise<KeptPlan> {
  const before = await getKept("plan", id);
  const answer = await api.get<EmergencyPlanResponse>(planPath(id));
  return store(answer, before, before?.pending ?? 0);
}

/** The kept copy and what was done on the phone since, or undefined when the plan is not kept here. */
export async function readKeptPlan(
  id: string,
): Promise<{ item: KeptPlan; answer: EmergencyPlanResponse; pending: PendingTicks } | undefined> {
  const item = await getKept("plan", id);
  if (!item) return undefined;
  const answer = await readKeptJson<EmergencyPlanResponse>("plan", id, planPath(id));
  if (!answer) return undefined;
  const pending = (await readKeptJson<PendingTicks>("plan", id, pendingPath(id))) ?? nothingPending(answer.plan.use.startedAt);
  return { item, answer, pending };
}

/** The ticks as they stand on the phone: the copy's, less what was unticked here, with what was ticked here. */
export function ticksOnPhone(
  answer: EmergencyPlanResponse,
  pending: PendingTicks,
): { ticks: Record<string, number>; startedAt: number | null } {
  const ticks: Record<string, number> = {};
  for (const [stepId, at] of Object.entries(answer.plan.use.ticks)) if (pending.unticks[stepId] === undefined) ticks[stepId] = at;
  for (const [stepId, at] of Object.entries(pending.ticks)) ticks[stepId] ??= at;
  const mine = Object.values(pending.ticks);
  const startedAt = answer.plan.use.startedAt ?? (mine.length > 0 ? Math.min(...mine) : null);
  return { ticks, startedAt };
}

/** What a tick or untick on the phone does to the list waiting to be sent. Pure, for the tests. */
export function withTick(answer: EmergencyPlanResponse, pending: PendingTicks, stepId: string, done: boolean, now: number): PendingTicks {
  const next: PendingTicks = { ...pending, ticks: { ...pending.ticks }, unticks: { ...pending.unticks } };
  const onServer = answer.plan.use.ticks[stepId];
  if (done) {
    // Ticking again what was unticked here puts the server's tick back as it was.
    if (next.unticks[stepId] !== undefined) delete next.unticks[stepId];
    else if (onServer === undefined) next.ticks[stepId] ??= now;
  } else if (next.ticks[stepId] !== undefined) delete next.ticks[stepId];
  else if (onServer !== undefined) next.unticks[stepId] = onServer;
  return next;
}

let writing: Promise<unknown> = Promise.resolve();

/** Records a tick or untick made on the phone. One at a time, so that two quick presses are both kept. */
export function tickOnPhone(id: string, stepId: string, done: boolean): Promise<PendingTicks> {
  const next = writing.then(async () => {
    const kept = await readKeptPlan(id);
    if (!kept) throw new Error("This plan is no longer kept on this phone.");
    const pending = withTick(kept.answer, kept.pending, stepId, done, Date.now());
    const cache = await openKept("plan", id);
    await putKeptJson(cache, pendingPath(id), pending);
    await putKept({ ...kept.item, pending: pendingCount(pending) });
    return pending;
  });
  writing = next.catch(() => undefined);
  return next;
}

export interface SentTicks {
  title: string;
  applied: number;
  dropped: number;
}

/**
 * Sends what was ticked on the phone, if anything, then brings the copy up to date.
 * Resolves with what was sent, or null when nothing was waiting. Throws when the
 * server cannot be reached; the ticks then stay on the phone for next time.
 */
export async function refreshPlan(item: KeptPlan): Promise<SentTicks | null> {
  const kept = await readKeptPlan(item.id);
  const pending = kept?.pending;
  try {
    if (pending && pendingCount(pending) > 0) {
      const merged = await api.post<PlanTickMergeResponse>(`${planPath(item.id)}/ticks/merge`, pending);
      // The server has them now: the list is emptied before the copy is replaced, so nothing is sent twice.
      const cache = await openKept("plan", item.id);
      await cache.delete(keptKey(pendingPath(item.id), window.location.origin));
      await store({ plan: merged.plan, resolved: merged.resolved, household: merged.household }, item, 0);
      return { title: merged.plan.name, applied: merged.applied, dropped: merged.dropped };
    }
    const answer = await api.get<EmergencyPlanResponse>(planPath(item.id));
    await store(answer, item, 0);
    return null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      // Deleted on the server. The copy, and anything ticked on it, stay until the person removes them.
      if (!item.gone) await putKept({ ...item, gone: true });
      return null;
    }
    throw error;
  }
}
