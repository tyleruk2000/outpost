/**
 * The food and supplies layer: which OpenStreetMap objects and which Food Standards
 * Agency businesses belong to it, as which kind, and what a record's card says.
 *
 * The tags are those the OpenStreetMap wiki documents (read on 17 November 2026; see
 * docs/reference-layers.md). Nothing is guessed from a name. A place can be mapped as
 * more than one thing (a fuel station with a shop: `amenity=fuel` and `shop=convenience`
 * on one object): it is kept once, under its first kind in the order below, and is
 * found under each of its kinds (`foodKindSql`), so that "small shop" lists the fuel
 * station's shop too.
 *
 * Left out on purpose: restaurants, cafés, pubs and takeaways (the layer is about food to
 * take home); `man_made=water_tap` and `amenity=water_point` marked `drinking_water=no`
 * (taps for watering graves, water for animals); `healthcare=pharmacy` on its own (it is
 * almost always beside `amenity=pharmacy`, and alone is often a dispensary inside a
 * hospital).
 */
import { FOOD_KINDS, FOOD_WORDS, type FoodFactsDto, type FoodKind } from "@outpost/shared";

export const FOOD_SHOP_VALUES = ["supermarket", "convenience", "general", "greengrocer", "butcher", "bakery", "farm"] as const;
export const FOOD_AMENITY_VALUES = ["marketplace", "drinking_water", "water_point", "fuel", "pharmacy"] as const;

/** Each kind, in the order a place with several is filed under: the `amenity` it is first, then what it sells. */
const PRIORITY: FoodKind[] = [
  "food:food-bank",
  "food:market",
  "food:fuel",
  "food:pharmacy",
  "food:supermarket",
  "food:greengrocer",
  "food:butcher",
  "food:baker",
  "food:farm-shop",
  "food:small-shop",
  "food:retailer",
  "food:water",
];

const SHOP_KIND: Record<string, FoodKind> = {
  supermarket: "food:supermarket",
  convenience: "food:small-shop",
  general: "food:small-shop",
  greengrocer: "food:greengrocer",
  butcher: "food:butcher",
  bakery: "food:baker",
  farm: "food:farm-shop",
};

const notDrinkable = (tags: Record<string, string>) => tags.drinking_water === "no";

/** Every food kind an object's tags make it, in no particular order. */
function kindsOf(tags: Record<string, string>): Set<FoodKind> {
  const kinds = new Set<FoodKind>();
  const shop = tags.shop ? SHOP_KIND[tags.shop] : undefined;
  if (shop) kinds.add(shop);
  if (tags.amenity === "marketplace") kinds.add("food:market");
  if (tags.amenity === "fuel") kinds.add("food:fuel");
  if (tags.amenity === "pharmacy") kinds.add("food:pharmacy");
  if (tags.social_facility === "food_bank") kinds.add("food:food-bank");
  if (!notDrinkable(tags) && (tags.amenity === "drinking_water" || tags.amenity === "water_point" || tags.man_made === "water_tap"))
    kinds.add("food:water");
  return kinds;
}

/** The kind an object is kept under and every kind it is, or null if it is none of them. */
export function classifyFood(tags: Record<string, string>): { kind: FoodKind; kinds: FoodKind[] } | null {
  const found = kindsOf(tags);
  if (found.size === 0) return null;
  const kinds = PRIORITY.filter((kind) => found.has(kind));
  return { kind: kinds[0]!, kinds };
}

/** The Overpass filters that find the layer's objects; joined in a union, each with the area. */
export function foodOverpassFilters(): string[] {
  return [
    `["shop"~"^(${FOOD_SHOP_VALUES.join("|")})$"]`,
    `["amenity"~"^(${FOOD_AMENITY_VALUES.join("|")})$"]`,
    '["man_made"="water_tap"]',
    '["social_facility"="food_bank"]',
  ];
}

/**
 * The Food Standards Agency's business types that are in the layer, by their ids in its
 * API (`GET /BusinessTypes`, read on 17 November 2026). Only retailers: not restaurants,
 * takeaways, caterers, pubs, manufacturers or farmers.
 */
export const FSA_BUSINESS_TYPES: Record<number, { name: string; kind: FoodKind }> = {
  7840: { name: "Retailers - supermarkets/hypermarkets", kind: "food:supermarket" },
  4613: { name: "Retailers - other", kind: "food:retailer" },
};

const LABELS = new Map<string, string>(FOOD_KINDS.map((entry) => [entry.kind, entry.label]));
export const foodKindLabel = (kind: string): string | undefined => LABELS.get(kind);

/**
 * A SQL test on a stored record's fields that is true when it is of `kind` by any of its
 * tags, not only the kind it is kept under. `alias` is the features table's.
 */
export function foodKindSql(kind: string, alias: string): string | null {
  const tag = (key: string) => `json_extract(${alias}.props, '$."${key}"')`;
  const drinkable = `coalesce(${tag("drinking_water")}, '') != 'no'`;
  switch (kind as FoodKind) {
    case "food:supermarket":
      return `${tag("shop")} = 'supermarket'`;
    case "food:small-shop":
      return `${tag("shop")} IN ('convenience', 'general')`;
    case "food:greengrocer":
      return `${tag("shop")} = 'greengrocer'`;
    case "food:butcher":
      return `${tag("shop")} = 'butcher'`;
    case "food:baker":
      return `${tag("shop")} = 'bakery'`;
    case "food:farm-shop":
      return `${tag("shop")} = 'farm'`;
    case "food:market":
      return `${tag("amenity")} = 'marketplace'`;
    case "food:fuel":
      return `${tag("amenity")} = 'fuel'`;
    case "food:pharmacy":
      return `${tag("amenity")} = 'pharmacy'`;
    case "food:food-bank":
      return `${tag("social_facility")} = 'food_bank'`;
    case "food:water":
      return `((${tag("amenity")} IN ('drinking_water', 'water_point') OR ${tag("man_made")} = 'water_tap') AND ${drinkable})`;
    default:
      return null;
  }
}

/** Tag keys the layer keeps beyond those every OpenStreetMap layer keeps (osm-tags.ts). */
export const FOOD_KEPT_TAGS = [
  "shop",
  "brand",
  "social_facility",
  "social_facility:for",
  "man_made",
  "drinking_water",
  "seasonal",
  "fee",
  "addr:housename",
  "addr:place",
] as const;

const DRINKABLE: Record<string, string> = {
  yes: "Marked as drinking water",
  treated: "Marked as drinking water after treatment",
  conditional: "Marked as drinkable only at some times",
};

/** One line of address from OpenStreetMap's `addr:*` tags or the Agency's address lines; null if none is given. */
function addressOf(provider: string, props: Record<string, string>): string | null {
  const parts =
    provider === "fsa"
      ? [props.AddressLine1, props.AddressLine2, props.AddressLine3, props.AddressLine4, props.PostCode]
      : [
          props["addr:housename"],
          [props["addr:housenumber"], props["addr:street"] ?? props["addr:place"]].filter(Boolean).join(" "),
          props["addr:city"],
          props["addr:postcode"],
        ];
  const seen = new Set<string>();
  const kept = parts
    .map((part) => (part ?? "").trim())
    .filter((part) => {
      if (!part || seen.has(part.toLowerCase())) return false;
      seen.add(part.toLowerCase());
      return true;
    });
  return kept.length > 0 ? kept.join(", ") : null;
}

/** What a record's card says about it, from its source's own fields and nothing else. */
export function foodFacts(provider: string, kind: string, props: Record<string, string>): FoodFactsDto {
  const fsa = provider === "fsa";
  const kinds = fsa ? [] : (classifyFood(props)?.kinds ?? []);
  const isWater = kind === "food:water";
  let water: FoodFactsDto["water"] = null;
  if (isWater) {
    const marked = props.drinking_water;
    const drinkable =
      props.amenity === "drinking_water" && (!marked || marked === "yes")
        ? "Mapped as a drinking water point"
        : marked
          ? (DRINKABLE[marked] ?? `Marked drinking_water=${marked}`)
          : "Not marked as drinkable or not: treat it as untested";
    const seasonal = props.seasonal;
    water = {
      drinkable,
      seasonal:
        !seasonal || seasonal === "no"
          ? seasonal === "no"
            ? "Marked as working all year"
            : null
          : seasonal === "yes"
            ? "Marked as seasonal: it may be turned off for part of the year"
            : `Marked as seasonal (${seasonal})`,
    };
  }
  return {
    alsoKinds: kinds.filter((other) => other !== kind).map((other) => foodKindLabel(other) ?? other),
    address: addressOf(provider, props),
    openingHours: fsa ? null : (props.opening_hours ?? null),
    brand: fsa ? null : (props.brand ?? null),
    businessType: fsa ? (props.BusinessType ?? null) : null,
    water,
    caution: fsa ? FOOD_WORDS.fsa : FOOD_WORDS.osm,
  };
}

// ── Joining the two sources ─────────────────────────────────────────────────

/** Words in a business's name that say what kind of company it is, not which shop. */
const COMPANY_WORDS = new Set(["ltd", "limited", "plc", "llp", "uk", "co", "the", "and", "stores", "store", "t", "a"]);

/** A name as two records of one shop are compared: folded, without what is in brackets, without company words and numbers. */
export function shopNameWords(name: string): string[] {
  return name
    .replace(/\([^)]*\)/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((word) => word && !COMPANY_WORDS.has(word) && !/^\d+$/.test(word));
}

/** Whether two shop names name one shop: the same words, or every word of one, of at least four letters in all, among the other's. */
export function sameShopName(a: string, b: string): boolean {
  const x = shopNameWords(a);
  const y = shopNameWords(b);
  if (x.length === 0 || y.length === 0) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.join("").length < 4) return false;
  const words = new Set(long);
  return short.every((word) => words.has(word));
}

/** How far apart two records of one shop may be: the Agency's position is often its postcode's. */
export const SAME_SHOP_METRES = 150;
/** Further when both give the same postcode. */
export const SAME_SHOP_POSTCODE_METRES = 400;
/** Nearer when they give different postcodes (a big shop on a corner can have two). */
export const SAME_SHOP_OTHER_POSTCODE_METRES = 100;

const postcodeOf = (provider: string, props: Record<string, string>) =>
  (provider === "fsa" ? props.PostCode : props["addr:postcode"])?.replace(/\s+/g, "").toUpperCase() || null;

/**
 * Whether two records from different sources are one shop, conservatively: the names agree
 * (or the Agency's name agrees with the mapped brand) and they are close; nearer than
 * `SAME_SHOP_METRES`; than `SAME_SHOP_POSTCODE_METRES` when both give the same postcode; than
 * `SAME_SHOP_OTHER_POSTCODE_METRES` when they give different ones. When unsure, both are shown.
 */
export function sameShop(
  a: { provider: string; name: string; props: Record<string, string> },
  b: { provider: string; name: string; props: Record<string, string> },
  metres: number,
): boolean {
  const named =
    sameShopName(a.name, b.name) ||
    (a.provider !== "fsa" && a.props.brand ? sameShopName(a.props.brand, b.name) && shopNameWords(b.name).length <= 2 : false) ||
    (b.provider !== "fsa" && b.props.brand ? sameShopName(b.props.brand, a.name) && shopNameWords(a.name).length <= 2 : false);
  if (!named) return false;
  const pa = postcodeOf(a.provider, a.props);
  const pb = postcodeOf(b.provider, b.props);
  if (pa && pb && pa !== pb) return metres <= SAME_SHOP_OTHER_POSTCODE_METRES;
  if (pa && pb && pa === pb) return metres <= SAME_SHOP_POSTCODE_METRES;
  return metres <= SAME_SHOP_METRES;
}
