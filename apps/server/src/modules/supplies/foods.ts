/**
 * Energy per food: USDA FoodData Central's SR Legacy table (7,793 foods, April 2018),
 * which ships with Outpost in `foods/fdc-sr-legacy.json` (made by
 * scripts/build-food-energy.mjs; public domain, CC0 1.0). Nothing is fetched.
 *
 * The table is read the first time a person types a food's name, not at start, and kept:
 * about 0.7 MB of JSON, a few MB once read. In the packaged app it is a chunk of its own,
 * so a server that is never asked does not hold it.
 */
import { type FoodIndex, type FoodSearchResponse, type FoodTable, indexFoods, searchFoods } from "@outpost/shared";

let loading: Promise<FoodIndex> | null = null;

export function foodIndex(): Promise<FoodIndex> {
  loading ??= import("./foods/fdc-sr-legacy.json", { with: { type: "json" } }).then((module) =>
    indexFoods(module.default as unknown as FoodTable),
  );
  // A failed read is tried again the next time, not remembered.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export async function findFoods(query: string, limit: number): Promise<FoodSearchResponse> {
  const index = await foodIndex();
  const { table } = index;
  return { source: `${table.source}, ${table.dataset} (${table.releaseWords})`, matches: searchFoods(index, query, limit) };
}
