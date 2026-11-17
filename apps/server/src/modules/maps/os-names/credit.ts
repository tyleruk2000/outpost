/**
 * The credits the map shows for installed place names. GeoNames asks for its name and
 * licence; Ordnance Survey for the statement that comes with each edition of OS Open
 * Names ("Contains OS data © Crown copyright and database right 2026"), with the Open
 * Government Licence named. Each is shown only while its data is installed.
 */
import { type MapAttribution, OS_NAMES_DATASET } from "@outpost/shared";
import { ATTRIBUTIONS } from "../source.ts";
import { standardStatement } from "./convert.ts";

export const OS_NAMES_LICENCE = "Open Government Licence v3.0";
export const OS_NAMES_LICENCE_URL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

/** The credit for an installed edition of OS Open Names, from its statement. */
export function osNamesAttribution(statement: string): MapAttribution {
  return {
    name: "Ordnance Survey",
    html: `${escapeHtml(statement)} (<a href="${OS_NAMES_LICENCE_URL}">OGL v3.0</a>)`,
    license: OS_NAMES_LICENCE,
    url: "https://www.ordnancesurvey.co.uk/opendata",
  };
}

/** The credits for the place names installed: GeoNames once if any of its files is, and each OS edition's statement. */
export function placesAttributions(rows: Array<{ meta: Record<string, unknown>; attribution: string | null; version: string | null }>) {
  const credits: MapAttribution[] = [];
  if (rows.some((row) => row.meta.dataset !== OS_NAMES_DATASET)) credits.push(ATTRIBUTIONS.places);
  const statements = new Set(
    rows
      .filter((row) => row.meta.dataset === OS_NAMES_DATASET)
      .map((row) => row.attribution ?? standardStatement(Number((row.version ?? "").slice(0, 4)) || new Date().getFullYear())),
  );
  for (const statement of statements) credits.push(osNamesAttribution(statement));
  return credits;
}
