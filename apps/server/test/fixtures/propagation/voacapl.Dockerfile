# The original Fortran VOACAP (voacapl), built to give the reference listings kept beside
# this file. Not part of Outpost and never shipped: it exists so that anyone can run the
# reference circuits through the original program again.
#
#   docker build -f apps/server/test/fixtures/propagation/voacapl.Dockerfile -t voacapl-reference .
#   node apps/server/test/fixtures/propagation/make-decks.ts /some/folder
#   docker run --rm -v /some/folder:/w voacapl-reference sh -c '
#     mkdir -p /root/itshfbc/antennas/outpost
#     n=0; for id in london-birmingham london-new-york tangier-belgrade; do n=$((n+1))
#       cp /w/$id.tx /root/itshfbc/antennas/outpost/tx; cp /w/$id.rx /root/itshfbc/antennas/outpost/rx
#       cp /w/$id.dat /root/itshfbc/run/ref$n.dat          # voacapl wants a short file name
#       voacapl -s /root/itshfbc ref$n.dat ref$n.out; cp /root/itshfbc/run/ref$n.out /w/$id.voacapl.out
#     done'
#
# -ffp-contract=off stops the compiler fusing a multiplication and an addition into one
# instruction, which changes the last bit of some sums on processors that have one (arm64).
# Built that way the Fortran prints what Outpost's engine prints, character for character;
# built without it, a handful of cells differ by one in the last printed digit.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends gfortran gcc make git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/jawatson/voacapl /src/voacapl && git -C /src/voacapl checkout c12a98b348c39f36f2659b8b3aa97b86284c8a1d
WORKDIR /src/voacapl
# git gives every file the same time; settle them so that make does not try to regenerate the build files.
RUN touch configure.ac && sleep 1 && touch aclocal.m4 && sleep 1 && touch configure $(find . -name config.h.in) && sleep 1 && touch $(find . -name Makefile.in) && \
    ./configure FFLAGS="-O2 -ffp-contract=off" && make && make install && makeitshfbc /root/itshfbc
WORKDIR /w
