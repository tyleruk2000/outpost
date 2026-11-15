import type { CollectionResponse, CollectionsResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Every installed collection. The key is shared with other screens that list them all. */
export const useCollections = () =>
  useQuery({
    queryKey: ["collections", "all"],
    queryFn: () => api.get<CollectionsResponse>("/api/collections"),
    select: (data) => data.collections,
  });

export const useCollection = (id: string | undefined) =>
  useQuery({
    queryKey: ["collections", "detail", id],
    queryFn: () => api.get<CollectionResponse>(`/api/collections/${id}`),
    enabled: Boolean(id),
    select: (data) => data.collection,
  });
