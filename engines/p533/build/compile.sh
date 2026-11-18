#!/bin/sh
# Compiles ITURHFProp, P533 and P372 into one WebAssembly program. Runs inside the
# container (see Dockerfile), with:
#   /src   the ITU's source at the pinned commit, with Outpost's edits applied (read-only)
#   /glue  Outpost's own C (read-only)
#   /out   where iturhfprop.wasm is written
# Outpost itself runs it too, without a container, when "Build the P.533 engine" is
# pressed (apps/server/src/modules/propagation/p533/build.ts): the same recipe with the
# same compiler, from a folder of its own, where the five places are named by
# P533_SRC, P533_GLUE, P533_OUT, P533_WORK and WASI_SDK, without spaces in them. The
# file is the same, byte for byte, either way.
# Outpost's own file: it contains nothing of the ITU's.
set -eu
# The object files are linked in the order the shell lists them: the same order everywhere.
export LC_ALL=C

SRC="${P533_SRC:-/src}"
GLUE="${P533_GLUE:-/glue}"
OUT="${P533_OUT:-/out}"
WORK="${P533_WORK:-/tmp/build}"
SDK="${WASI_SDK:-/opt/wasi-sdk}"
CC="$SDK/bin/clang"
mkdir -p "$WORK"

# The flags of the ITU's own Linux makefiles (-O2, warnings), for the wasm32-wasip1
# target. __linux__ is defined so that the sources take their Linux branches (dlopen
# and dlsym, which /glue/outpost-dl.c answers from a table); the target itself has no
# operating system. The fixed date makes __DATE__ and __TIME__, which the program
# prints as its compile time, the same on every machine. Paths are rewritten so the
# file does not record where it was built.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:?the commit time of the ITU source}"
CFLAGS="--target=wasm32-wasip1 -O2 -D__linux__=1 -I$GLUE/include -ffile-prefix-map=$SRC=/iturhf -ffile-prefix-map=$GLUE=/outpost -Wno-everything"

compile() { # module, standard, files...
  module="$1"; std="$2"; shift 2
  for file in "$@"; do
    "$CC" $CFLAGS $std -I"$SRC/$module" -c "$SRC/$module/$file" -o "$WORK/$(basename "$module")-${file%.c}.o"
  done
}

compile P533/Src/P533 -std=c99 \
  Between7000kmand9000km.c ELayerScreeningFrequency.c Magfit.c MedianSkywaveFieldStrengthShort.c \
  ReadIonParameters.c CalculateCPParameters.c Geometry.c MUFBasic.c P533.c MUFOperational.c \
  ReadP1239.c CircuitReliability.c InitializePath.c MedianAvailableReceiverPower.c ReadType13.c \
  InputDump.c MedianSkywaveFieldStrengthLong.c MUFVariability.c PathMemory.c ValidatePath.c
compile P372/Src/P372 "" InitializeNoise.c Noise.c NoiseMemory.c
compile ITURHFProp/Src/ITURHFProp "" DumpPathData.c ITURHFProp.c ReadInputConfiguration.c Report.c ValidateITURHFP.c
"$CC" $CFLAGS -I"$SRC/P533/Src/P533" -c "$GLUE/outpost-dl.c" -o "$WORK/outpost-dl.o"

# The three were built as separate libraries and each defines, from its headers, the
# same handful of function-pointer variables (Linux links them with -z muldefs). In one
# program they must be one variable each, which is what --allow-multiple-definition
# gives: every copy is an uninitialised pointer and the first is kept. That must never
# choose between two different functions, so a function defined twice stops the build.
# The one exception: five helpers for printing angles and times (degrees, minutes,
# seconds, hrs, mns) are defined both in P533's MedianSkywaveFieldStrengthLong.c and in
# ITURHFProp's DumpPathData.c, with the same bodies, character for character, at the
# pinned commit (whose tree checksum the build script checks).
twice=$("$SDK/bin/llvm-nm" --defined-only "$WORK"/*.o | awk '$2 == "T" { print $3 }' | sort | uniq -d \
  | grep -vx -e degrees -e minutes -e seconds -e hrs -e mns || true)
if [ -n "$twice" ]; then echo "Functions defined more than once: $twice" >&2; exit 1; fi
"$CC" --target=wasm32-wasip1 -O2 -o "$WORK/iturhfprop.wasm" "$WORK"/*.o -lm \
  -Wl,--allow-multiple-definition -Wl,-z,stack-size=1048576 -Wl,--max-memory=134217728 -Wl,--strip-all

# The program's memory is capped at 128 MB (a day of 32 frequencies uses about 36 MB):
# past that an allocation fails inside the program, which reports it and stops.
cp "$WORK/iturhfprop.wasm" "$OUT/iturhfprop.wasm"
"$CC" --version | head -1 > "$OUT/clang-version.txt"
