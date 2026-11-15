import { cn } from "@/lib/utils";

/** A hut with a lit window. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-6", className)}>
      <path d="M4 19.5V10.2L12 3.5l8 6.7v9.3Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="9.9" y="11.6" width="4.2" height="4.2" rx="0.8" fill="var(--lamp)" />
    </svg>
  );
}
