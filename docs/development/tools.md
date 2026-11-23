# Tools, for developers

- **Calculator kit**, `apps/web/src/features/tools/kit/`: `NumberField` (unit switch,
  remembered per device under `outpost.tools.*`), `ChoiceField`, `Result` (Copy, Save as a
  page), `HowWorkedOut`, `ToolScreen`, `units.ts` (legal unit definitions), `format.ts`
  (`roughMinutes`), `sheet.ts` (printable PDFs dated by when the guidance was read). Formulas
  are pure functions beside each screen, tested against their sources' worked examples.
- **Power**: formulas in `apps/web/src/features/power/calc/`, device library in
  `packages/shared/src/power-devices-data.ts` (checked by `calc/devices.test.ts`), plans in
  `apps/server/src/modules/power/`. The battery bank drawing is `bank-diagram.ts`, one print-kit
  drawing used on the screen (`bank-diagram-view.tsx`) and in the printed plan; a bank wider than four or
  more than four strings is one box labelled like "8S3P".
- **Compass**: WMM2025 in `packages/shared/src/wmm.ts` (report section 1.2) and
  `wmm-coefficients.ts`; replace it with `node scripts/write-wmm-coefficients.mjs WMM.COF`.
  Grid convergence in `compass.ts`. Tests: `wmm.test.ts`, `compass-norths.test.ts`.
- **Solar clock**: `apps/web/src/features/maps/lib/sun.ts` and `sky.ts`;
  `features/solar-clock/` for recovery, sundial, nocturnal and templates.
- **QR**: an ISO/IEC 18004 encoder in `apps/web/src/features/qr/encoder.ts`, no runtime
  library; tests decode every symbol with jsQR.
- **Network scan**: `apps/server/src/modules/network/` (`subnets.ts`, `scan.ts`,
  `system.ts`). Programs run by `execFile`, never a shell. `OUTPOST_NETWORK_STAND_IN` points
  at a JSON made-up network for tests and the end-to-end suite.
