import type { CatalogResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const catalogKey = ["catalog", "list"] as const;

/** The whole catalogue. It is small (tens of entries) and filtered in the browser. */
export const useCatalog = () => useQuery({ queryKey: catalogKey, queryFn: () => api.get<CatalogResponse>("/api/catalog") });
