import type { Source } from "../kit";

/** Where the radio calculators' formulas come from. Read on the date given; docs/tools.md lists them again. */
export const RADIO_SOURCES = {
  arrlDipole: {
    name: "ARRL, “Single band dipoles” (length in feet = 468 ÷ MHz); RSGB, “Your first antenna – the half-wave dipole” (143 ÷ MHz metres)",
    url: "https://www.arrl.org/single-band-dipoles",
    read: "2026-11-16",
  },
  itu525: {
    name: "ITU-R Recommendation P.525-5 (11/2024), Calculation of free-space attenuation, equation 6",
    url: "https://www.itu.int/rec/R-REC-P.525/en",
    read: "2026-11-16",
  },
  ituHorizon: {
    name: "ITU-R Recommendation P.834-9 (12/2017): effective Earth radius, k = 4/3 for a standard atmosphere",
    url: "https://www.itu.int/rec/R-REC-P.834/en",
    read: "2026-11-16",
  },
  iaruR1: {
    name: "IARU Region 1 Technical Recommendation R.1, in the IARU R1 VHF Handbook v10.03 (February 2026), p. 104",
    url: "https://www.iaru-r1.org/wp-content/uploads/2026/02/VHF_Handbook_V10_03_final.pdf",
    read: "2026-11-16",
  },
  ownFigure: { name: "Your cable maker's data sheet" },
  batteryArithmetic: { name: "Arithmetic of a weighted average: no published constant is used" },
} satisfies Record<string, Source>;
