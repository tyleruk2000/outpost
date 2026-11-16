/** What the Supplies screen asks the server for, and the changes it sends. */
import {
  type BarcodeLookup,
  type BoughtInput,
  type HouseholdInput,
  type ImportAction,
  type ImportPreview,
  type ImportResult,
  localDay,
  type ShoppingLine,
  type ShoppingList,
  type SuppliesResponse,
  type SupplyItem,
  type SupplyItemInput,
} from "@outpost/shared";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

export const suppliesKeys = {
  all: ["supplies"] as const,
  stock: ["supplies", "stock"] as const,
  item: (id: string) => ["supplies", "item", id] as const,
  shopping: ["supplies", "shopping"] as const,
};

export const useSupplies = () => useQuery({ queryKey: suppliesKeys.stock, queryFn: () => api.get<SuppliesResponse>("/api/supplies") });

export const useSupplyItem = (id: string) =>
  useQuery({
    queryKey: suppliesKeys.item(id),
    queryFn: () => api.get<{ item: SupplyItem }>(`/api/supplies/items/${encodeURIComponent(id)}`).then((data) => data.item),
  });

export const useShopping = () =>
  useQuery({ queryKey: suppliesKeys.shopping, queryFn: () => api.get<ShoppingList>("/api/supplies/shopping") });

const refresh = (client: QueryClient) => void client.invalidateQueries({ queryKey: suppliesKeys.all });

function useChange<T, R>(run: (input: T) => Promise<R>, options: { quiet?: boolean } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => refresh(client),
    onError: options.quiet ? undefined : (error) => toast.error(errorMessage(error)),
  });
}

export const useAddItem = () =>
  useChange((input: SupplyItemInput) => api.post<{ item: SupplyItem }>("/api/supplies/items", input).then((data) => data.item), {
    quiet: true,
  });
export const useUpdateItem = () =>
  useChange(
    ({ id, input }: { id: string; input: Partial<SupplyItemInput> }) =>
      api.patch<{ item: SupplyItem }>(`/api/supplies/items/${encodeURIComponent(id)}`, input).then((data) => data.item),
    { quiet: true },
  );
export const useRemoveItem = () => useChange((id: string) => api.delete(`/api/supplies/items/${encodeURIComponent(id)}`));

/**
 * One press of plus or minus. The list shows the new number at once, before the server
 * answers, so that ten presses in a cupboard are ten steps and not a wait for each.
 */
export function useAdjust() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, by }: { id: string; by: number }) =>
      api.post<{ item: SupplyItem }>(`/api/supplies/items/${encodeURIComponent(id)}/adjust`, { by }).then((data) => data.item),
    onMutate: ({ id, by }) => {
      client.setQueryData<SuppliesResponse>(suppliesKeys.stock, (data) =>
        data
          ? { ...data, items: data.items.map((item) => (item.id === id ? { ...item, quantity: Math.max(0, item.quantity + by) } : item)) }
          : data,
      );
      client.setQueryData<SupplyItem>(suppliesKeys.item(id), (item) =>
        item ? { ...item, quantity: Math.max(0, item.quantity + by) } : item,
      );
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      refresh(client);
    },
    onSettled: () => refresh(client),
  });
}

export const useSetHousehold = () =>
  useChange((input: HouseholdInput) => api.put<{ household: SuppliesResponse["household"] }>("/api/supplies/household", input), {
    quiet: true,
  });

export const lookupBarcode = (code: string) => api.get<BarcodeLookup>(`/api/supplies/barcodes/${encodeURIComponent(code)}`);

export const useWorkOutShopping = () =>
  useChange(() => api.post<ShoppingList>("/api/supplies/shopping/work-out", {}, { today: localDay() }));
export const useAddShoppingLine = () =>
  useChange((input: { name: string; quantity: number | null; unit: string; note: string }) =>
    api.post<{ line: ShoppingLine }>("/api/supplies/shopping", input),
  );
export const useUpdateShoppingLine = () =>
  useChange(({ id, input }: { id: string; input: Partial<Pick<ShoppingLine, "name" | "quantity" | "unit" | "note">> }) =>
    api.patch<{ line: ShoppingLine }>(`/api/supplies/shopping/${encodeURIComponent(id)}`, input),
  );
export const useRemoveShoppingLine = () => useChange((id: string) => api.delete(`/api/supplies/shopping/${encodeURIComponent(id)}`));
export const useBought = () =>
  useChange(
    ({ id, input }: { id: string; input: BoughtInput }) =>
      api.post<{ item: SupplyItem; line: ShoppingLine | null }>(`/api/supplies/shopping/${encodeURIComponent(id)}/bought`, input),
    { quiet: true },
  );

export const previewImport = (text: string) => api.post<ImportPreview>("/api/supplies/import/preview", { text });
export const useApplyImport = () =>
  useChange(
    (rows: Array<{ action: ImportAction; id?: string; item: SupplyItemInput }>) =>
      api.post<ImportResult>("/api/supplies/import/apply", { rows }),
    { quiet: true },
  );

export const exportHref = () => `/api/supplies/export.csv?today=${localDay()}`;
