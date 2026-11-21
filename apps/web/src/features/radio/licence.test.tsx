import fs from "node:fs";
import path from "node:path";
import {
  LICENCE_LINE_STATEMENTS,
  LICENCE_STATEMENTS,
  licenceLine,
  RADIO_RULES,
  type RadioUse,
  radioLicencesMarkdown,
  type Settings,
} from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { LicenceLine } from "./licence";
import LicencesPage from "./licences-page";

function withSettings(settings: Partial<Settings> | null, children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
  if (settings) client.setQueryData(["settings"], { settings });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const USES: RadioUse[] = ["listen", "listen-restricted", "licence-free", "transmit", "listen-and-transmit"];

describe("the licence line", () => {
  it("tells a listen-only household that transmitting needs a licence, with where that comes from", () => {
    withSettings({ "radio.licensed": false }, <LicenceLine use="listen-and-transmit" />);
    expect(screen.getByText("Listening: no licence needed. Transmitting: needs an amateur licence.")).toBeInTheDocument();
    expect(screen.getByText(/UK law and Ofcom; US law and the FCC, read 21 November 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "What needs a radio licence" })).toHaveAttribute("href", "/help/radio-licences");
  });

  it("leaves out only the reminders for a licensed household", () => {
    for (const use of USES) {
      const off = licenceLine(use, { licensed: false })!;
      const on = licenceLine(use, { licensed: true });
      if (off.licenceReminder) expect(on?.text ?? "").not.toMatch(/needs an amateur licence/);
      else expect(on).toEqual(off);
    }
    withSettings({ "radio.licensed": true }, <LicenceLine use="transmit" />);
    expect(screen.queryByText(/needs an amateur licence/)).toBeNull();
  });

  it("is the listen-only wording until the settings say otherwise", () => {
    withSettings(null, <LicenceLine use="transmit" />);
    expect(screen.getByText(/Transmitting: needs an amateur licence/)).toBeInTheDocument();
  });

  it("rests every line on statements that exist, each sourced and dated", () => {
    const ids = new Set(LICENCE_STATEMENTS.map((statement) => statement.id));
    for (const use of USES) for (const id of LICENCE_LINE_STATEMENTS[use]) expect(ids).toContain(id);
    for (const statement of LICENCE_STATEMENTS) {
      expect(statement.rules.map((rule) => rule.country)).toEqual(["GB", "US"]);
      for (const rule of statement.rules) {
        expect(rule.sources.length).toBeGreaterThan(0);
        for (const source of rule.sources) expect(source.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("matches the Help page, which is written from the same statements", () => {
    const file = path.resolve(import.meta.dirname, "../../../../../docs/radio-licences.md");
    expect(fs.readFileSync(file, "utf8")).toBe(radioLicencesMarkdown());
  });
});

describe("licences and band plans", () => {
  it("has every country's figures from a dated source, with band edges in order", () => {
    for (const rules of RADIO_RULES) {
      expect(rules.country).toMatch(/^[A-Z]{2}$/);
      for (const item of [...rules.classes, ...rules.licenceFree]) {
        expect(item.sources.length).toBeGreaterThan(0);
        for (const source of item.sources) expect(source.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      for (const item of rules.classes) for (const band of item.privileges) expect(band.fromKhz).toBeLessThanOrEqual(band.toKhz);
    }
  });

  it("shows the chosen country's classes and licence-free radio", () => {
    withSettings({ "radio.licensed": false }, <LicencesPage />);
    expect(screen.getByRole("heading", { name: "Licences and band plans" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Choose a country" })).toBeInTheDocument();
  });
});
