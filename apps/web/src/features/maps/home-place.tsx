/**
 * Said where a screen needs the current household's home and it has none: one line, with
 * a link to Maps (for the home icon) and to the Households page. Kept under this name for
 * the screens that import it; the words are `NoHome` (features/households/home.tsx).
 */
import { NoHome } from "@/features/households/home";

export function NoHomePlace({ className }: { className?: string }) {
  return <NoHome className={className} />;
}
