/**
 * The published figures and tables the nuclear effects simulator is built from, as
 * numbers. Every one comes from Samuel Glasstone and Philip J. Dolan (eds), *The
 * Effects of Nuclear Weapons*, third edition, prepared and published by the United States
 * Department of Defense and the Energy Research and Development Administration, 1977 (a
 * work of the United States Government). Section,
 * figure and table numbers below are that book's.
 *
 * Tables are copied as printed. Figures are curves on paper: their numbers here were
 * read off scans of the printed pages by finding each curve's crossing of a row or
 * column of the scan between the gridlines, and converting with the figure's own
 * gridlines (a log scale where the figure has one). Read-off error is a few per cent;
 * docs/nuclear-preparedness.md gives how each was read and how it was checked against
 * the book's own worked examples.
 *
 * Nothing here is about how a weapon is made. These are the book's curves of what a
 * burst of a stated energy does at a distance.
 */

/**
 * Peak overpressure on the ground for a 1-kiloton burst (Figs. 3.73b and 3.73c): each
 * contour as [distance from ground zero, height of burst] in feet, from where it meets
 * the ground (a surface burst), out through its farthest reach, and back to the axis
 * above ground zero (or to the top of the figure, 5,000 feet, where the 1 psi contour
 * leaves it). Both are scaled by the cube root of the yield (§ 3.62, eq. 3.62.1).
 *
 * 1, 2, 4 and 6 psi are from Fig. 3.73c (low-pressure range, 500-foot grid); 10 and 20
 * psi from Fig. 3.73b (intermediate range, 100-foot grid), whose finer grid reads the
 * same curves more closely. Where both draw a curve the two disagree by a few per cent
 * at the ground: 10 psi meets it at 1,029 feet on Fig. 3.73b and 1,062 feet on Fig.
 * 3.73c, 15 psi at 821 and 778 feet.
 */
export const OVERPRESSURE_CONTOURS_1KT: Record<1 | 2 | 4 | 6 | 10 | 20, ReadonlyArray<readonly [number, number]>> = {
  1: [
    [3845, 0],
    [3971, 50],
    [4097, 100],
    [4387, 200],
    [4689, 300],
    [4981, 400],
    [5250, 500],
    [5540, 600],
    [5807, 700],
    [6054, 800],
    [6275, 900],
    [6460, 1000],
    [6642, 1100],
    [6781, 1200],
    [6892, 1300],
    [6969, 1400],
    [7019, 1500],
    [7040, 1580],
    [6980, 1700],
    [6826, 1800],
    [6625, 1855],
    [6375, 1877],
    [6125, 1893],
    [5875, 1898],
    [5625, 1912],
    [5375, 1980],
    [5125, 2133],
    [4875, 2363],
    [4625, 2639],
    [4375, 2902],
    [4125, 3154],
    [3875, 3404],
    [3625, 3635],
    [3375, 3852],
    [3125, 4049],
    [2875, 4217],
    [2625, 4375],
    [2125, 4627],
    [1875, 4730],
    [1625, 4807],
    [1375, 4871],
    [1125, 4920],
    [875, 4957],
    [600, 5000],
  ],
  2: [
    [2537, 0],
    [2642, 50],
    [2747, 100],
    [2950, 200],
    [3147, 300],
    [3325, 400],
    [3500, 500],
    [3658, 600],
    [3812, 700],
    [3954, 800],
    [4079, 900],
    [4140, 1000],
    [4193, 1100],
    [4245, 1200],
    [4160, 1260],
    [4075, 1300],
    [3875, 1391],
    [3700, 1400],
    [3375, 1420],
    [3125, 1477],
    [2875, 1682],
    [2625, 1926],
    [2375, 2158],
    [2125, 2375],
    [1875, 2574],
    [1625, 2736],
    [1375, 2869],
    [1125, 2980],
    [875, 3049],
    [625, 3111],
    [375, 3154],
    [125, 3182],
    [0, 3195],
  ],
  4: [
    [1644, 0],
    [1706, 50],
    [1768, 100],
    [1882, 200],
    [1995, 300],
    [2108, 400],
    [2210, 500],
    [2311, 600],
    [2400, 700],
    [2489, 800],
    [2549, 900],
    [2619, 1000],
    [2680, 1080],
    [2700, 1150],
    [2680, 1220],
    [2625, 1260],
    [2560, 1250],
    [2375, 1217],
    [2125, 1164],
    [1875, 1209],
    [1625, 1363],
    [1375, 1559],
    [1125, 1738],
    [875, 1881],
    [375, 2039],
    [125, 2072],
    [0, 2080],
  ],
  6: [
    [1326, 0],
    [1366, 50],
    [1406, 100],
    [1491, 200],
    [1567, 300],
    [1648, 400],
    [1740, 500],
    [1826, 600],
    [1903, 700],
    [1965, 800],
    [2070, 880],
    [2115, 950],
    [2080, 1030],
    [1990, 1090],
    [1890, 1110],
    [1800, 1080],
    [1625, 1029],
    [1375, 1057],
    [1125, 1227],
    [875, 1400],
    [625, 1527],
    [375, 1602],
    [125, 1641],
    [0, 1650],
  ],
  10: [
    [1029, 0],
    [1050, 50],
    [1095, 150],
    [1145, 250],
    [1199, 350],
    [1270, 450],
    [1350, 550],
    [1427, 650],
    [1470, 720],
    [1440, 800],
    [1350, 880],
    [1250, 905],
    [1150, 880],
    [1100, 862],
    [1000, 880],
    [875, 922],
    [625, 1082],
    [375, 1191],
    [125, 1244],
    [0, 1256],
  ],
  20: [
    [716, 0],
    [725, 50],
    [743, 150],
    [765, 250],
    [794, 350],
    [839, 450],
    [885, 520],
    [926, 616],
    [905, 670],
    [860, 700],
    [805, 707],
    [750, 688],
    [707, 682],
    [650, 700],
    [600, 722],
    [500, 793],
    [450, 810],
    [350, 848],
    [250, 886],
    [150, 907],
    [50, 918],
    [0, 925],
  ],
};

/** The highest scaled height of burst Fig. 3.73c draws, in feet for 1 kiloton. */
export const MAX_SCALED_HEIGHT_FT = 5000;

/**
 * Slant ranges, in statute miles, at which a radiant exposure is received on the
 * ground from an air burst (Fig. 7.42: "Slant ranges for specified radiant exposures
 * on the ground as a function of energy yield of air bursts at altitudes up to 15,000
 * feet for a 12-mile visibility"). Rows are yields in kilotons; columns the exposures
 * the figure draws, in calories per square centimetre.
 */
export const THERMAL_EXPOSURES_CAL = [3, 5, 8, 12, 25, 50] as const;
export const THERMAL_SLANT_MILES: ReadonlyArray<readonly [number, readonly number[]]> = [
  [1.2, [0.627, 0.483, 0.382, 0.311, 0.22, 0.154]],
  [1.5, [0.704, 0.541, 0.428, 0.349, 0.245, 0.172]],
  [2.2, [0.858, 0.658, 0.52, 0.425, 0.297, 0.208]],
  [4.5, [1.24, 0.942, 0.747, 0.613, 0.422, 0.297]],
  [7, [1.529, 1.173, 0.932, 0.771, 0.526, 0.369]],
  [10.5, [1.834, 1.418, 1.137, 0.945, 0.636, 0.452]],
  [15, [2.133, 1.658, 1.334, 1.128, 0.754, 0.54]],
  [21, [2.441, 1.923, 1.551, 1.319, 0.88, 0.634]],
  [30, [2.808, 2.244, 1.819, 1.56, 1.043, 0.758]],
  [70, [3.887, 3.221, 2.625, 2.231, 1.534, 1.147]],
  [300, [6.697, 5.692, 4.757, 4.009, 2.896, 2.219]],
  [450, [7.77, 6.567, 5.55, 4.717, 3.455, 2.67]],
  [620, [8.741, 7.367, 6.243, 5.366, 3.953, 3.08]],
  [700, [9.116, 7.662, 6.493, 5.628, 4.169, 3.239]],
  [1300, [11.299, 9.428, 8.013, 7.083, 5.366, 4.181]],
  [1800, [12.516, 10.435, 8.914, 7.924, 6.071, 4.77]],
  [3000, [14.55, 12.235, 10.555, 9.323, 7.367, 5.837]],
  [6000, [17.801, 15.14, 13.21, 11.494, 9.508, 7.619]],
  [8000, [19.385, 16.534, 14.508, 12.516, 10.555, 8.523]],
];

/**
 * The radiant exposure (cal/cm²) at which half of an average unshielded population
 * taking no evasive action would receive a burn of the stated degree (the solid "50
 * percent" lines of Fig. 12.65). The lines are straight against the logarithm of the
 * yield; these are the lines through the read-off points, valid from 1 kiloton to 10
 * megatons as the figure is drawn. W in kilotons.
 */
export const BURN_50_PERCENT = {
  second: { at1kt: 3.95, perDecade: 0.757 },
  third: { at1kt: 5.96, perDecade: 1.24 },
} as const;

/** Thermal partition of an air burst below 15,000 feet (Table 7.88), and of a contact surface burst (§ 7.101). */
export const THERMAL_PARTITION_AIR = 0.35;
export const THERMAL_PARTITION_CONTACT = 0.18;

/**
 * Effective thermal partition for bursts near the surface (Table 7.101). Rows are
 * heights of burst in feet; columns the yields 1, 10, 100, 1,000 and 10,000 kilotons.
 * Null is the table's "**": an air burst, whose partition is that of Table 7.88 (0.35).
 * The table's "*" ("may be treated as contact surface bursts, with f = 0.18") is 0.18.
 */
export const SURFACE_PARTITION_YIELDS = [1, 10, 100, 1000, 10000] as const;
export const SURFACE_PARTITION: ReadonlyArray<readonly [number, ReadonlyArray<number | null>]> = [
  [0, [0.18, 0.18, 0.18, 0.18, 0.18]],
  [20, [0.19, 0.18, 0.18, 0.18, 0.18]],
  [40, [0.21, 0.19, 0.18, 0.18, 0.18]],
  [70, [0.23, 0.21, 0.19, 0.18, 0.18]],
  [100, [0.26, 0.22, 0.2, 0.18, 0.18]],
  [200, [0.35, 0.25, 0.21, 0.19, 0.18]],
  [400, [null, 0.33, 0.25, 0.21, 0.19]],
  [700, [null, null, 0.28, 0.24, 0.21]],
  [1000, [null, null, 0.34, 0.26, 0.22]],
  [2000, [null, null, null, 0.34, 0.26]],
  [4000, [null, null, null, null, 0.33]],
  [7000, [null, null, null, null, 0.35]],
];

/**
 * Initial nuclear radiation: slant ranges in yards at which the stated absorbed dose
 * (rads, in tissue near the body surface) is received near the ground from an air
 * burst, with an average air density on the path of 0.9 of sea level. Columns are the
 * doses the figures draw.
 *
 * Figs. 8.33a (gamma) and 8.64a (neutrons) are for fission weapons from 1 to 100
 * kilotons, reliable "within a factor of 0.5 to 2"; Figs. 8.33b and 8.64b for
 * thermonuclear weapons with 50 per cent of their yield from fission, from 100
 * kilotons to 20 megatons, "from 0.25 to 1.5" (§ 8.33).
 */
export const RADIATION_DOSES_RAD = [30, 100, 300, 1000, 3000, 10000] as const;
type DoseRows = ReadonlyArray<readonly [number, readonly number[]]>;
export const GAMMA_FISSION_YARDS: DoseRows = [
  [1.05, [1473, 1204, 970, 753, 571, 429]],
  [1.5, [1559, 1286, 1046, 821, 632, 465]],
  [3, [1731, 1448, 1195, 953, 757, 555]],
  [4, [1804, 1517, 1260, 1010, 813, 599]],
  [7, [1951, 1658, 1387, 1130, 920, 688]],
  [13, [2123, 1820, 1540, 1276, 1048, 805]],
  [15, [2165, 1859, 1578, 1313, 1079, 833]],
  [70, [2672, 2356, 2075, 1757, 1500, 1234]],
  [95, [2777, 2466, 2188, 1849, 1593, 1323]],
];
export const NEUTRON_FISSION_YARDS: DoseRows = [
  [1.5, [1456, 1259, 1063, 892, 728, 558]],
  [3, [1590, 1382, 1185, 1002, 836, 662]],
  [4, [1645, 1434, 1235, 1051, 881, 704]],
  [7, [1749, 1531, 1333, 1143, 967, 787]],
  [13, [1868, 1643, 1441, 1243, 1064, 880]],
  [15, [1895, 1668, 1466, 1267, 1086, 902]],
  [70, [2193, 1951, 1745, 1528, 1334, 1141]],
  [95, [2254, 2006, 1802, 1581, 1386, 1193]],
];
export const GAMMA_THERMONUCLEAR_YARDS: DoseRows = [
  [105, [2684, 2367, 2059, 1758, 1503, 1208]],
  [150, [2813, 2500, 2201, 1866, 1608, 1316]],
  [300, [3073, 2762, 2476, 2135, 1837, 1529]],
  [400, [3184, 2873, 2588, 2252, 1948, 1625]],
  [700, [3431, 3115, 2829, 2493, 2176, 1835]],
  [1400, [3803, 3464, 3163, 2827, 2504, 2156]],
  [1500, [3846, 3505, 3200, 2861, 2541, 2193]],
  [7000, [5065, 4673, 4307, 3921, 3554, 3138]],
  [9000, [5319, 4915, 4555, 4151, 3768, 3346]],
  [13000, [5717, 5309, 4980, 4551, 4122, 3687]],
  [15000, [5875, 5474, 5135, 4715, 4271, 3823]],
  [19000, [6139, 5753, 5421, 5001, 4522, 4062]],
];
export const NEUTRON_THERMONUCLEAR_YARDS: DoseRows = [
  [105, [2273, 2033, 1818, 1586, 1379, 1149]],
  [150, [2352, 2110, 1892, 1658, 1449, 1219]],
  [300, [2504, 2260, 2037, 1800, 1585, 1354]],
  [400, [2568, 2323, 2097, 1859, 1642, 1410]],
  [700, [2688, 2444, 2212, 1972, 1753, 1520]],
  [1400, [2842, 2590, 2356, 2112, 1889, 1653]],
  [1500, [2857, 2604, 2368, 2125, 1902, 1665]],
  [9000, [3256, 2993, 2745, 2494, 2262, 2022]],
  [13000, [3344, 3076, 2825, 2570, 2339, 2099]],
  [15000, [3377, 3108, 2857, 2600, 2371, 2126]],
  [19000, [3433, 3162, 2908, 2651, 2419, 2177]],
];

/**
 * Correction factors for the gamma dose of a contact surface burst (Table 8.37), by
 * yield in kilotons. Fig. 8.33a: 2/3 from 1 to 50 kilotons, 1 at 100. Fig. 8.33b: 1 at
 * 100 kilotons, 1¼ at 300, 1½ at 700, 2 at 2 megatons, 3 from 5 to 20 megatons.
 * Between tabulated yields, and for bursts between the surface and about 300 feet,
 * the book says to interpolate (§ 8.37).
 */
export const SURFACE_GAMMA_FACTOR_FISSION: ReadonlyArray<readonly [number, number]> = [
  [1, 2 / 3],
  [50, 2 / 3],
  [100, 1],
];
export const SURFACE_GAMMA_FACTOR_THERMONUCLEAR: ReadonlyArray<readonly [number, number]> = [
  [100, 1],
  [300, 1.25],
  [700, 1.5],
  [2000, 2],
  [5000, 3],
  [20000, 3],
];
/** "For contact surface bursts, the prompt neutron dose may be taken as one-half the value for a corresponding air burst" (§ 8.66). */
export const SURFACE_NEUTRON_FACTOR = 0.5;

/**
 * Idealised unit-time reference dose-rate contours for a contact surface burst of W
 * kilotons in a 15 mile-per-hour effective wind with 15° of shear (Table 9.93), in
 * statute miles: [rads per hour at 1 hour, downwind distance, maximum width, ground
 * zero width], each as [coefficient, exponent of W].
 */
export const FALLOUT_CONTOURS: ReadonlyArray<{
  rate: number;
  downwind: readonly [number, number];
  maxWidth: readonly [number, number];
  groundZeroWidth: readonly [number, number];
}> = [
  { rate: 3000, downwind: [0.95, 0.45], maxWidth: [0.0076, 0.86], groundZeroWidth: [0.026, 0.58] },
  { rate: 1000, downwind: [1.8, 0.45], maxWidth: [0.036, 0.76], groundZeroWidth: [0.06, 0.57] },
  { rate: 300, downwind: [4.5, 0.45], maxWidth: [0.13, 0.66], groundZeroWidth: [0.2, 0.48] },
  { rate: 100, downwind: [8.9, 0.45], maxWidth: [0.38, 0.6], groundZeroWidth: [0.39, 0.42] },
  { rate: 30, downwind: [16, 0.45], maxWidth: [0.76, 0.56], groundZeroWidth: [0.53, 0.41] },
  { rate: 10, downwind: [24, 0.45], maxWidth: [1.4, 0.53], groundZeroWidth: [0.68, 0.41] },
  { rate: 3, downwind: [30, 0.45], maxWidth: [2.2, 0.5], groundZeroWidth: [0.89, 0.41] },
  { rate: 1, downwind: [40, 0.45], maxWidth: [3.3, 0.48], groundZeroWidth: [1.5, 0.41] },
];

/** Apparent crater of a contact surface burst of 1 kiloton (Figs. 6.72a and b, at depth of burst 0), in feet, scaled by W^0.3 (§ 6.72). */
export const CRATER_1KT_FEET = [
  { ground: "wet soil or wet soft rock", radius: 82, depth: 31 },
  { ground: "dry soil or dry soft rock", radius: 61, depth: 28 },
  { ground: "wet hard rock", radius: 58, depth: 28 },
  { ground: "dry hard rock", radius: 49, depth: 22 },
] as const;
