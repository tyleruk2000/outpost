# The toolchain that builds the ITU's ITURHFProp (Recommendation ITU-R P.533 with
# P.372) to WebAssembly. Outpost's own file: it contains nothing of the ITU's.
#
# Used by scripts/build-p533-engine.mjs, which builds this image, then runs it with no
# network and the prepared source mounted read-only. Everything is pinned: the base
# image by digest, wasi-sdk by version and checksum for each architecture.
FROM debian:12-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc

ARG WASI_SDK_VERSION=34.0
ARG WASI_SDK_SHA256_ARM64=3a8228467914f4917fbda6dc8601cc95399346ed887998b4420b841a4070d8f4
ARG WASI_SDK_SHA256_X86_64=09f37a478107bf30381e0d8922ac678ebe998de59e574f96830f08e520908d4a

RUN set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    case "$(dpkg --print-architecture)" in \
      arm64) arch=arm64; sum="$WASI_SDK_SHA256_ARM64" ;; \
      amd64) arch=x86_64; sum="$WASI_SDK_SHA256_X86_64" ;; \
      *) echo "No wasi-sdk build for $(dpkg --print-architecture)"; exit 1 ;; \
    esac; \
    deb="wasi-sdk-${WASI_SDK_VERSION}-${arch}-linux.deb"; \
    curl -fsSL --retry 5 --retry-all-errors -o "/tmp/$deb" "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_VERSION%%.*}/$deb"; \
    echo "$sum  /tmp/$deb" | sha256sum -c -; \
    dpkg -i "/tmp/$deb"; \
    rm "/tmp/$deb"; \
    apt-get purge -y curl; apt-get autoremove -y; rm -rf /var/lib/apt/lists/*; \
    /opt/wasi-sdk/bin/clang --version

COPY compile.sh /usr/local/bin/compile-iturhfprop
ENTRYPOINT ["/bin/sh", "/usr/local/bin/compile-iturhfprop"]
