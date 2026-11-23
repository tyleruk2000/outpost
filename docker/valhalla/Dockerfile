# Streets for routes: Valhalla (MIT licence, https://github.com/valhalla/valhalla), with
# osmium-tool to join neighbouring country files before a build. Optional: compose.yaml
# starts it only with the "routes" profile. See docs/development/street-routes-measurements.md.
#
# The plain image, not valhalla-scripted: nothing here fetches timezones, speeds or
# elevation from the internet. Pinned by digest (3.9.3, linux/amd64 and linux/arm64).
FROM ghcr.io/valhalla/valhalla:3.9.3@sha256:cf618ccafdead96829282acc81a70aa00947c2f28ddcf118f0194acf2fbc7e9d

RUN apt-get update \
  && apt-get install -y --no-install-recommends osmium-tool \
  && rm -rf /var/lib/apt/lists/*

COPY outpost-valhalla.sh /usr/local/bin/outpost-valhalla.sh
RUN chmod 0755 /usr/local/bin/outpost-valhalla.sh

ENV VALHALLA_HOME=/tiles
VOLUME ["/tiles"]
EXPOSE 8002
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD outpost-valhalla.sh health
ENTRYPOINT ["/usr/local/bin/outpost-valhalla.sh"]
CMD ["serve"]
