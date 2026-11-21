import type { Source } from "../tools/kit";

/** Where the compass's figures and formulas come from. Read 2026-11-17. */
export const COMPASS_SOURCES = {
  wmm: {
    name: "NOAA National Centers for Environmental Information and the British Geological Survey, World Magnetic Model 2025 (public domain)",
    url: "https://www.ncei.noaa.gov/products/world-magnetic-model",
    read: "2026-11-17",
  },
  report: {
    name: "Chulliat, A. et al. (2025), The US/UK World Magnetic Model for 2025-2030: Technical Report, NOAA NCEI, sections 1.2, 1.8 and 3.4",
    url: "https://doi.org/10.25923/prbc-s316",
    read: "2026-11-17",
  },
  osgb: {
    name: "Ordnance Survey, A guide to coordinate systems in Great Britain (v3.6), annex C: the National Grid's projection, as Outpost's map uses it",
    url: "https://www.ordnancesurvey.co.uk/documents/resources/guide-coordinate-systems-great-britain.pdf",
    read: "2026-11-17",
  },
  utm: {
    name: "NGA.SIG.0012_2.0.0 (2014), The Universal Grids and the Transverse Mercator and Polar Stereographic Map Projections: UTM and UPS, as Outpost's grids use them",
    url: "http://web.archive.org/web/20180516193526id_/http://earth-info.nga.mil:80/GandG/publications/NGA_SIG_0012_2_0_0_UTMUPS/NGA.SIG.0012_2.0.0_UTMUPS.pdf",
    read: "2026-11-21",
  },
  orientation: {
    name: "W3C, Device Orientation and Motion: the orientation angles and the worked example of a compass heading",
    url: "https://www.w3.org/TR/orientation-event/",
    read: "2026-11-17",
  },
} satisfies Record<string, Source>;
