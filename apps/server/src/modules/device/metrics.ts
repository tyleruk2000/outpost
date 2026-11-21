/**
 * Outpost's figures in Prometheus's text format, for /metrics.
 *
 * The format, as read on 21 November 2026 from
 * https://prometheus.io/docs/instrumenting/exposition_formats/: UTF-8, lines ending in a
 * line feed (the last one too), `# HELP` and `# TYPE` once per name and before its
 * samples, every sample of a name together, label values with `\`, `"` and line feeds
 * escaped, and a histogram as `_bucket` samples with an `le` label in increasing order
 * ending in `+Inf` (equal to `_count`), then `_sum` and `_count`. Sent as
 * `text/plain; version=0.0.4`.
 */
import { REQUEST_BUCKETS, type RouteTimes } from "./vitals.ts";

export const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

type Labels = Record<string, string>;

const escapeLabel = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
const escapeHelp = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");

function labelText(labels: Labels | undefined): string {
  const entries = Object.entries(labels ?? {});
  return entries.length === 0 ? "" : `{${entries.map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(",")}}`;
}

const number = (value: number) => (Number.isFinite(value) ? String(value) : value > 0 ? "+Inf" : value < 0 ? "-Inf" : "NaN");

export class MetricsText {
  private readonly lines: string[] = [];
  private readonly named = new Set<string>();

  /** One gauge or counter with its samples. A name given twice is an error in the format, so it is refused here. */
  add(name: string, type: "gauge" | "counter", help: string, samples: Array<{ labels?: Labels; value: number }>): this {
    this.heading(name, type, help);
    for (const sample of samples) this.lines.push(`${name}${labelText(sample.labels)} ${number(sample.value)}`);
    return this;
  }

  /** Request times by route, as a histogram. */
  requestTimes(name: string, help: string, routes: RouteTimes[]): this {
    this.heading(name, "histogram", help);
    for (const route of routes) {
      const labels = { method: route.method, route: route.route };
      for (const [index, bound] of REQUEST_BUCKETS.entries())
        this.lines.push(`${name}_bucket${labelText({ ...labels, le: String(bound) })} ${route.buckets[index] ?? 0}`);
      this.lines.push(`${name}_bucket${labelText({ ...labels, le: "+Inf" })} ${route.count}`);
      this.lines.push(`${name}_sum${labelText(labels)} ${number(route.sumSeconds)}`);
      this.lines.push(`${name}_count${labelText(labels)} ${route.count}`);
    }
    return this;
  }

  toString(): string {
    return `${this.lines.join("\n")}\n`;
  }

  private heading(name: string, type: string, help: string) {
    if (this.named.has(name)) throw new Error(`${name} is already in the metrics`);
    this.named.add(name);
    this.lines.push(`# HELP ${name} ${escapeHelp(help)}`, `# TYPE ${name} ${type}`);
  }
}
