# HF propagation and Morse: for developers

Routes are in [api.md](../api.md#hf-propagation). What a person sees is in
[hf-propagation.md](../hf-propagation.md).

## The VOACAP engine

- **hfcast** (VOACAP 16.1207W translated to Rust, Apache-2.0, `Compatible` tier only) compiled
  to WebAssembly: `engines/voacap/engine/voacap.wasm` (564 kB), one file for every platform.
- Runs in a worker thread (`modules/propagation/voacap/`), started on first use, ended after five
  idle minutes. System calls are answered from memory (`voacap/wasi.ts`); it sees only the data
  files it is handed. Engine and data are checked against SHA-256 checksums on every load; a set
  with any file missing or altered is refused.
- Everything else knows only the interface in `engine.ts` (`circuit`, `ionosphere`, `listing`,
  `describe`, `datasets`), so the engine can be replaced. P.533 sits behind its own module
  (`modules/propagation/p533/`).
- Answers are cached in the database under a key of the question as the engine reads it the sunspot number, the solar
  table's checksum, the engine's checksum and the data version. The 300 most recently used
  predictions are kept; coverage maps and plan matrices are counted apart (eight unpinned kept,
  plus any saved or belonging to a plan). A sunspot number found from an foF2 (a search of ten or
  eleven engine calls) is remembered in memory while the server runs.
- **Checked against the Fortran original** (voacapl `c12a98b`, gfortran 12.2.0 with
  `-ffp-contract=off`): three reference circuits print identically, every character, on macOS
  arm64 and in linux/arm64 and linux/amd64 containers. The listings are in
  `apps/server/test/fixtures/propagation/` and the tests hold the engine to them with no
  tolerance.
- **Speed** (Apple M2 Max): first answer 19 ms, one day on nine bands 4.6 ms, a coverage cell
  2.5 ms. `node apps/server/src/cli/bench-propagation.ts` measures any machine.
- **Rebuild**: `rustup toolchain install 1.97.1 --profile minimal --target wasm32-wasip1`, then
  `node scripts/build-hf-engine.mjs` (or `--check` to compare with what is committed). It applies
  `engines/voacap/wasm.patch` (a test harness only, no arithmetic) and gives the committed file
  byte for byte.

## Data

- VOACAP's coefficients (15 files, 559,336 bytes) are listed with checksums in
  `engines/voacap/coefficients.json` and kept in `<data dir>/propagation/voacap-coefficients/`
  with `installed.json`. On start, a matching copy in the old app folder
  (`engines/voacap/data/itshfbc/coeffs/`) or `<data dir>/propagation/voacap-data/itshfbc/` is
  adopted with no download.
- Tests need the real files: `node scripts/fetch-voacap-data.mjs --cache` fills
  `engines/voacap/.cache/` (git-ignored). Without it the engine tests are skipped by name.
- Not offered: SILSO sunspot numbers (CC BY-NC), GIRO ionosonde data (CC BY-NC-SA, account
  only), URSI-88 maps.

## Antenna models

Each wire is handed to one of VOACAP's types: 23 (centre-fed dipole) for a level half-wave; 41
(ITS-78 sloping long wire, `mufesgan.for`) for a level wire over 0.55 wavelengths and every
sloping wire, with a file written per frequency in wavelengths; 22 (monopole) for a vertical.
Type 23 refers gain to the centre current and collapses away from a half-wave; type 41 divides by
a monopole's resistance, reading 1.3 to 1.6 dB below type 23 at odd half-waves and, by a total
radiated-power check over perfect ground, a few decibels either way elsewhere. Type 41 has no
gain line, so gain and loss are applied to the requirement and figures instead. The runs are kept as tests:
`propagation-wire.test.ts` and `propagation-sloping.test.ts`. The 0.45 and 0.55 limits live in
`wireOn`.

## P.533 (ITURHFProp)

- Source: github.com/ITU-R-Study-Group-3/ITU-R-HF at `82017594a1c6`, 39 files, checked against a
  tree checksum. Compiled with wasi-sdk 34.0 (Debian 12 slim, pinned) with no network.
  `engines/p533/` holds only Outpost's files: `build/Dockerfile`, `build/compile.sh`, `glue/`
  (a `dlopen`/`dlsym` table for the 21 functions the ITU's code asks for), `NOTICE.txt`. No ITU
  line is edited. `SOURCE_DATE_EPOCH` makes it reproducible: `iturhfprop.wasm`, 233,329 bytes,
  SHA-256 `2eb264246a77f6fda81325bb6a71a0f3b6e1c60e6e5bbadb38f5ca05c39229b2`, the same from
  arm64 and amd64 builds. Memory capped at 128 MB.
- Sandbox: its own worker and WASI shim (`p533/p533.worker.ts`, `p533/wasi.ts`); read-only input
  files, one writable report up to 32 MB, no network or environment, a fresh instance per run,
  one-minute timeout.
- The input file is written by `p533/input.ts` (isotropic antennas always, `ANALOG`, short path,
  `SNRr` in 1 Hz); `-307` in the report means no figure.
- Held to the ITU's nine reference cases with no tolerance (all lines but the compile date and
  analysis time): `propagation-p533-reference.test.ts`, run when
  `node scripts/build-p533-engine.mjs --maps` has been run, skipped by name otherwise.
- To ship it if ever permitted: remove the `engines/p533/` lines from `.gitignore`, commit the
  `.wasm`, add `engines/p533/engine` to `scripts/build-app.mjs`. The checksum is in
  `modules/propagation/p533/manifest.json`.

## Contact log import

ADI files over 128 kB import as a job, read 200 contacts at a time with the server yielding
between batches (longest piece under 50 ms for 200,000 contacts); duplicates are caught by a
unique index. The file is held in memory only (64 MB cap), so a restart fails the job and takes
out what was written.

## Morse trainer

Engine (timing, keyers, decoder, Koch, drills, echo, QSO, skimmer checks):
`packages/shared/src/morse/`; types `packages/shared/src/morse.ts`; server
`apps/server/src/modules/morse/` (tables `morse_progress`, `morse_sessions`); screen
`apps/web/src/features/morse/`; end-to-end `e2e/tests/morse.mobile.spec.ts`. Send, QSO practice
and On the air are loaded on first open.
