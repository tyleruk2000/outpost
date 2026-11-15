import { formatBytes, type Settings } from "@outpost/shared";
import { Monitor, Moon, Sun } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { ErrorState, Page, PageHeader } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Segmented, Skeleton, Switch } from "@/components/ui/misc";
import { useSettings, useSystem, useUpdateSettings } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { cn, plural } from "@/lib/utils";
import { BackupSection } from "./backup-section";
import { SettingRow, SettingsSection, TextSetting } from "./parts";
import { SemanticSection } from "./semantic-section";

/** A number field that saves when the person leaves it or presses Enter, and reverts if invalid. */
function NumberSetting({
  id,
  value,
  min,
  max,
  disabled,
  onSave,
  unit,
  decimals = false,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onSave: (value: number) => void;
  unit?: string;
  /** Accept one decimal place (a weight such as 1.5) instead of whole numbers only. */
  decimals?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const typed = Number(draft);
    const parsed = decimals ? Math.round(typed * 10) / 10 : typed;
    if (draft.trim() === "" || !Number.isFinite(typed) || (!decimals && !Number.isInteger(typed)) || parsed < min || parsed > max) {
      return setDraft(String(value));
    }
    if (parsed !== typed) setDraft(String(parsed));
    if (parsed !== value) onSave(parsed);
  };
  return (
    <span className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        inputMode={decimals ? "decimal" : "numeric"}
        step={decimals ? 0.1 : 1}
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
        className="tabular w-24 text-right"
      />
      {unit ? <span className="w-16 text-small text-ink-muted">{unit}</span> : null}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border py-2 last:border-b-0">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="tabular text-right text-small text-ink">{value}</dd>
    </div>
  );
}

export default function SettingsPage({ extraSections }: { extraSections?: ReactNode }) {
  const settings = useSettings();
  const system = useSystem();
  const update = useUpdateSettings();
  const { theme, setTheme, reading, setReading } = useTheme();
  const disabled = update.isPending;
  const save = <K extends keyof Settings>(key: K, value: Settings[K]) => update.mutate({ [key]: value } as Partial<Settings>);
  const s = settings.data;
  const info = system.data;

  // A link such as /settings#semantic-title lands on that section once it has been drawn.
  const { hash } = useLocation();
  const drawn = settings.isSuccess;
  useEffect(() => {
    if (!hash || !drawn) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [hash, drawn]);

  return (
    <Page>
      <PageHeader title="Settings" />

      <SettingsSection id="appearance" title="Appearance" description="Saved in this browser, so each device can have its own.">
        <SettingRow
          label="Theme"
          control={
            <Segmented
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "system", label: "System", icon: <Monitor /> },
                { value: "light", label: "Light", icon: <Sun /> },
                { value: "dark", label: "Dark", icon: <Moon /> },
              ]}
            />
          }
        />
        <SettingRow
          label="Reading typeface"
          hint="Used for pages and document text."
          control={
            <Segmented
              label="Reading typeface"
              value={reading}
              onChange={setReading}
              options={[
                { value: "serif", label: <span className="font-serif">Serif</span> },
                { value: "sans", label: "Sans" },
              ]}
            />
          }
        />
      </SettingsSection>

      {settings.isPending ? (
        <div className="grid gap-4 border-t border-border py-8" aria-busy>
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : settings.isError || !s ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      ) : (
        <>
          <SettingsSection id="downloads" title="Downloads" description="How hard Outpost works when fetching collections and maps.">
            <SettingRow
              htmlFor="dl-concurrency"
              label="Downloads at once"
              hint="More is faster on a good connection. On a Raspberry Pi or a slow link, 1 or 2 keeps things responsive."
              control={
                <NumberSetting
                  id="dl-concurrency"
                  value={s["downloads.concurrency"]}
                  min={1}
                  max={8}
                  disabled={disabled}
                  onSave={(value) => save("downloads.concurrency", value)}
                />
              }
            />
            <SettingRow
              htmlFor="dl-attempts"
              label="Attempts before giving up"
              hint="Failed downloads wait longer between each attempt, and resume from where they stopped."
              control={
                <NumberSetting
                  id="dl-attempts"
                  value={s["downloads.maxAttempts"]}
                  min={1}
                  max={20}
                  disabled={disabled}
                  onSave={(value) => save("downloads.maxAttempts", value)}
                />
              }
            />
          </SettingsSection>

          <SettingsSection
            id="indexing"
            title="Reading documents"
            description="Text is pulled out of documents so they can be searched. Changes apply to documents added or re-read from now on."
          >
            <SettingRow
              htmlFor="ix-concurrency"
              label="Documents processed at once"
              hint="Each one uses a processor core and some memory while it runs."
              control={
                <NumberSetting
                  id="ix-concurrency"
                  value={s["indexing.concurrency"]}
                  min={1}
                  max={8}
                  disabled={disabled}
                  onSave={(value) => save("indexing.concurrency", value)}
                />
              }
            />
            <SettingRow
              htmlFor="ix-pages"
              label="Most pages read from one PDF"
              hint="Very long PDFs are read up to this page. Use 0 for no limit."
              control={
                <NumberSetting
                  id="ix-pages"
                  value={s["indexing.maxPdfPages"]}
                  min={0}
                  max={100000}
                  disabled={disabled}
                  onSave={(value) => save("indexing.maxPdfPages", value)}
                  unit="pages"
                />
              }
            />
            <SettingRow
              htmlFor="ix-chunk"
              label="Passage length"
              hint="Text is split into passages of about this size for search results and future question answering."
              control={
                <NumberSetting
                  id="ix-chunk"
                  value={s["indexing.chunkSize"]}
                  min={300}
                  max={4000}
                  disabled={disabled}
                  onSave={(value) => save("indexing.chunkSize", value)}
                  unit="characters"
                />
              }
            />
            <SettingRow
              htmlFor="ix-overlap"
              label="Passage overlap"
              hint="How much neighbouring passages share, so a sentence across a boundary is still found whole."
              control={
                <NumberSetting
                  id="ix-overlap"
                  value={s["indexing.chunkOverlap"]}
                  min={0}
                  max={800}
                  disabled={disabled}
                  onSave={(value) => save("indexing.chunkOverlap", value)}
                  unit="characters"
                />
              }
            />
          </SettingsSection>

          <SettingsSection id="search" title="Search">
            <SettingRow
              label="Search inside reference collections"
              hint="Includes articles from installed collections such as Wikipedia in results. Turn off to search only your own documents and pages."
              control={
                <Switch
                  checked={s["search.includeReference"]}
                  disabled={disabled}
                  onCheckedChange={(value) => save("search.includeReference", value)}
                  aria-label="Search inside reference collections"
                />
              }
            />
            <SettingRow
              htmlFor="search-keyword-weight"
              label="Weight of matching words"
              hint="How much the search by words counts when the two searches are combined. Only matters while search by meaning is on. 0 leaves it out."
              control={
                <NumberSetting
                  id="search-keyword-weight"
                  value={s["search.hybrid.keywordWeight"]}
                  min={0}
                  max={10}
                  decimals
                  disabled={disabled}
                  onSave={(value) => save("search.hybrid.keywordWeight", value)}
                />
              }
            />
            <SettingRow
              htmlFor="search-semantic-weight"
              label="Weight of matching meaning"
              hint="How much the search by meaning counts. Raise it if results that share your words but miss your point rank too high."
              control={
                <NumberSetting
                  id="search-semantic-weight"
                  value={s["search.hybrid.semanticWeight"]}
                  min={0}
                  max={10}
                  decimals
                  disabled={disabled}
                  onSave={(value) => save("search.hybrid.semanticWeight", value)}
                />
              }
            />
            <SettingRow
              htmlFor="search-rrf-k"
              label="Evenness of combining"
              hint={
                <>
                  The constant in the combining formula. A larger number makes first place count for less against tenth; 60 is the usual
                  value.{" "}
                  <Link to="/search/how-it-works#fig-formula" className="text-primary underline underline-offset-2">
                    Try the three settings on a question of your own
                  </Link>{" "}
                  before changing them.
                </>
              }
              control={
                <NumberSetting
                  id="search-rrf-k"
                  value={s["search.hybrid.rrfK"]}
                  min={1}
                  max={1000}
                  disabled={disabled}
                  onSave={(value) => save("search.hybrid.rrfK", value)}
                />
              }
            />
          </SettingsSection>

          <SemanticSection settings={s} disabled={disabled} save={save} />

          <SettingsSection
            id="maps"
            title="Maps"
            description="Where map regions are fetched from when you download them. The defaults suit almost everyone."
          >
            <SettingRow
              htmlFor="maps-source"
              label="Map source"
              hint="Address of a planet archive in PMTiles form. Leave empty to use the newest Protomaps build of OpenStreetMap."
              control={
                <TextSetting
                  id="maps-source"
                  value={s["maps.tileSource"]}
                  disabled={disabled}
                  onSave={(value) => save("maps.tileSource", value)}
                  placeholder="Newest Protomaps build"
                  mono
                />
              }
            />
            <SettingRow
              htmlFor="maps-terrain"
              label="Terrain source"
              hint="Used for hill shading when you choose to download terrain with a region."
              control={
                <TextSetting
                  id="maps-terrain"
                  value={s["maps.terrainSource"]}
                  disabled={disabled}
                  onSave={(value) => save("maps.terrainSource", value)}
                  mono
                />
              }
            />
          </SettingsSection>

          {extraSections}

          <BackupSection />
        </>
      )}

      <SettingsSection
        id="access"
        title="Who can use this library"
        description="Set when the server starts, not from this screen, so that nobody on the network can open Outpost up from a browser."
      >
        <dl>
          <Fact label="Reachable from" value={info?.lanAccess ? "Every device on your local network" : "This device only"} />
          <Fact label="Accounts" value="None. Anyone who can reach Outpost can read, add, change and delete." />
        </dl>
        <p className="text-small text-ink-muted">
          {info?.lanAccess
            ? "Outpost is shared with your network and has no sign-in, so use it only on a network where you trust everyone, such as your home. Do not forward its port to the internet."
            : "To let phones and other computers on your network use this library, set "}
          {info?.lanAccess ? null : (
            <>
              <span className="font-mono text-[0.8125rem] text-ink">OUTPOST_LAN_ACCESS=true</span> in the{" "}
              <span className="font-mono text-[0.8125rem] text-ink">.env</span> file and restart. There is no sign-in: everyone on that
              network will be able to use and change it.
            </>
          )}
        </p>
      </SettingsSection>

      <SettingsSection id="about" title="This installation" description="What Outpost is using on this device right now.">
        {info ? (
          <dl>
            <Fact label="Version" value={`${info.version}${info.portable ? ", portable" : ""}`} />
            <Fact label="Running on" value={`${info.platform}, Node ${info.node.replace(/^v/, "")}`} />
            <Fact
              label="Memory used by Outpost"
              value={`${formatBytes(info.resources.processRssBytes)} of ${formatBytes(info.resources.systemTotalBytes)}`}
            />
            <Fact
              label="Processor load (1 min)"
              value={`${info.resources.loadAverage[0]?.toFixed(2)} across ${plural(info.resources.cpuCount, "core")}`}
            />
            <Fact label="Database size" value={formatBytes(info.resources.databaseBytes)} />
            <Fact
              label="Background work"
              value={
                Object.keys(info.queues).length === 0
                  ? "Nothing waiting"
                  : Object.entries(info.queues)
                      .map(([queue, counts]) => `${queue}: ${counts.running} running, ${counts.queued} waiting`)
                      .join("; ")
              }
            />
          </dl>
        ) : (
          <div className={cn("grid gap-2")} aria-busy>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        )}
        <p className="text-small text-ink-muted">
          Outpost sends no telemetry and makes no network requests unless you start a download or refresh the catalogue.
        </p>
      </SettingsSection>
    </Page>
  );
}
