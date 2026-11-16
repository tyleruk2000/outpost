/**
 * Whose words the templates include, under what terms, and whose pages they only point
 * to (the terms are in packages/shared/src/emergency-templates-data.ts, SOURCE_TERMS_DATA).
 */
import { PLAN_TEMPLATES, type PlanSource, type SourceTerms, sourceById, termsOf } from "@outpost/shared";

/** Every source any template uses, by a line or a pointer. */
export const templateSources = (): PlanSource[] =>
  [
    ...new Set(
      PLAN_TEMPLATES.flatMap((template) => [...template.steps, ...template.supplies, ...template.where].map((line) => line.source)),
    ),
  ]
    .map((id) => sourceById(id))
    .filter((source): source is PlanSource => !!source);

/** Which publishers' words a template includes, and under what terms; and which are only pointed to. */
export function TemplateLicences({ sources }: { sources: PlanSource[] }) {
  const quoted = new Map<string, { terms: SourceTerms; publishers: Set<string> }>();
  const pointed = new Set<string>();
  for (const source of sources) {
    const terms = termsOf(source);
    if (!terms) continue;
    if (!terms.cleared) {
      pointed.add(source.publisher);
      continue;
    }
    const entry = quoted.get(terms.licence) ?? { terms, publishers: new Set<string>() };
    entry.publishers.add(source.publisher);
    quoted.set(terms.licence, entry);
  }
  return (
    <div className="mb-4 grid max-w-[65ch] gap-1.5 text-small text-ink-muted" data-testid="template-licences">
      {[...quoted.values()].map(({ terms, publishers }) => (
        <p key={terms.id}>
          Words from {[...publishers].join(", ")}, under {terms.licence}. {terms.attribution}
        </p>
      ))}
      {pointed.size > 0 ? (
        <p>
          {[...pointed].join(", ")} {pointed.size === 1 ? "has" : "have"} not given permission for {pointed.size === 1 ? "its" : "their"}{" "}
          words to be copied, so the templates point to {pointed.size === 1 ? "its pages" : "their pages"} instead of quoting them.
        </p>
      ) : null}
    </div>
  );
}
