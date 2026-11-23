/**
 * "Household: Caravan", in the sidebar and the phone's More sheet, only when there are
 * two or more. There is one current household for the whole Outpost, so changing it
 * here changes it on every device, and the menu says so.
 */
import { ChevronsUpDown, House } from "lucide-react";
import { Link } from "react-router";
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { settle } from "./data";
import { HOUSEHOLDS_PATH } from "./for-household";
import { useHousehold, useSetCurrentHousehold } from "./use-household";

export const SWITCHER_NOTE = "Changes it for everyone using this Outpost.";

export function HouseholdSwitcher({
  collapsed,
  onPicked,
  className,
}: {
  /** The sidebar is narrow: an icon only, its name in a tooltip. */
  collapsed?: boolean;
  /** After a household is chosen or the page opened (the More sheet closes). */
  onPicked?: () => void;
  className?: string;
}) {
  const { data } = useHousehold();
  const setCurrent = useSetCurrentHousehold();
  if (!data?.several) return null;
  const name = data.household.name;
  const trigger = (
    <MenuTrigger
      aria-label={`Household: ${name}. Change the current household`}
      className={cn(
        "flex min-h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-[0.9375rem] text-spine-ink-muted transition-colors hover:bg-spine-raised hover:text-spine-ink focus-visible:outline-spine-ink max-md:min-h-11 md:pointer-coarse:min-h-11",
        collapsed && "justify-center px-0",
        className,
      )}
    >
      <House aria-hidden className="size-[17px] shrink-0" strokeWidth={1.6} />
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate">
            Household: <span className="text-spine-ink">{name}</span>
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0" strokeWidth={1.6} />
        </>
      )}
    </MenuTrigger>
  );
  return (
    <Menu>
      {collapsed ? (
        <Tooltip label={`Household: ${name}`} side="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <MenuContent align="start" className="max-w-[min(20rem,calc(100vw-2rem))]">
        <p className="px-2.5 pt-1.5 pb-1 text-small text-ink-muted">{SWITCHER_NOTE}</p>
        <MenuRadioGroup
          value={data.household.id}
          onValueChange={(id) => {
            if (id !== data.household.id) settle(setCurrent, { id });
            onPicked?.();
          }}
        >
          {data.households.map((household) => (
            <MenuRadioItem key={household.id} value={household.id}>
              {household.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem asChild onSelect={() => onPicked?.()}>
          <Link to={HOUSEHOLDS_PATH}>Households and people</Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
