/**
 * What a food and supplies record's card says about the place: its address, opening hours
 * and brand as its source gives them, whether water is marked drinkable or seasonal, and
 * the caution that a mark is not a promise that a place is open, stocked or still there.
 * Nothing is added that the source does not say.
 */
import { FOOD_WORDS, type FoodFactsDto, type ReferenceSourceInfo } from "@outpost/shared";
import { Fact } from "@/features/maps/ui";
import { formatDate } from "@/lib/utils";

export function FoodFacts({ food, source }: { food: FoodFactsDto; source: ReferenceSourceInfo }) {
  const fetched = formatDate(source.retrievedAt);
  const hasFacts = food.address || food.openingHours || food.brand || food.businessType || food.water;
  return (
    <div className="mt-2 border-t border-border pt-1">
      {hasFacts ? (
        <dl>
          {food.water ? <Fact label="Drinking water">{food.water.drinkable}</Fact> : null}
          {food.water?.seasonal ? <Fact label="Seasonal">{food.water.seasonal}</Fact> : null}
          {food.address ? <Fact label="Address">{food.address}</Fact> : null}
          {food.openingHours ? (
            <Fact label="Opening hours" mono>
              {food.openingHours.split(/;\s*/).map((rule) => (
                <span key={rule} className="block">
                  {rule}
                </span>
              ))}
            </Fact>
          ) : null}
          {food.brand ? <Fact label="Brand">{food.brand}</Fact> : null}
          {food.businessType ? <Fact label="Registered as">{food.businessType}</Fact> : null}
        </dl>
      ) : (
        <p className="py-1 text-small text-ink-muted">Its source gives no address{food.water ? "" : " or opening hours"}.</p>
      )}
      {food.openingHours ? (
        <p className="text-small text-ink-muted">Opening hours as mapped, fetched {fetched}. They may have changed.</p>
      ) : null}
      <p className="mt-2 rounded-control bg-surface px-2.5 py-2 text-small text-ink">
        {food.caution} {FOOD_WORDS.emergency}
      </p>
    </div>
  );
}
