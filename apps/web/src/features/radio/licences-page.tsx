/**
 * Radio → Licences and band plans (outpost-qylj): for the country Home is in, or another
 * one chosen, what each class of amateur licence may transmit on and at what power, and
 * the licence-free services. All of it is bundled (packages/shared/src/radio-licences/),
 * each figure with the regulator's document and the day it was read; nothing is fetched.
 */
import {
  type CountryRadioRules,
  checkedOn,
  type FrequencySource,
  formatPrivilegeRange,
  placeName,
  RADIO_RULES,
  RADIO_RULES_NOT_READ,
  rulesFor,
} from "@outpost/shared";
import { Link, useSearchParams } from "react-router";
import { Disclosure, EmptyState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { useHome } from "@/features/households/home";
import { LicenceLine, useRadioLicence } from "./licence";

const linkClass = "text-primary underline underline-offset-2";

function Sources({ sources }: { sources: readonly FrequencySource[] }) {
  const unique = [...new Map(sources.map((source) => [source.url + source.title, source])).values()];
  return (
    <ul className="mt-2 grid gap-1 text-small text-ink-muted">
      {unique.map((source) => (
        <li key={source.url + source.title}>
          {source.publisher}:{" "}
          <a href={source.url} className={linkClass} rel="noreferrer" target="_blank">
            {source.title}
          </a>{" "}
          (read {checkedOn(source.checked)})
        </li>
      ))}
    </ul>
  );
}

/** The latest day any figure of a country was read. */
export function rulesChecked(rules: CountryRadioRules): string {
  return (
    [...rules.classes.flatMap((item) => item.sources), ...rules.licenceFree.flatMap((item) => item.sources)]
      .map((source) => source.checked)
      .sort()
      .at(-1) ?? ""
  );
}

function CountryRules({ rules }: { rules: CountryRadioRules }) {
  const licence = useRadioLicence();
  return (
    <>
      <p className="max-w-[70ch] text-body text-ink">{rules.summary}</p>
      <p className="mt-2 text-small text-ink-muted">
        From {rules.regulator}'s own documents, read {checkedOn(rulesChecked(rules))}. Rules change: the{" "}
        <a href={rules.regulatorUrl} className={linkClass} rel="noreferrer" target="_blank">
          regulator's page
        </a>{" "}
        has the version in force. General information, not legal advice.
      </p>

      <Section
        title="Licence-free radio"
        description="What anyone may use without an amateur licence, within these limits."
        className="mt-8"
      >
        {rules.licenceFree.length === 0 ? (
          <p className="text-small text-ink-muted">Not read for this country: see what could not be read, below.</p>
        ) : (
          <Rows className="border-y border-border">
            {rules.licenceFree.map((service) => (
              <li key={service.name} className="py-3">
                <h3 className="text-lead text-ink">{service.name}</h3>
                <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-small sm:grid-cols-[8rem_1fr]">
                  <dt className="text-ink-muted">Frequencies</dt>
                  <dd className="text-ink tabular">{service.frequencies}</dd>
                  <dt className="text-ink-muted">Power</dt>
                  <dd className="text-ink tabular">{service.power}</dd>
                  <dt className="text-ink-muted">Licence</dt>
                  <dd className="text-ink">{service.licence}</dd>
                </dl>
                {service.note ? <p className="mt-1 text-small text-ink-muted">{service.note}</p> : null}
                {service.frequencyEntryId ? (
                  <p className="mt-1 text-small">
                    <Link to={`/radio/frequencies?kind=licence-free&place=${rules.country}`} className={linkClass}>
                      Its channels, under Frequencies to listen to
                    </Link>
                  </p>
                ) : null}
                <Disclosure summary="Where this comes from" className="mt-1">
                  <Sources sources={service.sources} />
                </Disclosure>
              </li>
            ))}
          </Rows>
        )}
      </Section>

      <Section
        title="Amateur licences"
        description={
          licence.licensed
            ? "What each class may transmit on, and at what power."
            : "What each class of licence would let its holder transmit on. Listening to any of these bands needs no licence."
        }
        className="mt-8"
      >
        {rules.classes.map((item) => (
          <Disclosure key={item.id} summary={`${item.name}: ${item.privileges.length} bands`} className="border-b border-border py-2">
            {item.how ? <p className="text-small text-ink">{item.how}</p> : null}
            <Table label={`Bands and power for the ${item.name} licence`} stack className="mt-2">
              <TableHead>
                <Tr>
                  <Th>Band</Th>
                  <Th>Frequencies</Th>
                  <Th>Most power</Th>
                  <Th>Conditions</Th>
                </Tr>
              </TableHead>
              <tbody>
                {item.privileges.map((band) => (
                  <Tr key={`${band.fromKhz}-${band.toKhz}-${band.power}`} className="last:border-b-0">
                    <Td label="Band" className="whitespace-nowrap">
                      {band.band}
                    </Td>
                    <Td label="Frequencies" className="tabular sm:whitespace-nowrap">
                      {formatPrivilegeRange(band.fromKhz, band.toKhz)}
                    </Td>
                    <Td label="Most power" className="tabular">
                      {band.power}
                    </Td>
                    <Td label="Conditions" className="text-ink-muted">
                      {band.note ?? null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {item.notes?.length ? (
              <ul className="mt-2 grid list-disc gap-1 pl-5 text-small text-ink-muted wrap-anywhere">
                {item.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
            <Sources sources={item.sources} />
          </Disclosure>
        ))}
      </Section>

      {rules.notRead?.length ? (
        <Section title="Not read" description="What Outpost could not confirm from the regulator's own documents." className="mt-8">
          <ul className="grid list-disc gap-1 pl-5 text-small text-ink-muted wrap-anywhere">
            {rules.notRead.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

export default function LicencesPage() {
  const [params, setParams] = useSearchParams();
  const current = useHome();
  const home = current.country;
  const whose = current.several && current.household ? current.household.name : "Home";
  const chosen = params.get("country") ?? (home && rulesFor(home) ? home : null);
  const rules = rulesFor(chosen);
  const notRead = RADIO_RULES_NOT_READ.find((entry) => entry.country === (chosen ?? home));
  const options = RADIO_RULES.map((item) => ({ value: item.country, label: placeName(item.country) }));

  return (
    <Page width="wide">
      <PageHeader
        title="Licences and band plans"
        description="What each class of amateur licence may use, and the licence-free radio anyone may use, from each country's regulator. It comes with Outpost; nothing is fetched."
      />
      <LicenceLine use="listen-and-transmit" className="mb-6" />

      <Field label="Country" className="mb-2 max-w-sm">
        {(ids) => (
          <Select
            id={ids.id}
            value={rules?.country}
            placeholder="Choose a country"
            onChange={(country) => setParams({ country }, { replace: true })}
            options={options}
          />
        )}
      </Field>
      <p className="mb-6 text-small text-ink-muted">
        {home
          ? params.get("country") === null && rules
            ? `${placeName(home)}, where ${whose} is.`
            : `${whose} is in ${placeName(home)}.`
          : current.isPending
            ? null
            : "Give the household a home on the Households page, or mark a saved place with the home icon on the Maps screen, and its country is chosen here."}
      </p>

      {rules ? (
        <CountryRules rules={rules} />
      ) : (
        <EmptyState
          title={notRead ? `${placeName(notRead.country)} has not been read yet` : "Choose a country"}
          action={
            notRead ? (
              <a href={notRead.url} className={linkClass} rel="noreferrer" target="_blank">
                {notRead.regulator}
              </a>
            ) : (
              <ul aria-label="Countries read" className="flex flex-wrap gap-2">
                {options.map((option) => (
                  <li key={option.value}>
                    <Link
                      to={`?country=${option.value}`}
                      replace
                      className="inline-flex min-h-9 items-center rounded-control border border-border-strong bg-page px-3 text-small text-ink transition-colors duration-(--duration-fast) hover:bg-surface-strong max-md:min-h-11 md:pointer-coarse:min-h-11"
                    >
                      {option.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )
          }
        >
          {notRead
            ? `Outpost has not read ${notRead.regulator}'s documents, so it says nothing about the rules there. The regulator's own pages are the place to look.`
            : `The rules of ${RADIO_RULES.length} countries are here: pick one, or choose it above. Others are listed below.`}
        </EmptyState>
      )}

      <Section title="Countries not read yet" description="Ask these regulators directly." className="mt-10">
        <Notice className="mb-3">Only the countries in the list above have been read from their regulators' documents.</Notice>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1 text-small wrap-anywhere sm:grid-cols-2">
          {RADIO_RULES_NOT_READ.map((entry) => (
            <li key={entry.country}>
              {placeName(entry.country)}:{" "}
              <a href={entry.url} className={linkClass} rel="noreferrer" target="_blank">
                {entry.regulator}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}
