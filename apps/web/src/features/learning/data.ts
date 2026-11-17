/** Learning progress from the server: the lists, and the writes the reader makes. */
import type {
  LearnersResponse,
  LearningDoneInput,
  LearningKept,
  LearningPageResponse,
  LearningProgressResponse,
  LearningTopicInput,
  LearningVisitInput,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** The reader at a page of an archive. */
export const readerAt = (collectionId: string, path: string) =>
  `/library/read/${collectionId}/${path.split("/").map(encodeURIComponent).join("/")}`;

/** Whose progress to show: one learner, or everyone in the house. */
export type Whose = { learner: string } | { everyone: true };

const whoseQuery = (whose: Whose) => ("everyone" in whose ? { everyone: "1" } : { learner: whose.learner });

export function useLearners() {
  return useQuery({ queryKey: ["learning", "learners"], queryFn: () => api.get<LearnersResponse>("/api/learning/learners") });
}

export function useProgress(whose: Whose | null, collectionId?: string) {
  return useQuery({
    queryKey: ["learning", "progress", whose, collectionId ?? null],
    queryFn: () => api.get<LearningProgressResponse>("/api/learning/progress", { ...whoseQuery(whose!), collectionId }),
    enabled: whose !== null,
  });
}

export function usePageProgress(learner: string | null, collectionId: string, path: string | null) {
  return useQuery({
    queryKey: ["learning", "page", collectionId, learner, path],
    queryFn: () => api.get<LearningPageResponse>("/api/learning/page", { learner: learner!, collectionId, path: path! }),
    enabled: learner !== null && path !== null,
    // Asked once a page is opened; changed here by the reader's own writes.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useMarkDone() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LearningDoneInput) => api.post<LearningPageResponse>("/api/learning/done", input),
    onSuccess: (response, input) => {
      client.setQueryData(["learning", "page", input.collectionId, input.learner, input.path], response);
      void client.invalidateQueries({ queryKey: ["learning", "progress"] });
    },
  });
}

export function useRemoveProgress() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (whose: Whose) => api.delete<{ removed: LearningKept }>("/api/learning/progress", whoseQuery(whose)),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["learning"] }),
  });
}

export function postTopic(input: LearningTopicInput): Promise<unknown> {
  return api.post("/api/learning/topics", input).catch(() => undefined);
}

/**
 * Records a page being left, hidden, or still open after a minute. `keepalive` lets the
 * write finish after the page has gone (a tab closed, the phone locked). It never throws:
 * progress that could not be written is lost, and the reading goes on.
 */
export async function postVisit(input: LearningVisitInput, keepalive = false): Promise<boolean> {
  try {
    const response = await fetch("/api/learning/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Outpost-Request": "1" },
      body: JSON.stringify(input),
      credentials: "same-origin",
      keepalive,
    });
    return response.ok;
  } catch {
    return false;
  }
}
