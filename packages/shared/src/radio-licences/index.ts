/**
 * The countries whose radio rules Outpost has read (see ../radio-licences.ts), and the
 * main ones it has not, with the regulator to ask. A new country is one file here and one
 * line in RADIO_RULES.
 */
import type { CountryRadioRules, RadioRulesNotRead } from "../radio-licences.ts";
import { RULES_AU } from "./au.ts";
import { RULES_CA } from "./ca.ts";
import { RULES_DE } from "./de.ts";
import { RULES_FR } from "./fr.ts";
import { RULES_GB } from "./gb.ts";
import { RULES_IE } from "./ie.ts";
import { RULES_NL } from "./nl.ts";
import { RULES_NZ } from "./nz.ts";
import { RULES_US } from "./us.ts";

export const RADIO_RULES: readonly CountryRadioRules[] = [
  RULES_GB,
  RULES_IE,
  RULES_US,
  RULES_CA,
  RULES_AU,
  RULES_NZ,
  RULES_DE,
  RULES_NL,
  RULES_FR,
];

/** Not read yet: the regulator's own pages are where to look. */
export const RADIO_RULES_NOT_READ: readonly RadioRulesNotRead[] = [
  {
    country: "ES",
    regulator: "Ministerio para la Transformación Digital (SETID)",
    url: "https://avancedigital.mineco.gob.es/",
    reason: "Not read yet.",
  },
  { country: "IT", regulator: "Ministero delle Imprese e del Made in Italy", url: "https://www.mimit.gov.it/", reason: "Not read yet." },
  { country: "BE", regulator: "BIPT", url: "https://www.bipt.be/", reason: "Not read yet." },
  { country: "CH", regulator: "OFCOM (Switzerland)", url: "https://www.bakom.admin.ch/", reason: "Not read yet." },
  { country: "AT", regulator: "Fernmeldebehörde (BMF)", url: "https://www.bmf.gv.at/", reason: "Not read yet." },
  { country: "SE", regulator: "Post- och telestyrelsen (PTS)", url: "https://www.pts.se/", reason: "Not read yet." },
  { country: "NO", regulator: "Nasjonal kommunikasjonsmyndighet (Nkom)", url: "https://www.nkom.no/", reason: "Not read yet." },
  { country: "DK", regulator: "Styrelsen for Dataforsyning og Infrastruktur", url: "https://sdfi.dk/", reason: "Not read yet." },
  { country: "FI", regulator: "Traficom", url: "https://www.traficom.fi/", reason: "Not read yet." },
  { country: "PL", regulator: "Urząd Komunikacji Elektronicznej (UKE)", url: "https://www.uke.gov.pl/", reason: "Not read yet." },
  { country: "PT", regulator: "ANACOM", url: "https://www.anacom.pt/", reason: "Not read yet." },
  { country: "ZA", regulator: "ICASA", url: "https://www.icasa.org.za/", reason: "Not read yet." },
  {
    country: "JP",
    regulator: "Ministry of Internal Affairs and Communications",
    url: "https://www.tele.soumu.go.jp/",
    reason: "Not read yet.",
  },
  { country: "IN", regulator: "Wireless Planning and Coordination Wing (WPC)", url: "https://dot.gov.in/", reason: "Not read yet." },
  { country: "BR", regulator: "Anatel", url: "https://www.gov.br/anatel/", reason: "Not read yet." },
  {
    country: "MX",
    regulator: "Agencia de Transformación Digital y Telecomunicaciones",
    url: "https://www.gob.mx/",
    reason: "Not read yet.",
  },
];

export const rulesFor = (country: string | null | undefined): CountryRadioRules | null =>
  RADIO_RULES.find((rules) => rules.country === country) ?? null;
