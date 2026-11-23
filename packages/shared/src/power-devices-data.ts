/**
 * The library of common devices for the battery calculators: each figure as its
 * publisher gave it, read on the date given, with the publisher's words. See
 * `power-devices.ts` for the shape and docs/tools-power.md for the whole table.
 *
 * How the figures were read: from each maker's own manual, specification sheet or
 * product page, or an official body's document, fetched directly; never from a
 * retailer, a review or a forum. Where a maker gives a current without a voltage, the
 * voltage's source is said in the figure's note. Where the maker gives only a maximum
 * ("less than", "@ Max", a supply's rating), the figure is `at-most`.
 *
 * Product names are trade marks of their owners, used only to say which device a
 * figure is for.
 */
import type {
  ChargeEntry,
  ChargingStep,
  CommonDevice,
  DeviceSource,
  LabelEntry,
  PublishedFigure,
  RadioEntry,
  RunEntry,
} from "./power-devices.ts";

const READ = "2026-11-16";
const round = (value: number) => Math.round(value * 10_000) / 10_000;
const source = (publisher: string, document: string, url: string): DeviceSource => ({ publisher, document, url, read: READ });

type Basis = PublishedFigure["basis"];
/** A current at a voltage. */
const amps = (a: number, volts: number, basis: Basis, quote: string, from = 0, note?: string): PublishedFigure => ({
  value: round(a * volts),
  as: { amps: a, volts },
  basis,
  quote,
  source: from,
  ...(note ? { note } : {}),
});
/** A capacity in mAh at a nominal voltage. */
const mah = (milliampHours: number, volts: number, quote: string, from = 0, note?: string): PublishedFigure => ({
  value: round((milliampHours / 1000) * volts),
  as: { milliampHours, volts },
  basis: "typical",
  quote,
  source: from,
  ...(note ? { note } : {}),
});
const wh = (wattHours: number, quote: string, from = 0, note?: string): PublishedFigure => ({
  value: wattHours,
  as: { wattHours },
  basis: "typical",
  quote,
  source: from,
  ...(note ? { note } : {}),
});

// ── Raspberry Pi ────────────────────────────────────────────────────────────

const PI_DOCS = source(
  "Raspberry Pi Ltd",
  "Raspberry Pi documentation, “Power supply” (read from its source, power-supplies.adoc, in the raspberrypi/documentation repository)",
  "https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#power-supply",
);
const PI_VOLTS = "Volts: “All models require a 5.1V supply” (the same page).";
const PI_NOTE =
  "The bare board's typical figure leaves out USB devices, a drive, a display and a HAT; the recommended supply's rating is the most it should draw with them.";

function pi(
  id: string,
  name: string,
  typicalA: number,
  supplyA: number,
  row: string,
  extra: RunEntry["states"] = [],
  supplyText = `${supplyA.toFixed(1)}A`,
): RunEntry {
  return {
    id,
    name,
    group: "computers",
    aliases: ["raspberry", "pi", "rpi", "outpost"],
    kind: "run",
    supply: "usb",
    hoursPerDay: 24,
    note: PI_NOTE,
    states: [
      {
        id: "typical",
        label: "Bare board, typical",
        figure: amps(
          typicalA,
          5.1,
          "typical",
          `${row}: typical bare-board active current consumption ${Math.round(typicalA * 1000)}mA`,
          0,
          PI_VOLTS,
        ),
      },
      ...extra,
      {
        id: "supply",
        label: "At most, the recommended supply",
        figure: amps(supplyA, 5.1, "at-most", `${row}: recommended PSU current capacity ${supplyText}`, 0, PI_VOLTS),
      },
    ],
    sources: [PI_DOCS],
  };
}

const PI_MEASURED =
  "Raspberry Pi's measurements: “standard Raspberry Pi OS image … at room temperature, with the Raspberry Pi connected to an HDMI monitor, USB keyboard, and USB mouse … Raspberry Pi 4 was connected to Ethernet.”";

const COMPUTERS: CommonDevice[] = [
  pi("raspberry-pi-5", "Raspberry Pi 5", 0.8, 5, "Raspberry Pi 5"),
  pi("raspberry-pi-500", "Raspberry Pi 500", 0.8, 5, "Pi 500"),
  pi("raspberry-pi-4", "Raspberry Pi 4 Model B", 0.6, 3, "Raspberry Pi 4 Model B", [
    {
      id: "idle",
      label: "Idle, measured",
      figure: amps(0.6, 5.1, "typical", "Raspberry Pi 4B, Idle, Avg: 0.6", 0, `${PI_VOLTS} ${PI_MEASURED}`),
    },
    {
      id: "stress",
      label: "Under full load, measured",
      figure: amps(1.2, 5.1, "typical", "Raspberry Pi 4B, Stress, Avg: 1.2", 0, `${PI_VOLTS} ${PI_MEASURED}`),
    },
  ]),
  pi("raspberry-pi-400", "Raspberry Pi 400", 0.8, 3, "Pi 400"),
  pi("raspberry-pi-3b-plus", "Raspberry Pi 3 Model B+", 0.5, 2.5, "Raspberry Pi 3 Model B+"),
  pi("raspberry-pi-3b", "Raspberry Pi 3 Model B", 0.4, 2.5, "Raspberry Pi 3 Model B", [
    {
      id: "idle",
      label: "Idle, measured",
      figure: amps(0.3, 5.1, "typical", "Raspberry Pi 3B, Idle, Avg: 0.30", 0, `${PI_VOLTS} ${PI_MEASURED}`),
    },
    {
      id: "stress",
      label: "Under full load, measured",
      figure: amps(0.85, 5.1, "typical", "Raspberry Pi 3B, Stress, Avg: 0.85", 0, `${PI_VOLTS} ${PI_MEASURED}`),
    },
  ]),
  pi("raspberry-pi-zero-2-w", "Raspberry Pi Zero 2 W", 0.35, 2, "Zero 2 W", [], "2A"),
  {
    id: "raspberry-pi-camera",
    name: "Raspberry Pi Camera Module",
    group: "computers",
    aliases: ["raspberry", "pi", "camera"],
    kind: "run",
    supply: "usb",
    hoursPerDay: 24,
    note: "Drawn through the Raspberry Pi: add it beside the board.",
    states: [{ id: "typical", label: "Typical", figure: amps(0.25, 5.1, "typical", "Camera Module: 250 mA", 0, PI_VOLTS) }],
    sources: [PI_DOCS],
  },
  {
    id: "raspberry-pi-case-fan",
    name: "Raspberry Pi Case Fan",
    group: "computers",
    aliases: ["raspberry", "pi", "fan", "cooler"],
    kind: "run",
    supply: "usb",
    hoursPerDay: 24,
    note: "Drawn through the Raspberry Pi: add it beside the board.",
    states: [{ id: "typical", label: "Typical", figure: amps(0.06, 5, "typical", "Case fan: 60 mA at 5 V (300 mW)") }],
    sources: [PI_DOCS],
  },
];

// ── Phones and things that are charged ──────────────────────────────────────

const BU_303 = source(
  "Battery University (Cadex Electronics)",
  "BU-303: Confusion with Voltages",
  "https://batteryuniversity.com/article/bu-303-confusion-with-voltages",
);
const NOMINAL_LI_ION =
  "The maker gives mAh only. Volts: “The nominal voltage of lithium-ion is 3.60V/cell” (Battery University, BU-303). Cells charged to 4.35 V are marked 3.8 V in the same table, so the watt-hours may be a little more than this; the label on the battery governs.";

function charged(
  id: string,
  name: string,
  battery: PublishedFigure,
  sources: DeviceSource[],
  aliases: string[] = [],
  note?: string,
): ChargeEntry {
  return { id, name, group: "charged", aliases, kind: "charge", supply: "usb", battery, sources, ...(note ? { note } : {}) };
}

const appleSheet = (model: string, file = `${model}_Product_Information_Sheet_EN_EU.pdf`) =>
  source(
    "Apple Inc.",
    `Product information sheet, model ${model} (EU)`,
    `https://regulatoryinfo.apple.com/cwt/api/ext/file?fileId=energyLabels/${model}_V1/${model}/${file}`,
  );

function iphone(id: string, name: string, model: string, mAhRated: number, file?: string): ChargeEntry {
  return charged(
    id,
    name,
    mah(mAhRated, 3.6, `10. Rated battery capacity (Crated [mAh]) ${mAhRated}`, 0, NOMINAL_LI_ION),
    [appleSheet(model, file), BU_303],
    ["iphone", "apple", "phone"],
    `Model ${model}, the one sold in the UK and Europe; a model for another country may have another battery.`,
  );
}

const IPAD_11 = source("Apple Inc.", "iPad 11-inch (A16), Technical Specifications", "https://www.apple.com/ipad-11/specs/");
const IPAD_AIR = source("Apple Inc.", "iPad Air, Technical Specifications", "https://www.apple.com/ipad-air/specs/");
const MACBOOK_AIR = source("Apple Inc.", "MacBook Air (M5), Tech Specs", "https://www.apple.com/macbook-air/specs/");
const PIXEL_10 = source(
  "Google",
  "Google Pixel 10, Specs and hardware (Google Store)",
  "https://store.google.com/us/product/pixel_10_specs",
);
const PIXEL_9A = source("Google", "Pixel 9a, Phone specifications (Google Store)", "https://store.google.com/us/product/pixel_9a_specs");
const GALAXY_S25 = source("Samsung Electronics", "Galaxy S25 | S25+, Specs", "https://www.samsung.com/ca/smartphones/galaxy-s25/specs/");

const CHARGED: CommonDevice[] = [
  iphone("iphone-18-pro", "iPhone 18 Pro", "A3714", 4056, "A3714_PIS_LotX_EU_English.pdf"),
  iphone("iphone-17-pro-max", "iPhone 17 Pro Max", "A3526", 4823),
  iphone("iphone-17-pro", "iPhone 17 Pro", "A3523", 3988),
  iphone("iphone-17", "iPhone 17", "A3520", 3692),
  iphone("iphone-air", "iPhone Air", "A3517", 3149),
  iphone("iphone-17e", "iPhone 17e", "A3634", 4005, "A3634_Product_Information_Sheet_EU_English.pdf"),
  iphone("iphone-16", "iPhone 16", "A3287", 3561),
  iphone("iphone-16e", "iPhone 16e", "A3409", 4005),
  charged(
    "pixel-10",
    "Google Pixel 10",
    mah(4970, 3.6, "Typical 4970mAh (minimum 4835mAh)", 0, NOMINAL_LI_ION),
    [PIXEL_10, BU_303],
    ["google", "android", "phone"],
  ),
  charged(
    "pixel-9a",
    "Google Pixel 9a",
    mah(5100, 3.6, "Typical 5100 mAh (minimum 5000 mAh)", 0, NOMINAL_LI_ION),
    [PIXEL_9A, BU_303],
    ["google", "android", "phone"],
  ),
  charged(
    "galaxy-s25",
    "Samsung Galaxy S25",
    mah(
      4000,
      3.6,
      "the Galaxy S25 having a 4,000mAh battery … Typical value is the estimated average value considering the deviation in battery capacity among the battery samples tested under IEC 61960 standard. Rated capacity is 3885 mAh for Galaxy S25",
      0,
      NOMINAL_LI_ION,
    ),
    [GALAXY_S25, BU_303],
    ["samsung", "android", "phone"],
  ),
  charged(
    "ipad-11-a16",
    "iPad 11-inch (A16)",
    wh(28.93, "Built‐in 28.93‐watt‐hour rechargeable lithium‑polymer battery"),
    [IPAD_11],
    ["apple", "tablet"],
  ),
  charged(
    "ipad-air-11-m4",
    "iPad Air 11-inch (M4)",
    wh(28.93, "iPad Air 11‑inch Built‐in 28.93‐watt‐hour rechargeable lithium‑polymer battery"),
    [IPAD_AIR],
    ["apple", "tablet"],
  ),
  charged(
    "ipad-air-13-m4",
    "iPad Air 13-inch (M4)",
    wh(36.59, "iPad Air 13‑inch Built‐in 36.59‐watt‐hour rechargeable lithium‑polymer battery"),
    [IPAD_AIR],
    ["apple", "tablet"],
  ),
  charged(
    "macbook-air-13-m5",
    "MacBook Air 13-inch (M5)",
    wh(53.8, "Built-in 53.8‑watt‑hour lithium‑polymer battery"),
    [MACBOOK_AIR],
    ["apple", "laptop", "mac"],
    "Charged from its own 40 W adapter through an inverter, or from a USB-C supply that gives enough power.",
  ),
  charged(
    "macbook-air-15-m5",
    "MacBook Air 15-inch (M5)",
    wh(66.5, "Built-in 66.5‑watt‑hour lithium‑polymer battery"),
    [MACBOOK_AIR],
    ["apple", "laptop", "mac"],
    "Charged from its own 40 W adapter through an inverter, or from a USB-C supply that gives enough power.",
  ),
  charged(
    "anker-power-bank-25k",
    "Anker Laptop Power Bank (25K, 165W)",
    mah(
      25000,
      3.6,
      "Your power bank has a rated cell capacity of 25,000mAh, equal to 90Wh under standard industry test conditions.",
      0,
      "90 Wh is Anker's own figure; 25,000 mAh × 3.6 V gives it. Anker adds that “usable output is about 63 - 70Wh”: what reaches the phones it charges.",
    ),
    [
      source(
        "Anker",
        "Anker Laptop Power Bank (25K, 165W, Built-In and Retractable Cables), A1695, product page",
        "https://www.anker.com/products/a1695-anker-power-bank-25000mah-165w",
      ),
    ],
    ["power bank", "battery pack"],
  ),
  charged(
    "petzl-core",
    "Petzl CORE head torch battery",
    mah(1250, 3.6, "CORE rechargeable battery (1250 mAh / 3.6 V / 4.5 Wh)"),
    [source("Petzl", "ACTIK CORE headlamp, product page (Energy)", "https://www.petzl.com/GB/en/Sport/Headlamps/ACTIK-CORE")],
    ["head torch", "headlamp", "torch", "actik"],
  ),
  charged(
    "eneloop-aa",
    "Panasonic eneloop AA cell",
    mah(
      2000,
      1.2,
      "電池容量 min.2000 mAh; 電圧 1.2V",
      0,
      "Battery capacity at least 2,000 mAh, 1.2 V, for the standard model sold in Japan (BK-3MCD): a minimum, so a cell holds this or more.",
    ),
    [
      source(
        "Panasonic (Japan)",
        "eneloop AA, standard model, BK-3MCD/4H, specifications",
        "https://panasonic.jp/battery/products/BK-3MCD_4H/spec.html",
      ),
    ],
    ["nimh", "aa", "rechargeable", "cell"],
    "One cell: give how many.",
  ),
  charged(
    "eneloop-aaa",
    "Panasonic eneloop AAA cell",
    mah(
      800,
      1.2,
      "電池容量 min.800 mAh; 電圧 1.2V",
      0,
      "Battery capacity at least 800 mAh, 1.2 V, for the standard model sold in Japan (BK-4MCD): a minimum.",
    ),
    [
      source(
        "Panasonic (Japan)",
        "eneloop AAA, standard model, BK-4MCD/4H, specifications",
        "https://panasonic.jp/battery/products/BK-4MCD_4H/spec.html",
      ),
    ],
    ["nimh", "aaa", "rechargeable", "cell"],
    "One cell: give how many.",
  ),
  // Handheld radios' and receivers' own batteries.
  charged(
    "pack-yaesu-sbr-25li",
    "Yaesu FT-65 battery (SBR-25LI)",
    mah(1950, 7.4, "7.4V, 1,950 mAh SBR-25LI Rechargeable Li-Ion Battery Pack"),
    [
      source(
        "Yaesu Musen",
        "FT-65R/FT-65E Operating Manual (EH066M105)",
        "https://www.yaesu.com/FileLibraryF/4CB43DCB-1018-01AF-FA59D5B2EDAF2F37/FT-65R_E_OM_ENG_EH066M105_1710C-FC.pdf",
      ),
    ],
    ["yaesu", "handheld", "radio", "battery pack"],
  ),
  charged(
    "pack-yaesu-sbr-24li",
    "Yaesu FT-70D battery (SBR-24LI)",
    mah(1800, 7.4, "7.4 V, 1800 mAh Rechargeable Li-Ion Battery Pack SBR-24LI"),
    [
      source(
        "Yaesu Musen",
        "FT-70DR/FT-70DE Operating Manual (EH051M202)",
        "https://www.yaesu.com/Files/DFDF4D53-1B78-7375-E6C7A6E4B192BE13/FT-70DR_DE_OM_ENG_EH051M202_1809R-CY-1.pdf",
      ),
    ],
    ["yaesu", "handheld", "radio", "battery pack"],
  ),
  charged(
    "pack-yaesu-fnb-83",
    "Yaesu FT-60 battery (FNB-83)",
    mah(1400, 7.2, "FNB-83 7.2 V, 1,400 mAh Rechargeable Nickel-Metal Hydride Battery Pack"),
    [
      source(
        "Yaesu Musen",
        "FT-60R/E Operating Manual (EH017M209)",
        "https://www.yaesu.com/Files/4CB43DCB-1018-01AF-FA59D5B2EDAF2F37/FT-60R_E_OM_USA_EXP_EU_ENG_EH017M209.pdf",
      ),
    ],
    ["yaesu", "handheld", "radio", "battery pack"],
  ),
  charged(
    "pack-yaesu-sbr-32mh",
    "Yaesu FT-818 battery (SBR-32MH)",
    mah(1900, 9.6, "Ni-MH Battery Pack (9.6V 1900 mAh)"),
    [source("Yaesu", "FT-818, product page", "https://yaesu.com/product-detail.aspx?Model=FT-818&CatName=HF%20Transceivers/Amplifiers")],
    ["yaesu", "ft-818", "radio", "battery pack", "hf"],
  ),
  charged(
    "pack-icom-bp-272",
    "Icom BP-272 battery (IC-705, ID-52)",
    mah(2000, 7.4, "Voltage 7.4 V; Current Capacity (minimum) 1880 mAh; Current Capacity (typical) 2000 mAh"),
    [source("Icom Inc.", "BP-272, specifications", "https://www.icomjapan.com/lineup/options/BP-272/")],
    ["icom", "ic-705", "id-52", "radio", "battery pack"],
  ),
  charged(
    "pack-elecraft-kxbt2",
    "Elecraft KX2 battery (KXBT2)",
    mah(2600, 11, "The KXBT2, shown here installed, is an 11 V, 2.6 Ah li-ion battery with protective circuitry."),
    [
      source(
        "Elecraft, Inc.",
        "KX2 Owner's Manual, Rev. B2, 22 March 2023",
        "https://ftp.elecraft.com/KX2/Manuals%20Downloads/KX2%20owner's%20man%20B2.pdf",
      ),
    ],
    ["elecraft", "kx2", "radio", "battery pack", "hf"],
  ),
  charged(
    "pack-xiegu-x6100",
    "Xiegu X6100 battery",
    mah(
      3500,
      7.4,
      "内置大容量锂电池组（3500mAh，7.4V）",
      0,
      "“Built-in high-capacity lithium battery pack (3500mAh, 7.4V)”, from the maker's Chinese manual. Copies of an English manual elsewhere give another figure; the maker's own edition is used.",
    ),
    [source("Xiegu", "X6100 Operation Manual, V1.6 (in Chinese)", "https://www.cqxiegu.com/filedownload/2988637")],
    ["xiegu", "x6100", "radio", "battery pack", "hf"],
  ),
  charged(
    "pack-anytone-d878uv",
    "AnyTone AT-D878UV battery",
    mah(2100, 7.4, "Operating Voltage: 7.4V DC ±20% (2100mAh)"),
    [source("Qixiang Electron (AnyTone)", "DMR Digital Radio AT-D878UV, product page", "https://www.anytone.net/pro_info92.html")],
    ["anytone", "dmr", "handheld", "radio", "battery pack"],
    "AnyTone publishes no current drawn, so only its battery is here.",
  ),
  charged(
    "lilygo-t-echo",
    "LilyGo T-Echo (Meshtastic)",
    mah(850, 3.7, "Battery Voltage 3.7V; Battery Capacity 850mAh"),
    [
      source(
        "Xinyuan-LilyGO",
        "T-Echo README (the maker's GitHub repository)",
        "https://raw.githubusercontent.com/Xinyuan-LilyGO/T-Echo/HEAD/README.MD",
      ),
    ],
    ["lora", "meshtastic", "node", "radio"],
    "LilyGo publishes no current drawn, so only its battery is here.",
  ),
  charged(
    "eton-frx3-plus",
    "Eton FRX3+ wind-up and solar radio",
    mah(2600, 3.7, "The lithium battery is rated at 3.7V/2600mAh."),
    [source("Eton Corporation", "FRX3+ Owner's Manual", "https://cdn.shopify.com/s/files/1/2407/2229/files/Eton_FRX3_Plus_Manual.pdf")],
    ["emergency", "wind-up", "crank", "solar", "radio", "receiver"],
    "Its own battery, charged over USB; it can also be wound or charged by its solar panel.",
  ),
  charged(
    "midland-er310",
    "Midland ER310 emergency radio",
    mah(2600, 3.7, "The battery is specified as 3.7 VDC, 2600 mAh, lithium ion (Li-ion)."),
    [
      source(
        "Midland Radio Corporation",
        "ER310 Owner's Manual",
        "https://midlandusa.com/wp-content/uploads/2016/12/ER310-Manual-Final-04.3.18.pdf",
      ),
    ],
    ["emergency", "wind-up", "crank", "radio", "receiver"],
  ),
  charged(
    "uniden-bc125at",
    "Uniden Bearcat BC125AT scanner (two AA cells)",
    mah(2300, 2.4, "Rechargeable 2300mAh Ni-MH Batteries; 2 AA Rechargeable Ni-MH Batteries (2.4V DC)"),
    [source("Uniden America Corporation", "BC125AT Owner's Manual", "https://www.uniden.info/download/ompdf/BC125ATom.pdf")],
    ["scanner", "uniden", "receiver", "radio"],
    "Two 2,300 mAh cells in series: 2,300 mAh at 2.4 V.",
  ),
];

// ── Radios ──────────────────────────────────────────────────────────────────

const tx = (id: string, label: string, outputW: number, figure: PublishedFigure) => ({ id, label, outputW, figure });

function radio(entry: Omit<RadioEntry, "group" | "kind" | "supply"> & { supply?: RadioEntry["supply"] }): RadioEntry {
  return { group: "radios", kind: "radio", supply: "dc", ...entry };
}

const YAESU_891 = source(
  "Yaesu Musen",
  "FT-891 Operating Manual",
  "https://www.yaesu.com/Files/4CB893D7-1018-01AF-FA97E9E9AD48B50C/FT-891_OM_ENG_EH065H201_1611A-BO-2.pdf",
);
const YAESU_710 = source(
  "Yaesu Musen",
  "FT-710 Operation Manual",
  "https://www.yaesu.com/Files/4CB893D7-1018-01AF-FA97E9E9AD48B50C/FT-710_OM_ENG_EH080H201_2307N-GS.pdf",
);
const YAESU_991A = source(
  "Yaesu Musen",
  "FT-991A Operating Manual",
  "https://www.yaesu.com/Files/4CB893D7-1018-01AF-FA97E9E9AD48B50C/FT-991A_OM_ENG_EH067M205_2111A-KS-1.pdf",
);
const ICOM_705 = source("Icom Inc.", "IC-705, specifications", "https://www.icomjapan.com/lineup/products/IC-705/specifications/");
const ICOM_7300 = source("Icom America", "IC-7300, specifications", "https://www.icomamerica.com/lineup/products/IC-7300/");
const ICOM_7100 = source("Icom America", "IC-7100, specifications", "https://www.icomamerica.com/lineup/products/IC-7100USA/");
const KX2 = source(
  "Elecraft, Inc.",
  "KX2 Owner's Manual, Rev. B2, 22 March 2023",
  "https://ftp.elecraft.com/KX2/Manuals%20Downloads/KX2%20owner's%20man%20B2.pdf",
);
const KX3 = source(
  "Elecraft, Inc.",
  "KX3 Owner's Manual, Rev. C5, 16 June 2014",
  "https://ftp.elecraft.com/KX3/Manuals%20Downloads/E740163%20KX3%20Owner's%20man%20Rev%20C5.pdf",
);
const X6100 = source("Xiegu", "X6100 Operation Manual, V1.6 (in Chinese)", "https://www.cqxiegu.com/filedownload/2988637");
const G90S = source("Xiegu", "G90S Operation Manual, Rev.05 (in Chinese)", "https://www.cqxiegu.com/filedownload/2988690");
const TRUSDX = source("DL2MAN (the designer)", "(tr)uSDX, home page", "https://dl2man.de/");
const FT60 = source(
  "Yaesu Musen",
  "FT-60R/E Operating Manual (EH017M209)",
  "https://www.yaesu.com/Files/4CB43DCB-1018-01AF-FA59D5B2EDAF2F37/FT-60R_E_OM_USA_EXP_EU_ENG_EH017M209.pdf",
);
const FT65 = source(
  "Yaesu Musen",
  "FT-65R/FT-65E Operating Manual (EH066M105)",
  "https://www.yaesu.com/FileLibraryF/4CB43DCB-1018-01AF-FA59D5B2EDAF2F37/FT-65R_E_OM_ENG_EH066M105_1710C-FC.pdf",
);
const FT70 = source(
  "Yaesu Musen",
  "FT-70DR/FT-70DE Operating Manual (EH051M202)",
  "https://www.yaesu.com/Files/DFDF4D53-1B78-7375-E6C7A6E4B192BE13/FT-70DR_DE_OM_ENG_EH051M202_1809R-CY-1.pdf",
);
const FT2980 = source(
  "Yaesu Musen",
  "FT-2980R Operating Manual (EH039N111)",
  "https://www.yaesu.com/Files/4CB3F875-1018-01AF-FAF21EE346767CA2/FT-2980R_OM_ENG_EH039N111.pdf",
);
const FTM6000 = source(
  "Yaesu Musen",
  "FTM-6000R/FTM-6000E Operating Manual (EH079M200)",
  "https://www.yaesu.com/Files/4CB3F875-1018-01AF-FAF21EE346767CA2/FTM-6000R_E_OM_ENG_EH079M200_2110G-BS.pdf",
);
const ID52 = source(
  "Icom Inc.",
  "ID-52A/ID-52E Basic Manual (English)",
  "https://www.icomjapan.com/api/download.php?post_id=3404&fl=JTJGdXBsb2FkcyUyRnN1cHBvcnQlMkZtYW51YWwlMkZJRC01MkFfRV9FTkdfQmFzaWNfMS5wZGY=",
);

const TOP_OF_RANGE = (range: string) =>
  `The maker gives the current without a voltage, for a supply of ${range}: Outpost multiplies by the top of that range, so the figure is the most it could be.`;

const RADIOS: CommonDevice[] = [
  radio({
    id: "yaesu-ft-891",
    name: "Yaesu FT-891",
    aliases: ["yaesu", "hf", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    receive: amps(
      2,
      13.8,
      "typical",
      "Current Consumption (typical): Rx: 2.0 A (signal present)",
      0,
      "Volts: “Supply voltage: 13.8 V DC ±15%” (same table).",
    ),
    transmit: [
      tx(
        "100w",
        "100 W out",
        100,
        amps(23, 13.8, "typical", "Tx: 23 A", 0, "Volts: “Supply voltage: 13.8 V DC ±15%”; output: “Power Output: 100 W” (same table)."),
      ),
    ],
    fullPowerOnly: true,
    sources: [YAESU_891],
  }),
  radio({
    id: "yaesu-ft-710",
    name: "Yaesu FT-710",
    aliases: ["yaesu", "hf", "transceiver", "aess"],
    mode: "ssb",
    hoursPerDay: 2,
    receive: amps(
      2.2,
      13.8,
      "typical",
      "Power Consumption (approx.) Rx (signal present) 2.2A",
      0,
      "Volts: “Supply Voltage: DC13.8V ± 15%” (same table).",
    ),
    standby: amps(1.8, 13.8, "typical", "Rx (no signal) 1.8A", 0, "Volts: “Supply Voltage: DC13.8V ± 15%”."),
    transmit: [tx("100w", "100 W out", 100, amps(21, 13.8, "typical", "Tx (100W) 21A", 0, "Volts: “Supply Voltage: DC13.8V ± 15%”."))],
    fullPowerOnly: true,
    sources: [YAESU_710],
  }),
  radio({
    id: "yaesu-ft-991a",
    name: "Yaesu FT-991A",
    aliases: ["yaesu", "hf", "vhf", "uhf", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    receive: amps(
      2.2,
      13.8,
      "typical",
      "Power Consumption (Approx.): Rx (signal present) 2.2 A",
      0,
      "Volts: “Supply Voltage: DC 13.8 V ± 15%” (same table).",
    ),
    standby: amps(1.8, 13.8, "typical", "Rx (no signal) 1.8 A", 0, "Volts: “Supply Voltage: DC 13.8 V ± 15%”."),
    transmit: [
      tx(
        "hf-100w",
        "HF and 50 MHz, 100 W out",
        100,
        amps(23, 13.8, "typical", "Tx 23 A (HF/50 MHz 100 W)", 0, "Volts: “Supply Voltage: DC 13.8 V ± 15%”."),
      ),
      tx(
        "vu-50w",
        "144 and 430 MHz, 50 W out",
        50,
        amps(15, 13.8, "typical", "15 A (144/430 MHz 50 W)", 0, "Volts: “Supply Voltage: DC 13.8 V ± 15%”."),
      ),
    ],
    fullPowerOnly: true,
    sources: [YAESU_991A],
  }),
  radio({
    id: "icom-ic-705-ext",
    name: "Icom IC-705 on 13.8 V",
    aliases: ["icom", "hf", "vhf", "uhf", "qrp", "portable", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    receive: amps(0.5, 13.8, "typical", "Current drain, 13.8 V DC: RX (Max. audio) 0.5 A (typical)"),
    standby: amps(0.3, 13.8, "typical", "Current drain, 13.8 V DC: RX (Standby) 0.3 A (typical)"),
    transmit: [tx("10w", "10 W out", 10, amps(3, 13.8, "at-most", "Current drain, 13.8 V DC: TX (Max. power) Less than 3 A (10 W)"))],
    fullPowerOnly: true,
    sources: [ICOM_705],
  }),
  radio({
    id: "icom-ic-705-battery",
    name: "Icom IC-705 on its BP-272 battery",
    aliases: ["icom", "hf", "vhf", "uhf", "qrp", "portable", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    note: "On its own 7.4 V battery it gives 5 W at most. For running it from a 12 V battery, use the 13.8 V entry.",
    receive: amps(0.8, 7.4, "typical", "Current drain, 7.4 V DC: RX (Max. audio) 0.8 A (typical)"),
    standby: amps(0.5, 7.4, "typical", "Current drain, 7.4 V DC: RX (Standby) 0.5 A (typical)"),
    transmit: [tx("5w", "5 W out", 5, amps(2.5, 7.4, "at-most", "Current drain, 7.4 V DC: TX (Max. power) Less than 2.5 A (5 W)"))],
    fullPowerOnly: true,
    sources: [ICOM_705],
  }),
  radio({
    id: "icom-ic-7300",
    name: "Icom IC-7300",
    aliases: ["icom", "hf", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    receive: amps(1.25, 13.8, "typical", "Rx … 1.25A (Maximum audio)", 0, "Volts: “Power supply requirement 13.8V DC ±15%” (same table)."),
    standby: amps(0.9, 13.8, "typical", "Rx 0.9A typical (Standby)", 0, "Volts: “Power supply requirement 13.8V DC ±15%”."),
    transmit: [
      tx(
        "100w",
        "100 W out",
        100,
        amps(21, 13.8, "typical", "Tx 21A (at 100W output power)", 0, "Volts: “Power supply requirement 13.8V DC ±15%”."),
      ),
    ],
    fullPowerOnly: true,
    sources: [ICOM_7300],
  }),
  radio({
    id: "icom-ic-7100",
    name: "Icom IC-7100",
    aliases: ["icom", "hf", "vhf", "uhf", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    receive: amps(1.2, 13.8, "typical", "Current drain (at 13.8V DC) … RX 1.2A/0.9A (Max. audio/standby)"),
    standby: amps(0.9, 13.8, "typical", "Current drain (at 13.8V DC) … RX 1.2A/0.9A (Max. audio/standby)"),
    transmit: [
      tx(
        "hf-100w",
        "HF and 50 MHz, 100 W out",
        100,
        amps(
          22,
          13.8,
          "typical",
          "Current drain (at 13.8V DC) Tx 22A (HF/50MHz)",
          0,
          "Current drain at 13.8V DC; output “HF/50MHz: 2–100W” (same table).",
        ),
      ),
      tx(
        "vu-50w",
        "144 and 430 MHz, up to 50 W out",
        50,
        amps(
          16,
          13.8,
          "typical",
          "Tx … 16A (144/440MHz)",
          0,
          "Current drain at 13.8V DC; output “144MHz: 2–50W, 430/440MHz: 2–35W” (same table).",
        ),
      ),
    ],
    fullPowerOnly: true,
    sources: [ICOM_7100],
  }),
  radio({
    id: "elecraft-kx2",
    name: "Elecraft KX2",
    aliases: ["elecraft", "hf", "qrp", "portable", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    note: "Elecraft does not tie the transmit current to an output; its spec is “80-17 meters, at least 10 W PEP” at 13.8 V.",
    receive: amps(
      0.15,
      15,
      "at-most",
      "150 mA typical in receive (backlight off, preamp off, no signal)",
      0,
      TOP_OF_RANGE("8 V min, 15 V max"),
    ),
    transmit: [
      tx(
        "tx",
        "about 10 W out",
        10,
        amps(2, 15, "at-most", "1 to 2 A typical in transmit", 0, `${TOP_OF_RANGE("8 V min, 15 V max")} The top of “1 to 2 A” is taken.`),
      ),
    ],
    fullPowerOnly: true,
    sources: [KX2],
  }),
  radio({
    id: "elecraft-kx3",
    name: "Elecraft KX3",
    aliases: ["elecraft", "hf", "qrp", "portable", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    note: "Elecraft does not tie the transmit current to an output; it gives “10 W PEP, 160-15 m”.",
    receive: amps(
      0.15,
      15,
      "at-most",
      "150 mA minimum receive, typical (backlight off, preamp off, no signal)",
      0,
      TOP_OF_RANGE("8 V min, 15 V max"),
    ),
    transmit: [
      tx(
        "tx",
        "about 10 W out",
        10,
        amps(2, 15, "at-most", "1 to 2 A typical in transmit", 0, `${TOP_OF_RANGE("8 V min, 15 V max")} The top of “1 to 2 A” is taken.`),
      ),
    ],
    fullPowerOnly: true,
    sources: [KX3],
  }),
  radio({
    id: "xiegu-x6100",
    name: "Xiegu X6100",
    aliases: ["xiegu", "hf", "qrp", "portable", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    receive: amps(
      0.45,
      15,
      "at-most",
      "电流消耗：接收：450mA@ Max",
      0,
      `“Current consumption: receive 450mA at most”. ${TOP_OF_RANGE("9.0 to 15.0 V DC (“电源电压：9.0～15.0V DC”)")}`,
    ),
    transmit: [
      tx(
        "10w",
        "10 W out",
        10,
        amps(
          3,
          15,
          "at-most",
          "发射：3A@ Max",
          0,
          `“Transmit 3A at most”; output “10W (SSB/CW/FM) ±1dB @13.8VDC”. ${TOP_OF_RANGE("9.0 to 15.0 V DC")}`,
        ),
      ),
    ],
    fullPowerOnly: true,
    sources: [X6100],
  }),
  radio({
    id: "xiegu-g90s",
    name: "Xiegu G90S",
    aliases: ["xiegu", "g90", "hf", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    note: "For the G90S. Xiegu publishes no manual for the first G90 (its download page has the G90S and G90N manuals only); the G90S is the nearest figure for it.",
    receive: amps(
      0.7,
      16.5,
      "at-most",
      "电流消耗：接收：700mA@ Max",
      0,
      `“Current consumption: receive 700mA at most”. ${TOP_OF_RANGE("10.5 to 16.5 V DC (“电源电压：10.5～16.5V DC”)")}`,
    ),
    transmit: [
      tx(
        "20w",
        "20 W out",
        20,
        amps(
          6,
          16.5,
          "at-most",
          "发射：6A@ Max",
          0,
          `“Transmit 6A at most”; output “20W (SSB/CW/NFM)”. ${TOP_OF_RANGE("10.5 to 16.5 V DC")}`,
        ),
      ),
    ],
    fullPowerOnly: true,
    sources: [G90S],
  }),
  radio({
    id: "trusdx",
    name: "(tr)uSDX",
    aliases: ["trusdx", "usdx", "hf", "qrp", "kit", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    receive: amps(0.08, 13.8, "typical", "Typically it draws 80mA on RX (with MS5351 – less with Si5351) and 500mA on TX @13,8V"),
    transmit: [
      tx(
        "5w",
        "5 W out",
        5,
        amps(
          0.5,
          13.8,
          "typical",
          "500mA on TX @13,8V and typical 85% PA Efficiency",
          0,
          "Output: “it produces typically 5W @ 13,8V Power Supply” (same page).",
        ),
      ),
    ],
    fullPowerOnly: true,
    sources: [TRUSDX],
  }),
  radio({
    id: "yaesu-ft-60",
    name: "Yaesu FT-60",
    aliases: ["yaesu", "handheld", "vhf", "uhf", "2m", "70cm"],
    mode: "fm",
    hoursPerDay: 4,
    receive: amps(0.125, 7.2, "typical", "Current Consumption: (Approx. @7.2 V) 125 mA (Receive)"),
    standby: amps(0.045, 7.2, "typical", "45 mA (144 MHz, Standby, Saver Off)", 0, "Volts: “(Approx. @7.2 V)”."),
    transmit: [
      tx("144-5w", "144 MHz, 5 W out", 5, amps(1.5, 7.2, "typical", "1.5 A (5 W TX, 144 MHz)", 0, "Volts: “(Approx. @7.2 V)”.")),
      tx("430-5w", "430 MHz, 5 W out", 5, amps(1.6, 7.2, "typical", "1.6 A (5 W TX, 430 MHz)", 0, "Volts: “(Approx. @7.2 V)”.")),
    ],
    fullPowerOnly: true,
    supply: "dc",
    sources: [FT60],
  }),
  radio({
    id: "yaesu-ft-65",
    name: "Yaesu FT-65",
    aliases: ["yaesu", "handheld", "vhf", "uhf", "2m", "70cm"],
    mode: "fm",
    hoursPerDay: 4,
    receive: amps(0.205, 7.4, "typical", "Current Consumption (Approx. @7.4V): 205 mA (Receive) 200 mW Output"),
    standby: amps(0.1, 7.4, "typical", "100 mA (Standby, Saver Off)", 0, "Volts: “(Approx. @7.4V)”."),
    transmit: [
      tx("144-5w", "144 MHz, 5 W out", 5, amps(1.5, 7.4, "typical", "1.5 A (5 W Tx , 144 MHz) 7.4 V DC")),
      tx("430-5w", "430 MHz, 5 W out", 5, amps(1.7, 7.4, "typical", "1.7 A (5 W Tx , 430 MHz) 7.4 V DC")),
    ],
    fullPowerOnly: true,
    sources: [FT65],
  }),
  radio({
    id: "yaesu-ft-70d",
    name: "Yaesu FT-70D",
    aliases: ["yaesu", "handheld", "vhf", "uhf", "c4fm", "fusion"],
    mode: "fm",
    hoursPerDay: 4,
    receive: amps(
      0.18,
      7.4,
      "typical",
      "Current Consumption(Approx.): 180 mA (Receive VOL Level 16)",
      0,
      "Volts: “Supply Voltage: Nominal: 7.4 V DC” (same table).",
    ),
    standby: amps(0.12, 7.4, "typical", "120 mA (Standby, Saver Off)", 0, "Volts: “Supply Voltage: Nominal: 7.4 V DC”."),
    transmit: [
      tx("144-5w", "144 MHz, 5 W out", 5, amps(1.6, 7.4, "typical", "1.6 A (5 W TX, 144 MHz 7.4 V DC)")),
      tx("430-5w", "430 MHz, 5 W out", 5, amps(1.9, 7.4, "typical", "1.9 A (5 W TX, 430 MHz 7.4 V DC)")),
    ],
    fullPowerOnly: true,
    sources: [FT70],
  }),
  radio({
    id: "yaesu-ft-2980",
    name: "Yaesu FT-2980 (2 m mobile)",
    aliases: ["yaesu", "mobile", "vhf", "2m", "base"],
    mode: "fm",
    hoursPerDay: 4,
    receive: amps(
      0.7,
      13.8,
      "at-most",
      "Current Consumption (typical): Rx: less than 0.7 A",
      0,
      "Volts: “Supply voltage: 13.8 V DC ±15 %” (same table).",
    ),
    standby: amps(0.3, 13.8, "at-most", "less than 0.3 A (squelched)", 0, "Volts: “Supply voltage: 13.8 V DC ±15 %”."),
    transmit: [
      tx("80w", "80 W out", 80, amps(15, 13.8, "typical", "Tx: 15 A (80 W)", 0, "Volts: “Supply voltage: 13.8 V DC ±15 %”.")),
      tx("30w", "30 W out", 30, amps(9, 13.8, "typical", "9 A (30 W)", 0, "Volts: “Supply voltage: 13.8 V DC ±15 %”.")),
      tx("10w", "10 W out", 10, amps(5, 13.8, "typical", "5 A (10 W)", 0, "Volts: “Supply voltage: 13.8 V DC ±15 %”.")),
      tx("5w", "5 W out", 5, amps(4, 13.8, "typical", "4 A (5 W)", 0, "Volts: “Supply voltage: 13.8 V DC ±15 %”.")),
    ],
    sources: [FT2980],
  }),
  radio({
    id: "yaesu-ftm-6000",
    name: "Yaesu FTM-6000 (dual-band mobile)",
    aliases: ["yaesu", "mobile", "vhf", "uhf", "base"],
    mode: "fm",
    hoursPerDay: 4,
    receive: amps(
      0.5,
      13.8,
      "typical",
      "Current Consumption (approx.): 0.5A (Receive)",
      0,
      "Volts: “Supply Voltage: Nominal 13.8V DC” (same table).",
    ),
    transmit: [
      tx(
        "144-50w",
        "144 MHz, 50 W out",
        50,
        amps(10, 13.8, "typical", "10A (50W TX, 144MHz)", 0, "Volts: “Supply Voltage: Nominal 13.8V DC”."),
      ),
      tx(
        "430-50w",
        "430 MHz, 50 W out",
        50,
        amps(10, 13.8, "typical", "10A (50W TX, 430MHz)", 0, "Volts: “Supply Voltage: Nominal 13.8V DC”."),
      ),
    ],
    fullPowerOnly: true,
    sources: [FTM6000],
  }),
  radio({
    id: "icom-id-52",
    name: "Icom ID-52",
    aliases: ["icom", "handheld", "vhf", "uhf", "d-star", "dstar"],
    mode: "fm",
    hoursPerDay: 4,
    receive: amps(0.4, 7.4, "at-most", "Current drain (at 7.4 V DC): Receive (Maximum output, 8 Ω load) FM/FM-N Less than 400 mA"),
    transmit: [tx("5w", "5 W out", 5, amps(2.5, 7.4, "at-most", "Current drain (at 7.4 V DC): Transmit (at 5 W) Less than 2.5 A"))],
    fullPowerOnly: true,
    sources: [ID52],
  }),
];

// ── Receivers, LoRa nodes, CB ────────────────────────────────────────────────

function runner(entry: Omit<RunEntry, "kind">): RunEntry {
  return { kind: "run", ...entry };
}

const USB_5V = "Volts: USB supplies 5 V; the maker's sheet gives the current for its USB power.";

const RECEIVERS: CommonDevice[] = [
  runner({
    id: "heltec-lora-32-v3",
    name: "Heltec WiFi LoRa 32 V3 (Meshtastic)",
    group: "radios",
    aliases: ["lora", "meshtastic", "node", "heltec"],
    supply: "usb",
    hoursPerDay: 24,
    note: "A node spends nearly all its time listening. Wi-Fi or Bluetooth on draws more (115 to 150 mA in the same table).",
    states: [
      {
        id: "rx",
        label: "Listening",
        figure: amps(
          0.09,
          5,
          "typical",
          "RX: TX disabled; RX enabled 90 mA",
          0,
          "Volts: “Type-C USB(≥500mA) 4.7 / 5 / 6 V” (typical 5 V, same sheet).",
        ),
      },
      {
        id: "tx",
        label: "Transmitting at 22 dBm",
        figure: amps(0.23, 5, "typical", "TX: 22dBm, USB powered, 868: 230 mA", 0, "Volts: typical USB 5 V, as above."),
      },
    ],
    sources: [
      source(
        "Chengdu Heltec Automation Technology",
        "HTIT-WB32LA_V3 LoRa Node Development Kit datasheet, Rev 1.1, September 2022",
        "https://resource.heltec.cn/download/WiFi_LoRa_32_V3/HTIT-WB32LA_V3(Rev1.1).pdf",
      ),
    ],
  }),
  runner({
    id: "rtl-sdr-blog-v4",
    name: "RTL-SDR Blog V4 (SDR dongle)",
    group: "radios",
    aliases: ["sdr", "dongle", "receiver", "rtl"],
    supply: "usb",
    hoursPerDay: 4,
    states: [
      {
        id: "typical",
        label: "Typical",
        figure: amps(0.27, 5, "typical", "Typical Current Draw 250 – 270 mA", 0, `${USB_5V} The top of the range is taken.`),
      },
    ],
    sources: [
      source(
        "RTL-SDR Blog",
        "RTL-SDR Blog V4 Datasheet V1.0",
        "https://www.rtl-sdr.com/wp-content/uploads/2024/12/RTLSDR_V4_Datasheet_V_1_0.pdf",
      ),
    ],
  }),
  runner({
    id: "rtl-sdr-blog-v3",
    name: "RTL-SDR Blog V3 (SDR dongle)",
    group: "radios",
    aliases: ["sdr", "dongle", "receiver", "rtl"],
    supply: "usb",
    hoursPerDay: 4,
    states: [
      {
        id: "typical",
        label: "Typical",
        figure: amps(
          0.28,
          5,
          "typical",
          "Typical Current Draw: 270 – 280 mA",
          0,
          "Volts: the same sheet speaks of “the 5V USB voltage”. The top of the range is taken.",
        ),
      },
    ],
    sources: [
      source(
        "RTL-SDR Blog",
        "RTL-SDR Blog V3 Datasheet",
        "https://www.rtl-sdr.com/wp-content/uploads/2018/02/RTL-SDR-Blog-V3-Datasheet.pdf",
      ),
    ],
  }),
  runner({
    id: "nooelec-nesdr-smart-v5",
    name: "Nooelec NESDR SMArt v5 (SDR dongle)",
    group: "radios",
    aliases: ["sdr", "dongle", "receiver", "nooelec"],
    supply: "usb",
    hoursPerDay: 4,
    states: [
      {
        id: "typical",
        label: "Typical",
        figure: amps(
          0.3,
          5,
          "typical",
          "Operation Supply Current Isupply … 300 (Typical) … mA",
          0,
          "Volts: “Input Voltage VUSB 5 Volts (Typical)” (same sheet).",
        ),
      },
      {
        id: "max",
        label: "At most",
        figure: amps(
          0.33,
          5,
          "at-most",
          "Operation Supply Current Isupply 270 (Min) 300 (Typical) 330 (Max) mA",
          0,
          "Volts: “Input Voltage VUSB 5 Volts (Typical)”.",
        ),
      },
    ],
    sources: [
      source(
        "Nooelec Inc.",
        "NESDR SMArt v5 datasheet, Revision 1, 4 October 2022",
        "https://www.nooelec.com/store/downloads/dl/file/id/111/product/249/nesdr_smart_rtl_sdr_v5_datasheet_revision_1.pdf",
      ),
    ],
  }),
  runner({
    id: "sdrplay-rsp1b",
    name: "SDRplay RSP1B",
    group: "radios",
    aliases: ["sdr", "receiver", "sdrplay"],
    supply: "usb",
    hoursPerDay: 4,
    states: [
      {
        id: "typical",
        label: "Typical",
        figure: amps(0.185, 5, "typical", "Low Current: 185 mA (excl bias T)", 0, `${USB_5V} “Powers over the USB cable” (same sheet).`),
      },
    ],
    sources: [
      source(
        "SDRplay Limited",
        "RSP1B datasheet, January 2024, V1.0",
        "https://sdrplay.com/wp-content/uploads/2026/06/RSP1B_Datasheet.pdf",
      ),
    ],
  }),
  runner({
    id: "tecsun-pl-330",
    name: "Tecsun PL-330 (shortwave receiver)",
    group: "radios",
    aliases: ["tecsun", "shortwave", "broadcast", "receiver", "radio"],
    supply: "usb",
    hoursPerDay: 4,
    note: "Quiescent: on, with no sound. Listening at volume draws more; Tecsun does not say how much. This manual is the copy on Tecsun Radios Australia's site.",
    states: [
      {
        id: "sw",
        label: "On shortwave, quiet",
        figure: amps(
          0.045,
          3.7,
          "at-most",
          "Quiescent Current: < 45mA (SW)",
          0,
          "Volts: “Power supply: 3.7V BL-5C Li-ion battery” (same table).",
        ),
      },
      {
        id: "fm",
        label: "On FM, MW or LW, quiet",
        figure: amps(0.025, 3.7, "at-most", "Quiescent Current: < 25mA (FM/MW/LW)", 0, "Volts: “3.7V BL-5C Li-ion battery”."),
      },
    ],
    sources: [
      source(
        "Tecsun (copy published by Tecsun Radios Australia, its distributor)",
        "PL-330 User Manual",
        "https://www.tecsunradios.com.au/store/wp-content/uploads/2021/02/PL-330-USER-MANUAL.pdf",
      ),
    ],
  }),
  runner({
    id: "midland-m-mini-usb",
    name: "Midland M-Mini USB (CB)",
    group: "radios",
    aliases: ["cb", "citizens band", "midland", "mobile"],
    supply: "dc",
    hoursPerDay: 4,
    note: "Midland gives only the most it draws, which is on transmit; listening draws less.",
    states: [{ id: "max", label: "At most", figure: amps(2, 13.2, "at-most", "Supply Voltage 13,2 V; Current Consumption 2 A max") }],
    sources: [
      source(
        "Midland Europe",
        "M-Mini-USB Instruction Guide",
        "https://support.midlandeurope.com/media/manual/b/8/c/a/b8ca3f1c38bbd39b4ef23127b7971189869111d8_MANUAL_M_MINI_USB.pdf",
      ),
    ],
  }),
];

// ── Raspberry Pi additions ──────────────────────────────────────────────────

const PI_DISPLAY_DOCS = source(
  "Raspberry Pi Ltd",
  "Raspberry Pi documentation, accessories, “Display” (display_intro.adoc in the raspberrypi/documentation repository)",
  "https://github.com/raspberrypi/documentation/blob/develop/documentation/asciidoc/accessories/display/display_intro.adoc",
);
const PI_MONITOR_DOCS = source(
  "Raspberry Pi Ltd",
  "Raspberry Pi documentation, accessories, “Raspberry Pi Monitor” (monitor_intro.adoc in the raspberrypi/documentation repository)",
  "https://github.com/raspberrypi/documentation/blob/develop/documentation/asciidoc/accessories/monitor/monitor_intro.adoc",
);

const PI_EXTRAS: CommonDevice[] = [
  runner({
    id: "raspberry-pi-touch-display-2-5in",
    name: "Raspberry Pi Touch Display 2 (5-inch)",
    group: "computers",
    aliases: ["raspberry", "pi", "display", "screen", "touch"],
    supply: "usb",
    hoursPerDay: 4,
    states: [
      {
        id: "typical",
        label: "In use",
        figure: { value: 1.4, as: { watts: 1.4 }, basis: "typical", quote: "Power consumption 1.4 W", source: 0 },
      },
    ],
    sources: [
      source(
        "Raspberry Pi Ltd",
        "Raspberry Pi Touch Display 2, 5-inch portrait, product brief (October 2026)",
        "https://datasheets.raspberrypi.com/display/touch-display-2-product-brief.pdf",
      ),
    ],
  }),
  runner({
    id: "raspberry-pi-touch-display-7in",
    name: "Raspberry Pi Touch Display (original 7-inch)",
    group: "computers",
    aliases: ["raspberry", "pi", "display", "screen", "touch"],
    supply: "usb",
    hoursPerDay: 4,
    states: [
      {
        id: "typical",
        label: "At full brightness",
        figure: amps(0.2, 5, "typical", "Power draw 200mA at 5 V typical, at maximum brightness."),
      },
    ],
    sources: [PI_DISPLAY_DOCS],
  }),
  runner({
    id: "raspberry-pi-monitor",
    name: "Raspberry Pi Monitor (15.6-inch)",
    group: "computers",
    aliases: ["raspberry", "pi", "monitor", "screen", "display"],
    supply: "usb",
    hoursPerDay: 4,
    range: true,
    states: [
      {
        id: "high",
        label: "In use, the top of the range",
        figure: {
          value: 6.5,
          as: { watts: 6.5 },
          basis: "typical",
          quote: "Power consumption: 4.5-6.5 W during use",
          source: 0,
        },
      },
      {
        id: "low",
        label: "In use, the bottom of the range",
        figure: {
          value: 4.5,
          as: { watts: 4.5 },
          basis: "typical",
          quote: "Power consumption: 4.5-6.5 W during use",
          source: 0,
        },
      },
    ],
    sources: [PI_MONITOR_DOCS],
  }),
];

// ── Internet, network and screens ───────────────────────────────────────────

const w = (watts: number, basis: Basis, quote: string, from = 0, note?: string): PublishedFigure => ({
  value: watts,
  as: { watts },
  basis,
  quote,
  source: from,
  ...(note ? { note } : {}),
});

const SYNOLOGY_TEST = source(
  "Synology Inc.",
  "How is power consumption tested on Synology devices? (knowledge centre)",
  "https://kb.synology.com/en-ca/DSM/tutorial/How_is_power_consumption_tested_on_Synology_devices",
);
const SYNOLOGY_NOTE =
  "Synology's test: “Devices that are compatible with 3.5\" drives are tested when fully loaded with HAT5300-12T”, “continuous file transfers” for access, and “all of the HDDs are in low power mode” for hibernation, averaged over a minute. Other drives draw differently.";

function synology(
  id: string,
  name: string,
  drives: number,
  accessW: number,
  sleepW: number,
  doc: string,
  url: string,
  star = "",
): RunEntry {
  return runner({
    id,
    name: `${name} NAS, ${drives} ${drives === 1 ? "drive" : "drives"}`,
    group: "connected",
    aliases: ["nas", "synology", "network storage", "diskstation"],
    supply: "ac",
    hoursPerDay: 24,
    note: SYNOLOGY_NOTE,
    states: [
      {
        id: "access",
        label: "Being used (access)",
        figure: w(
          accessW,
          "typical",
          `Power Consumption${star} ${accessW} watts (Access)`,
          0,
          `Tested with ${drives} × HAT5300-12T (Synology's knowledge centre).`,
        ),
      },
      {
        id: "hibernation",
        label: "Drives asleep (hibernation)",
        figure: w(sleepW, "typical", `${sleepW} watts (HDD Hibernation)`, 0, `Tested with ${drives} × HAT5300-12T.`),
      },
    ],
    sources: [source("Synology Inc.", doc, url), SYNOLOGY_TEST],
  });
}

const CONNECTED: CommonDevice[] = [
  runner({
    id: "fritzbox-7530-ax",
    name: "FRITZ!Box 7530 AX router",
    group: "connected",
    aliases: ["router", "broadband", "wifi", "avm", "fritz"],
    supply: "ac",
    hoursPerDay: 24,
    states: [{ id: "average", label: "Average", figure: w(6, "typical", "Average power consumption: 6 watts") }],
    sources: [
      source(
        "FRITZ! (formerly AVM)",
        "FRITZ!Box 7530 AX, technical specifications (UK)",
        "https://uk.fritz.com/products/fritzbox/fritzbox-7530-ax/technical-specifications/",
      ),
    ],
  }),
  runner({
    id: "bt-smart-hub-2",
    name: "BT Smart Hub 2 router",
    group: "connected",
    aliases: ["router", "broadband", "wifi", "bt", "hub"],
    supply: "ac",
    hoursPerDay: 24,
    note: "BT publishes its power supply's rating, not what the hub itself draws: the most it could draw.",
    states: [
      {
        id: "supply",
        label: "At most, its power supply's rating",
        figure: w(
          17.7,
          "at-most",
          "Output power (W) 17.7",
          0,
          "Power supply S018CAM1200150: “Output Voltage (V) 12.0”, “Output content (A) 1.5”.",
        ),
      },
    ],
    sources: [
      source(
        "British Telecommunications plc",
        "Power efficiency info, BT Smart Hub 2, power supply unit information, Issue 1",
        "https://www.bt.com/content/dam/bt/help/sh2-user-guides/BT-Smart-Hub-2-Power-Efficiency-information.pdf",
      ),
    ],
  }),
  runner({
    id: "tp-link-deco-be3600",
    name: "TP-Link Deco BE3600 mesh node",
    group: "connected",
    aliases: ["mesh", "wifi", "router", "deco", "tp-link"],
    supply: "ac",
    hoursPerDay: 24,
    states: [{ id: "max", label: "At most", figure: w(13.1, "at-most", "Power Consumption (without power adapter): 13.1 W max") }],
    sources: [
      source(
        "TP-Link",
        "Deco BE3600 (EU) 1.0 datasheet",
        "https://static.tp-link.com/upload/product-overview/2025/202506/20250604/Deco%20BE3600(EU)1.0_Datasheet.pdf",
      ),
    ],
  }),
  runner({
    id: "netgear-gs108",
    name: "NETGEAR GS108 network switch (8 ports)",
    group: "connected",
    aliases: ["switch", "ethernet", "netgear"],
    supply: "ac",
    hoursPerDay: 24,
    states: [
      {
        id: "max",
        label: "At most, every port busy",
        figure: w(4.92, "at-most", "Worst case, all ports used, line-rate traffic, max PoE … 4.92w [GS108v4]"),
      },
    ],
    sources: [
      source(
        "NETGEAR",
        "GS105/GS108 data sheet, DS-GS105/GS108-3",
        "https://www.downloads.netgear.com/files/GDC/datasheet/en/GS105v5-GS108v4.pdf",
      ),
    ],
  }),
  runner({
    id: "tp-link-tl-sg108s",
    name: "TP-Link TL-SG108S network switch (8 ports)",
    group: "connected",
    aliases: ["switch", "ethernet", "tp-link"],
    supply: "ac",
    hoursPerDay: 24,
    states: [{ id: "max", label: "At most", figure: w(4, "at-most", "Max Power Consumption (220V/50Hz) … 4W [TL-SG108S]") }],
    sources: [
      source(
        "TP-Link",
        "TL-SG108S v3.0 datasheet",
        "https://static.tp-link.com/upload/product-overview/2026/202609/20260924/TL-SG108S_v3.0_Datasheet.pdf",
      ),
    ],
  }),
  synology(
    "synology-ds124",
    "Synology DS124",
    1,
    10.69,
    3.44,
    "Product Specifications DS124 (last updated 6 August 2026)",
    "https://global.download.synology.com/download/Document/Hardware/ProductSpec/DiskStation/24-year/DS124/enu/Product_Spec_DS124_enu.pdf",
  ),
  synology(
    "synology-ds224-plus",
    "Synology DS224+",
    2,
    14.69,
    4.41,
    "Product Specifications DS224+ (last updated 6 August 2026)",
    "https://global.download.synology.com/download/Document/Hardware/ProductSpec/DiskStation/24-year/DS224+/enu/Product_Spec_DS224+_enu.pdf",
  ),
  synology(
    "synology-ds423-plus",
    "Synology DS423+",
    4,
    28.3,
    8.45,
    "Product Specifications DS423+ (last updated 23 April 2025)",
    "https://global.download.synology.com/download/Document/Hardware/ProductSpec/DiskStation/23-year/DS423+/enu/Product_Spec_DS423+_enu.pdf",
    "*",
  ),
  runner({
    id: "qnap-ts-233",
    name: "QNAP TS-233 NAS, 2 drives",
    group: "connected",
    aliases: ["nas", "qnap", "network storage"],
    supply: "ac",
    hoursPerDay: 24,
    note: "“Tested with drives fully populated.” QNAP does not say which drives.",
    states: [
      { id: "operating", label: "Operating, typical", figure: w(10.81, "typical", "Power Consumption: Operating Mode, Typical 10.81 W") },
      { id: "standby", label: "Drives on standby", figure: w(3.43, "typical", "Power Consumption: Disk Standby Mode 3.43 W") },
    ],
    sources: [source("QNAP Systems", "TS-233, hardware specifications", "https://www.qnap.com/en-uk/product/ts-233/specs/hardware")],
  }),
  runner({
    id: "dell-p2425h",
    name: "Dell P2425H 24-inch monitor",
    group: "connected",
    aliases: ["monitor", "screen", "display", "dell"],
    supply: "ac",
    hoursPerDay: 4,
    states: [{ id: "on", label: "On", figure: w(11.7, "typical", "On mode power demand in SDR 11,7 W") }],
    sources: [
      source(
        "European Commission, EPREL (supplier Dell)",
        "Product information sheet, electronic display, registration 1865623",
        "https://eprel.ec.europa.eu/fiches/electronicdisplays/Fiche_1865623_EN.pdf",
      ),
    ],
  }),
];

// ── Light, warmth, food and health ──────────────────────────────────────────

const RESMED_PS2 = source(
  "ResMed",
  "Power Station II User guide, 248948/1 2020-02",
  "https://ap.resmed.com/hubfs/Himalayas%20-%20B2C/SG/Sleepcare/PDF/power-station-ii_user-guide_row_mul.pdf",
);
const RESMED_AS11 = source(
  "ResMed",
  "AirSense 11 User guide (UK/EU), 398272/1 2024-08",
  "https://document.resmed.com/documents/products/machine/airsense-11/user-guide/398272_airsense11-uk-eu_user-guide_eur_mul.pdf",
);
const PHILIPS_DS2 = source(
  "Philips Respironics",
  "DreamStation 2 CPAP / Auto CPAP User manual, 1143534 R02",
  "https://www.documents.philips.com/assets/Instruction%20for%20Use/20211202/7e52e95bb1a343a4a223adf201582311.pdf",
);
const MEDICAL =
  "This is a medical device. Its maker's guide and the person's clinician govern how it is powered and for how long; Outpost gives no figure for it.";

const HOME: CommonDevice[] = [
  runner({
    id: "ikea-solhetta-806",
    name: "LED bulb, 806 lumens (IKEA SOLHETTA)",
    group: "home",
    aliases: ["lamp", "light", "bulb", "led", "ikea"],
    supply: "ac",
    hoursPerDay: 5,
    note: "One maker's 806 lm (“60 W equivalent”) bulb. Others of the same brightness differ: the base of yours says its watts.",
    states: [{ id: "rated", label: "Rated", figure: w(5, "typical", "Rated Power 5 W; Luminous flux 806 lm; Energy efficiency class C") }],
    sources: [
      source(
        "IKEA",
        "SOLHETTA LED bulb E27 806 lumen, product page (article 005.915.16)",
        "https://www.ikea.com/gb/en/p/solhetta-led-bulb-e27-806-lumen-globe-opal-white-00591516/",
      ),
    ],
  }),
  runner({
    id: "dometic-cfx3-35",
    name: "Dometic CFX3 35 compressor cool box",
    group: "home",
    aliases: ["fridge", "cool box", "cooler", "12v", "dometic", "compressor"],
    supply: "dc",
    hoursPerDay: 24,
    note: "Dometic: “the average amount of ampere hours (Ah) that the unit will use on 12V for a given ambient and set internal temperature”. Cooler air, or a warmer setting, uses less; a hotter day more. “Rated input current (DC), [A] 7.5” is the most it draws at once.",
    states: [
      {
        id: "average",
        label: "Average, 32 °C outside and 4 °C inside",
        figure: amps(
          0.98,
          12,
          "typical",
          "Energy Consumption 12VDC (Ambient@32C, Internal@4C), [Ah/h] 0.98",
          0,
          "0.98 Ah each hour at 12 V: an average of 0.98 A.",
        ),
      },
    ],
    sources: [
      source(
        "Dometic",
        "Dometic CFX3 35 (9620009572), product page, specifications",
        "https://www.dometic.com/en/product/dometic-cfx3-35-9620009572",
      ),
    ],
  }),
  runner({
    id: "kettle-3kw",
    name: "Kettle (Russell Hobbs Brontë)",
    group: "home",
    aliases: ["kettle", "inverter"],
    supply: "ac",
    hoursPerDay: 0.1,
    warning: "what an inverter must supply while it boils",
    note: "Shown for what an inverter must be able to supply: a small battery and inverter cannot run it. Boil water on a stove outdoors, or not at all.",
    states: [
      {
        id: "rated",
        label: "Rated",
        figure: w(3000, "at-most", "Wattage 3000", 0, "The page gives no unit beside the figure; its label is “Wattage”."),
      },
    ],
    sources: [
      source(
        "Russell Hobbs (Spectrum Brands UK)",
        "Brontë Kettle, Stone, model 26751, product page",
        "https://uk.russellhobbs.com/bronte-kettle-stone",
      ),
    ],
  }),
  runner({
    id: "microwave-sharp-r224h",
    name: "Microwave (Sharp R224H)",
    group: "home",
    aliases: ["microwave", "inverter", "oven"],
    supply: "ac",
    hoursPerDay: 0.1,
    warning: "what an inverter must supply: more than its cooking power",
    note: "A microwave draws more than the cooking power it is sold by: this one cooks at “Output Power: 1.2 kW” and needs 1.9 kW to start. An inverter must supply the input, not the output.",
    states: [
      { id: "initial", label: "Starting", figure: w(1900, "at-most", "Input (Initial): 1.9 kW") },
      { id: "steady", label: "Running", figure: w(1300, "typical", "Input (Steady): 1.3 kW") },
    ],
    sources: [
      source(
        "Sharp (New Zealand)",
        "R224HW Microwave Oven Operation Manual with Cooking Guide",
        "https://www.sharp.net.nz/userfiles/media/production/technical_document/rel_754/operation_manual_r224h_updated.pdf",
      ),
    ],
  }),
  {
    id: "cpap-resmed",
    name: "CPAP: ResMed AirSense",
    group: "home",
    aliases: ["cpap", "resmed", "airsense", "medical", "sleep apnoea"],
    kind: "guide",
    supply: "dc",
    text: `${MEDICAL} ResMed's Power Station II guide says its run time depends on the settings and that it is “Not applicable to devices when using heated humidification and heated tubing”, and: “Make sure to revert to AC power when the remaining capacity of RPS II and/or device internal battery is low.” Follow ResMed's guides for your machine.`,
    sources: [RESMED_PS2, RESMED_AS11],
  },
  {
    id: "cpap-philips",
    name: "CPAP: Philips DreamStation 2",
    group: "home",
    aliases: ["cpap", "philips", "dreamstation", "medical", "sleep apnoea"],
    kind: "guide",
    supply: "dc",
    text: `${MEDICAL} Philips's manual: “a Philips Respironics DC battery adapter cable, when used with a DC power cord, allows the device to be operated from a 12 VDC free-standing battery”; “Only use a Philips Respironics DC Power Cord and Battery Adapter Cable”; and “The attached battery does not support humidification.” Follow Philips's manual for your machine.`,
    sources: [PHILIPS_DS2],
  },
];

// ── Cells, batteries and power stations (read 23 November 2026) ─────────────

const READ_2 = "2026-11-23";
const sourceRead = (publisher: string, document: string, url: string): DeviceSource => ({ publisher, document, url, read: READ_2 });
/** A wattage as published. */
const watts = (w: number, basis: Basis, quote: string, from = 0, note?: string): PublishedFigure => ({
  value: w,
  as: { watts: w },
  basis,
  quote,
  source: from,
  ...(note ? { note } : {}),
});
const BU_303_LATER = sourceRead(
  "Battery University (Cadex Electronics)",
  "BU-303: Confusion with Voltages",
  "https://batteryuniversity.com/article/bu-303-confusion-with-voltages",
);

function cellOrPack(
  id: string,
  name: string,
  battery: PublishedFigure,
  sources: DeviceSource[],
  aliases: string[],
  note: string,
  bank?: ChargeEntry["bank"],
  supply: ChargeEntry["supply"] = "usb",
): ChargeEntry {
  return { id, name, group: "batteries", aliases, kind: "charge", supply, battery, sources, note, ...(bank ? { bank } : {}) };
}

const CELL_ALIASES = ["vape", "vape battery", "e-cigarette", "torch", "li-ion", "lithium", "cell", "rechargeable"];
const ONE_CELL = "One cell, charged in a charger or in the device it powers: give how many.";
const STATION_ALIASES = ["power station", "solar generator", "portable battery", "battery", "inverter"];
const STATION_NOTE = (words: string) =>
  `${words} To run a plan on it, choose it as the plan's battery bank; the limits of its own inverter and outputs are the maker's, given here.`;

const BATTERIES: CommonDevice[] = [
  // Lithium-ion cells: the 18650 and 21700 sizes used in vapes, torches and battery packs.
  cellOrPack(
    "cell-murata-vtc6",
    "18650 cell: Sony/Murata US18650VTC6",
    mah(
      3120,
      3.6,
      "Nominal Capacity* 3120 mAh; Nominal Voltage 3.6 V",
      0,
      "Murata also gives “Rated (minimum) Capacity* 3000 mAh”, discharged at 0.2 ItA (600 mA) to 2.0 V at 23 °C.",
    ),
    [
      sourceRead(
        "Murata Manufacturing Co., Ltd.",
        "Cylindrical Type Lithium Ion Secondary Battery US18650VTC6, datasheet, Version 001",
        "https://www.murata.com/-/media/webrenewal/products/batteries/cylindrical/datasheet/us18650vtc6-product-datasheet.ashx",
      ),
    ],
    ["18650", "vtc6", "sony", "murata", ...CELL_ALIASES],
    ONE_CELL,
  ),
  cellOrPack(
    "cell-molicel-p28a",
    "18650 cell: Molicel INR-18650-P28A",
    mah(2800, 3.6, "Capacity Typical 2800 mAh; Cell Voltage Nominal 3.6 V", 0, "Molicel also gives “Minimum 2600 mAh”."),
    [
      sourceRead(
        "E-One Moli Energy (Molicel)",
        "Product data sheet, model INR-18650-P28A, lithium-ion rechargeable battery (V1)",
        "https://www.molicel.com/wp-content/uploads/INR18650P28A-V1-80093.pdf",
      ),
    ],
    ["18650", "p28a", "molicel", ...CELL_ALIASES],
    ONE_CELL,
  ),
  cellOrPack(
    "cell-molicel-p42a",
    "21700 cell: Molicel INR-21700-P42A",
    mah(4200, 3.6, "Nominal Voltage 3.6 V Typical Capacity 4.2 Ah"),
    [sourceRead("E-One Moli Energy (Molicel)", "INR-21700-P42A, product page", "https://www.molicel.com/product/inr-21700-p42a/")],
    ["21700", "p42a", "molicel", ...CELL_ALIASES],
    ONE_CELL,
  ),
  // Vapes with a built-in battery, charged over USB-C.
  cellOrPack(
    "vape-voopoo-argus-g3",
    "Vape with a built-in battery: VOOPOO ARGUS G3",
    mah(1500, 3.6, "Battery Capacity: 1500 mAh", 0, NOMINAL_LI_ION),
    [sourceRead("VOOPOO", "ARGUS G3, product page", "https://www.voopoo.com/argus-series/argus-g3"), BU_303_LATER],
    ["vape", "e-cigarette", "ecig", "pod", "mod", "voopoo", "argus"],
    "A battery to charge. VOOPOO gives “Charging: Type-C 5V/2A”: up to 10 W from a USB supply.",
  ),
  cellOrPack(
    "vape-geekvape-aegis-hero-5",
    "Vape with a built-in battery: GeekVape Aegis Hero 5",
    mah(2000, 3.6, "the battery capacity has increased by more than 40% , reaching 2000mAh.", 0, NOMINAL_LI_ION),
    [sourceRead("Geekvape", "Aegis Hero 5 Pod Kit, product page", "https://www.geekvape.com/product/aegis-hero-5/"), BU_303_LATER],
    ["vape", "e-cigarette", "ecig", "pod", "mod", "geekvape", "aegis"],
    "A battery to charge. GeekVape speaks of “the 5V/2A fast charging function”: up to 10 W from a USB supply.",
  ),
  // A battery and power stations a plan can start from.
  cellOrPack(
    "victron-lifepo4-smart-12v-100ah",
    "Victron Lithium Battery Smart 12,8 V 100 Ah (LiFePO4)",
    wh(
      1280,
      "Nominal voltage 12,8 V; Nominal capacity @ 25 °C* 100 Ah; Nominal energy @ 25 °C* 1280 Wh",
      0,
      "At 0 °C Victron gives 80 Ah, at −20 °C 50 Ah.",
    ),
    [
      sourceRead(
        "Victron Energy",
        "12,8 & 25,6 Volt Lithium-Iron-Phosphate Batteries Smart, datasheet",
        "https://www.victronenergy.com/upload/documents/Datasheet-12,8-&-25,6-Volt-lithium-iron-phosphate-batteries-Smart-EN.pdf",
      ),
    ],
    ["victron", "lifepo4", "lithium", "leisure battery", "12v", "battery"],
    "A 12 V battery for a system of your own: choose it as a plan's battery bank.",
    { chemistry: "lifepo4", volts: 12.8, ampHours: 100 },
    "dc",
  ),
  cellOrPack(
    "anker-solix-c2000-gen2",
    "Anker SOLIX C2000 Gen 2 power station",
    wh(2048, "Cell Capacity: 51.2V / 40000mAh / 2,048Wh; Battery Type: LFP"),
    [
      sourceRead(
        "Anker Innovations (Anker SOLIX)",
        "Anker SOLIX C2000 Gen 2 Portable Power Station, product page (US)",
        "https://www.ankersolix.com/products/c2000-gen2",
      ),
    ],
    ["anker", "solix", "c2000", ...STATION_ALIASES],
    STATION_NOTE(
      "Anker: “The AC output delivers 2,400W continuous power and can handle peak power up to 4,000W”; AC charging 1,800 W, “100% in 88 Min”; solar 11–60 V, 800 W; two USB-C at 140 W. US model, 120 V.",
    ),
    { chemistry: "lifepo4", volts: 51.2, ampHours: 40 },
    "ac",
  ),
  cellOrPack(
    "anker-solix-c1000-gen2",
    "Anker SOLIX C1000 Gen 2 power station",
    wh(1024, "Capacity: 1,024Wh"),
    [
      sourceRead(
        "Anker Innovations (Anker SOLIX)",
        "Anker SOLIX C1000 Gen 2 Portable Power Station, product page (US)",
        "https://www.ankersolix.com/products/c1000-gen2",
      ),
    ],
    ["anker", "solix", "c1000", ...STATION_ALIASES],
    STATION_NOTE(
      "Anker: “2,000W continuous power, 3,000W peak output”; AC charging 1,200 W (1,600 W in UltraFast mode, “100% ultrafast recharging in 49 min”); solar up to 600 W, 11–60 V; USB-C up to 140 W. The page does not name the chemistry. US model, 120 V.",
    ),
    { chemistry: null, volts: null, ampHours: null },
    "ac",
  ),
  cellOrPack(
    "anker-solix-c1000",
    "Anker SOLIX C1000 power station",
    wh(1056, "Capacity: 1056Wh; Battery Type: LiFePO4 (Lithium Iron Phosphate)"),
    [
      sourceRead(
        "Anker Innovations (Anker SOLIX)",
        "Anker SOLIX C1000X Portable Power Station, product page (US), its specification for the “C1000 Portable Power Station”",
        "https://www.ankersolix.com/products/a1761111",
      ),
    ],
    ["anker", "solix", "c1000", "c1000x", ...STATION_ALIASES],
    STATION_NOTE(
      "Anker: “AC Continuous Output: 1800W Pure Sine Wave; AC Surge Output: 2400W”; AC charging up to 1,300 W, “0-100% in 58 mins”; solar up to 600 W, 11–60 V; USB-C 100 W and 30 W. US model, 120 V.",
    ),
    { chemistry: "lifepo4", volts: null, ampHours: null },
    "ac",
  ),
  cellOrPack(
    "anker-solix-c800",
    "Anker SOLIX C800 power station",
    wh(768, "Capacity: 768Wh; Battery Chemistry: LiFePO4"),
    [
      sourceRead(
        "Anker Innovations (Anker SOLIX)",
        "Anker SOLIX C800 Portable Power Station, product page (US, refurbished listing; the new model's page has gone)",
        "https://www.ankersolix.com/products/c800-refurbished",
      ),
    ],
    ["anker", "solix", "c800", ...STATION_ALIASES],
    STATION_NOTE(
      "Anker: “AC Rated Output: 1,200W; AC Surge Output: 1,920W”; AC charging 1,100 W, “a full recharge in 58 minutes” in UltraFast mode; solar up to 300 W, 11–60 V; USB-C 100 W and 30 W. US model, 120 V.",
    ),
    { chemistry: "lifepo4", volts: null, ampHours: null },
    "ac",
  ),
  cellOrPack(
    "anker-solix-c300",
    "Anker SOLIX C300 power station",
    wh(288, "Cell Capacity 288Wh"),
    [
      sourceRead(
        "Anker Innovations (Anker SOLIX)",
        "Anker SOLIX C300 (A1722) user manual",
        "https://cdn.shopify.com/s/files/1/0493/9834/9974/files/A1722_V1_US_EN_UM_Web_20240814.pdf",
      ),
      sourceRead(
        "Anker Innovations (Anker SOLIX)",
        "Anker SOLIX C300 Portable Power Station, product page (US)",
        "https://www.ankersolix.com/products/c300",
      ),
    ],
    ["anker", "solix", "c300", ...STATION_ALIASES],
    STATION_NOTE(
      "Anker: AC “300W Max”, 600 W surge (product page); AC charging “330W Max”; solar 11–28 V, 100 W; USB-C up to 140 W, and it charges over USB-C at 140 W. LiFePO4 (product page). US model, 120 V.",
    ),
    { chemistry: "lifepo4", volts: null, ampHours: null },
    "ac",
  ),
  cellOrPack(
    "anker-solix-c300-dc",
    "Anker SOLIX C300 DC power station (no mains sockets)",
    wh(288, "Cell Capacity 288Wh"),
    [
      sourceRead(
        "Anker Innovations (Anker SOLIX)",
        "Anker SOLIX C300 DC (A1726) user manual",
        "https://cdn.shopify.com/s/files/1/0493/9834/9974/files/TEM_A1726_V1_EN_UM_Web_20240913.pdf",
      ),
    ],
    ["anker", "solix", "c300", "power bank", ...STATION_ALIASES],
    "No AC sockets: “Total Output 300W” over USB and a car socket. Charged over two 140 W USB-C ports, or solar at 11–28 V, 100 W.",
    { chemistry: "lifepo4", volts: null, ampHours: null },
    "usb",
  ),
  cellOrPack(
    "jackery-explorer-1000-v2",
    "Jackery Explorer 1000 v2 power station",
    wh(
      1024,
      "1024 Wh Capacity; Capacity 1024 Wh (20Ah/51.2V DC); Cell Chemistry LiFePO4",
      0,
      "Jackery's page is not consistent: other specification blocks on it give “30.4Ah/35.2V DC (1070 Wh)”. The headline figure, the lower one, is used.",
    ),
    [sourceRead("Jackery", "Jackery Explorer 1000 v2, product page (US)", "https://www.jackery.com/products/jackery-explorer-1000-v2")],
    ["jackery", "explorer", "1000", ...STATION_ALIASES],
    STATION_NOTE(
      "Jackery: “AC Total Output 1500W Rated, 3000W Surge peak”; “Charging Time AC Adapter 1.58 Hours”; solar through two 8 mm ports, up to 400 W; USB-C 100 W and 30 W. US model, 120 V.",
    ),
    { chemistry: "lifepo4", volts: 51.2, ampHours: 20 },
    "ac",
  ),
  cellOrPack(
    "jackery-explorer-2000-plus",
    "Jackery Explorer 2000 Plus power station",
    wh(2042, "(2042Wh Capacity) … Outstanding LiFePO4 Battery with 10-Year Lifespan"),
    [
      sourceRead(
        "Jackery",
        "Jackery Explorer 2000 Plus Portable Power Station (refurbished listing, US; the new model's page has gone)",
        "https://www.jackery.com/products/jackery-explorer-2000-plus-portable-power-station-refurbished",
      ),
    ],
    ["jackery", "explorer", "2000", ...STATION_ALIASES],
    STATION_NOTE(
      "Jackery: appliances “not exceeding 3000W”; two USB-C at 100 W. The page's specification table could not be read, so no charging or solar figures are given here.",
    ),
    { chemistry: "lifepo4", volts: null, ampHours: null },
    "ac",
  ),
  cellOrPack(
    "jackery-explorer-300-plus",
    "Jackery Explorer 300 Plus power station",
    wh(288, "a large 288Wh capacity and strong 300W output … Durable LFP (LiFePO4) batteries"),
    [
      sourceRead(
        "Jackery",
        "Jackery Explorer 300 Plus, product page (Canada; discontinued)",
        "https://ca.jackery.com/products/jackery-explorer-300-plus-portable-power-station",
      ),
      sourceRead(
        "Jackery",
        "Explorer 300 Plus, product page (UK)",
        "https://uk.jackery.com/products/explorer-300-plus-portable-power-station",
      ),
    ],
    ["jackery", "explorer", "300", ...STATION_ALIASES],
    STATION_NOTE(
      "Jackery: “300W AC Pure Sine Wave Inverter (600W Surge Peak)” (UK page); “Wall Charging(80%) : 1.35 Hrs”; solar up to 100 W; “100W USB-C Input & Output”.",
    ),
    { chemistry: "lifepo4", volts: null, ampHours: null },
    "ac",
  ),
  cellOrPack(
    "ecoflow-river-2",
    "EcoFlow RIVER 2 power station",
    wh(256, "256Wh Capacity … LFP Battery Chemistry"),
    [
      sourceRead(
        "EcoFlow",
        "EcoFlow RIVER 2 Portable Power Station, product page (US)",
        "https://www.ecoflow.com/us/river-2-portable-power-station",
      ),
    ],
    ["ecoflow", "river", ...STATION_ALIASES],
    STATION_NOTE(
      "EcoFlow: “RIVER 2 has a rated power of 300W, X-Boost 600W” (X-Boost is not a surge rating); “AC Charging in 60 min”. US model, 120 V.",
    ),
    { chemistry: "lifepo4", volts: null, ampHours: null },
    "ac",
  ),
  cellOrPack(
    "goal-zero-yeti-500",
    "Goal Zero Yeti 500 power station",
    wh(499.2, "Battery Pack Capacity: 499.2 Wh (25.6 V, 20 Ah)"),
    [
      sourceRead(
        "Goal Zero",
        "Goal Zero YETI 500 Portable Power Station 499Wh LiFePO4 Battery, product page",
        "https://goalzero.com/products/yeti-500-portable-power-station-lfp-battery",
      ),
    ],
    ["goal zero", "yeti", ...STATION_ALIASES],
    STATION_NOTE(
      "Goal Zero: “AC (Inverter)(pure sine wave): 500 W Continuous, 1000 W Surge, 115 V”. LiFePO4 (the page's title). US model.",
    ),
    { chemistry: "lifepo4", volts: 25.6, ampHours: null },
    "ac",
  ),
];

// ── More things to charge and run (read 23 November 2026) ──────────────────

const PIXEL_HELP = sourceRead(
  "Google",
  "Pixel phone hardware tech specs (Pixel Phone Help)",
  "https://support.google.com/pixelphone/answer/7158570?hl=en",
);

const MORE_CHARGED: CommonDevice[] = [
  charged(
    "pixel-9",
    "Google Pixel 9",
    mah(4700, 3.6, "Minimum: 4558 mAh Typical: 4700 mAh", 0, NOMINAL_LI_ION),
    [PIXEL_HELP, BU_303_LATER],
    ["google", "android", "phone"],
  ),
  charged(
    "pixel-8",
    "Google Pixel 8",
    mah(4575, 3.6, "Minimum: 4485 mAh Typical: 4575 mAh", 0, NOMINAL_LI_ION),
    [PIXEL_HELP, BU_303_LATER],
    ["google", "android", "phone"],
  ),
  charged(
    "anker-737-24k",
    "Anker 737 Power Bank (PowerCore 24K)",
    mah(24000, 3.6, "Total Capacity: 24,000mAh", 0, NOMINAL_LI_ION),
    [
      sourceRead("Anker", "Anker 737 Power Bank (PowerCore 24K), A1289, product page", "https://www.anker.com/products/a1289"),
      BU_303_LATER,
    ],
    ["power bank", "battery pack", "anker", "powercore"],
    "What it holds; Anker does not say how much of it reaches the phones it charges.",
  ),
  charged(
    "anker-nano-10k",
    "Anker Nano Power Bank (10K, 30W)",
    mah(10000, 3.6, "Total Capacity: 10,000mAh", 0, NOMINAL_LI_ION),
    [
      sourceRead(
        "Anker",
        "Anker Nano Power Bank (30W, Built-In USB-C Cable), A1259, product page",
        "https://www.anker.com/products/a1259-built-in-cable-power-bank-10000mah",
      ),
      BU_303_LATER,
    ],
    ["power bank", "battery pack", "anker", "nano"],
    "What it holds; Anker does not say how much of it reaches the phones it charges.",
  ),
  charged(
    "fenix-hm65r-v2",
    "Fenix HM65R V2.0 head torch battery",
    mah(
      3400,
      3.6,
      "the included high-capacity 3400mAh battery recharges via an inner-waterproofed USB-C port",
      0,
      "Volts: “Fenix ARB-L18 Series 18650* 3.6 V Recommended” (the same page's battery table).",
    ),
    [
      sourceRead(
        "Fenix Lighting USA",
        "Fenix HM65R V2.0 Rechargeable Headlamp, product page",
        "https://www.fenixlighting.com/products/fenix-hm65r-v2-rechargeable-headlamp",
      ),
    ],
    ["head torch", "headlamp", "torch", "fenix", "18650"],
    "Its 18650 cell (ARB-L18-3400), charged in the torch over USB-C: “approximately 2.5 hours … with a 5 V/1.8 A or above charging adapter”.",
  ),
  charged(
    "petzl-swift-rl",
    "Petzl SWIFT RL head torch battery",
    mah(2350, 3.7, "The rechargeable battery, 2350 mAh (3,7 V / 8,69 Wh)"),
    [
      sourceRead(
        "Petzl",
        "SWIFT RL rechargeable battery (E092DB00), product page",
        "https://www.petzl.com/INT/en/Professional/Headlamps/SWIFT-RL-Rechargeable-Battery",
      ),
    ],
    ["head torch", "headlamp", "torch", "petzl", "swift"],
    "Petzl gives “Recharge time 5 h”.",
  ),
  charged(
    "biolite-alpenglow-500",
    "BioLite AlpenGlow 500 lantern",
    wh(23.6, "Battery 6400 mAh (23.6 Wh) Li-Ion"),
    [sourceRead("BioLite", "BioLite AlpenGlow 500, product page", "https://www.bioliteenergy.com/products/alpenglow-500")],
    ["lantern", "lamp", "light", "biolite", "camping"],
    "Charged over USB; it can also charge a phone (“1x USB A, 5V / 2.4A”).",
  ),
  {
    id: "xiaomi-mini-fan",
    name: "USB fan: Xiaomi Rechargeable Mini Fan",
    group: "home",
    aliases: ["fan", "usb fan", "xiaomi", "cooling"],
    kind: "run",
    supply: "usb",
    hoursPerDay: 8,
    note: "Its rating is the most it draws, on the highest speed or while charging; Xiaomi gives “running continuously for 18.5 hours at speed setting 1” on its 4000mAh battery.",
    states: [{ id: "rated", label: "At most, its rating", figure: watts(10, "at-most", "Rated voltage 5V Rated power 10W") }],
    sources: [
      sourceRead(
        "Xiaomi",
        "Xiaomi Rechargeable Mini Fan, specifications",
        "https://www.mi.com/global/product/xiaomi-rechargeable-mini-fan/specs/",
      ),
    ],
  },
  {
    id: "starlink-mini",
    name: "Starlink Mini",
    group: "connected",
    aliases: ["starlink", "satellite", "internet", "dish"],
    kind: "run",
    supply: "dc",
    hoursPerDay: 24,
    note: "Runs from 12 to 48 V DC or a USB-C PD supply of 100 W. More in snow-melt or when heating.",
    states: [
      {
        id: "average",
        label: "Average, the top of Starlink's range",
        figure: watts(40, "typical", "Power Consumption Average: 25-40W", 0, "The top of the range is taken."),
      },
      { id: "rating", label: "At most, its input rating", figure: watts(60, "at-most", "Input Rating 12-48V 60W") },
    ],
    sources: [
      sourceRead("Starlink (SpaceX)", "Mini specifications, Mini Kit", "https://starlink.com/public-files/specification_sheet_mini.pdf"),
    ],
  },
  {
    id: "starlink-standard",
    name: "Starlink Standard",
    group: "connected",
    aliases: ["starlink", "satellite", "internet", "dish"],
    kind: "run",
    supply: "ac",
    hoursPerDay: 24,
    note: "Through its own mains power supply, so through an inverter from a battery.",
    states: [
      {
        id: "average",
        label: "Average, the top of Starlink's range",
        figure: watts(100, "typical", "Power Consumption Average: 75 - 100 W", 0, "The top of the range is taken."),
      },
    ],
    sources: [
      sourceRead(
        "Starlink (SpaceX)",
        "Standard 4 X Kit specifications, February 2026",
        "https://starlink.com/public-files/specification_sheet_standard.pdf",
      ),
    ],
  },
  {
    id: "victron-smartsolar-75-15",
    name: "Solar charge controller: Victron SmartSolar MPPT 75/15",
    group: "batteries",
    aliases: ["victron", "mppt", "charge controller", "solar", "regulator"],
    kind: "run",
    supply: "dc",
    hoursPerDay: 24,
    note: "Its own draw, night and day: small, but always there.",
    states: [
      { id: "load-on", label: "Load output on, 12 V", figure: amps(0.019, 12, "typical", "Self-consumption – load on 12 V: 19 mA") },
      { id: "load-off", label: "Load output off, 12 V", figure: amps(0.01, 12, "typical", "Self-consumption – load off 12 V: 10 mA") },
    ],
    sources: [
      sourceRead(
        "Victron Energy",
        "SmartSolar Charge Controllers with load output, MPPT 75/10, 75/15, 100/15, 100/20-48 V, datasheet",
        "https://www.victronenergy.com/upload/documents/Datasheet-SmartSolar-charge-controller-MPPT-75-10,-75-15,-100-15,-100-20_48V-EN.pdf",
      ),
    ],
  },
  {
    id: "webasto-air-top-2000-stc",
    name: "Diesel air heater: Webasto Air Top 2000 STC",
    group: "home",
    aliases: ["heater", "diesel heater", "night heater", "webasto", "warmth", "van"],
    kind: "run",
    supply: "dc",
    hoursPerDay: 8,
    note: "The electricity it takes to run (its fan, pump and controls), not the heat it gives; more while it starts. Webasto has stopped making it.",
    states: [
      {
        id: "high",
        label: "Full heat",
        figure: watts(29, "typical", "Power consumption: 1.25 – 2.45 Amps (14 – 29 Watts)", 0, "The top of the range."),
      },
      {
        id: "low",
        label: "Lowest heat",
        figure: watts(14, "typical", "Power consumption: 1.25 – 2.45 Amps (14 – 29 Watts)", 0, "The bottom of the range."),
      },
    ],
    sources: [
      sourceRead(
        "Webasto",
        "Webasto Air Top 2000 STC, product page (US)",
        "https://www.webasto.com/en-us/heating/air-heaters/air-top-2000-stc.html",
      ),
    ],
  },
];

// ── More radios (read 23 November 2026) ─────────────────────────────────────

const FT818ND = sourceRead(
  "Yaesu Musen",
  "FT-818ND Operating Manual (2003u-ES)",
  "https://www.yaesu.com/Files/4CB893D7-1018-01AF-FA97E9E9AD48B50C/FT-818ND_OM_ENG_E13772004_2003u-ES-1.pdf",
);
const FT5DR = sourceRead(
  "Yaesu Musen",
  "FT5DR/FT5DE Operating Manual (EH082M201, 2406d-KS-1)",
  "https://www.yaesu.com/Files/DFDF4D53-1B78-7375-E6C7A6E4B192BE13/FT5DR_DE_OM_ENG_EH082M201_2406d-KS-1.pdf",
);
const THD75 = sourceRead(
  "JVCKENWOOD Corporation",
  "TH-D75A/E Operating Tips, 17 May 2024",
  "https://www.kenwood.com/i/products/info/amateur/pdf/TH-D75AE_IDM.pdf",
);
const ICOM_7610 = sourceRead("Icom Inc.", "IC-7610, specifications", "https://www.icomjapan.com/lineup/products/IC-7610/specifications/");
const ICOM_9700 = sourceRead("Icom Inc.", "IC-9700, specifications", "https://www.icomjapan.com/lineup/products/IC-9700/specifications/");
const UV5R = sourceRead(
  "Baofeng (the manual on its own site, baofengradio.com)",
  "UV-5R & GT-3 Series User Manual V1.0, October 2020",
  "https://baofeng.s3.amazonaws.com/Baofeng%20UV-5R%20%26%20GT-3%20Series%20User%20Manual_Digital%20Version_20201023.pdf",
);
const UV5R_BATTERY = sourceRead(
  "Baofeng (baofengradio.com)",
  "Battery 1800mAh for UV-5R, product page",
  "https://www.baofengradio.com/products/battery-1800mah-for-uv-5r",
);
const FT818_VOLTS = "Volts: “Supply Voltage: Nominal: 13.8 VDC ± 15 %” (same table).";
const FT5_VOLTS = "Volts: the manual gives none beside the receive current; its transmit figures are at 7.4 V DC.";
const D75_VOLTS = "Volts: “BATT DC 6.0 - 9.6 V (STD: DC 7.4 V)” (same table).";

const MORE_RADIOS: CommonDevice[] = [
  radio({
    id: "yaesu-ft-818nd",
    name: "Yaesu FT-818ND",
    aliases: ["yaesu", "ft-818", "ft818", "hf", "vhf", "uhf", "qrp", "portable", "transceiver"],
    mode: "ssb",
    hoursPerDay: 2,
    receive: amps(0.45, 13.8, "typical", "Receive: 450 mA", 0, FT818_VOLTS),
    standby: amps(0.3, 13.8, "typical", "Squelched: 300 mA (Approx.)", 0, FT818_VOLTS),
    transmit: [
      tx(
        "430-6w",
        "430 MHz, 6 W out",
        6,
        amps(2.7, 13.8, "typical", "Transmit: 2.7 A (430 MHz)", 0, `${FT818_VOLTS} Output “6 W (SSB/CW/FM) … @13.8 V”.`),
      ),
      tx(
        "hf-6w",
        "HF, 50 and 144 MHz, 6 W out",
        6,
        amps(2.4, 13.8, "typical", "Transmit: 2.4 A (HF/50 MHz/144 MHz)", 0, `${FT818_VOLTS} Output “6 W (SSB/CW/FM) … @13.8 V”.`),
      ),
    ],
    fullPowerOnly: true,
    sources: [FT818ND],
  }),
  radio({
    id: "icom-ic-7610",
    name: "Icom IC-7610",
    aliases: ["icom", "hf", "sdr", "transceiver", "base"],
    mode: "ssb",
    hoursPerDay: 2,
    receive: amps(3.5, 13.8, "typical", "Rx 3.0 A (Standby), 3.5 A (Maximum audio)", 0, "Volts: “Power supply requirement 13.8V DC ±15%”."),
    standby: amps(3, 13.8, "typical", "Rx 3.0 A (Standby)", 0, "Volts: “Power supply requirement 13.8V DC ±15%”."),
    transmit: [
      tx(
        "100w",
        "100 W out",
        100,
        amps(
          23,
          13.8,
          "typical",
          "Power consumption Tx 23 A (at 100 W output power)",
          0,
          "Volts: “Power supply requirement 13.8V DC ±15%”.",
        ),
      ),
    ],
    fullPowerOnly: true,
    sources: [ICOM_7610],
  }),
  radio({
    id: "icom-ic-9700",
    name: "Icom IC-9700",
    aliases: ["icom", "vhf", "uhf", "23cm", "satellite", "transceiver", "base"],
    mode: "fm",
    hoursPerDay: 2,
    receive: amps(1.8, 13.8, "at-most", "Less than 1.8 A (Maximum audio)", 0, "Volts: “13.8 V DC ±15% (Negative ground)”."),
    standby: amps(1.2, 13.8, "typical", "Rx 1.2 A typical (Standby)", 0, "Volts: “13.8 V DC ±15% (Negative ground)”."),
    transmit: [
      tx(
        "high",
        "High power: 100 W on 144 MHz, 75 W on 430, 10 W on 1200",
        100,
        amps(18, 13.8, "at-most", "Tx Less than 18 A (High power)", 0, "Volts: “13.8 V DC ±15% (Negative ground)”."),
      ),
    ],
    fullPowerOnly: true,
    sources: [ICOM_9700],
  }),
  radio({
    id: "yaesu-ft5dr",
    name: "Yaesu FT5DR",
    aliases: ["yaesu", "ft5d", "ft-5dr", "handheld", "vhf", "uhf", "c4fm", "fusion"],
    mode: "fm",
    hoursPerDay: 4,
    receive: amps(0.18, 7.4, "typical", "Current Consumption (Approx.) 180 mA (Mono Band Receive)", 0, FT5_VOLTS),
    standby: amps(0.11, 7.4, "typical", "110 mA (Mono Band Receive, Standby)", 0, FT5_VOLTS),
    transmit: [
      tx("430-5w", "430 MHz, 5 W out", 5, amps(1.9, 7.4, "typical", "1.9 A (5 W TX, 430 MHz 7.4 V DC)")),
      tx("144-5w", "144 MHz, 5 W out", 5, amps(1.6, 7.4, "typical", "1.6 A (5 W TX, 144 MHz 7.4 V DC)")),
    ],
    fullPowerOnly: true,
    sources: [FT5DR],
  }),
  radio({
    id: "kenwood-th-d75",
    name: "Kenwood TH-D75",
    aliases: ["kenwood", "th-d75", "d75", "handheld", "vhf", "uhf", "d-star", "aprs"],
    mode: "fm",
    hoursPerDay: 4,
    receive: amps(0.26, 7.4, "typical", "Current Consumption (TYP.) RX SINGLE 260 mA (Rated Power)", 0, D75_VOLTS),
    standby: amps(0.155, 7.4, "typical", "155 mA (SQ Close)", 0, D75_VOLTS),
    transmit: [
      tx(
        "5w",
        "High, 5 W out",
        5,
        amps(
          2,
          7.4,
          "at-most",
          "Current Consumption (TYP.) TX EXT.PS 13.8 V / Battery:7.4 V … H 1.4 A … 2.0 A",
          0,
          "The table gives 1.4 A and 2.0 A for high power, one at 13.8 V and one on the 7.4 V battery, in rows that are hard to tell apart; the higher current is taken at 7.4 V, so the figure is the most it could be. Output “H 5W”.",
        ),
      ),
    ],
    fullPowerOnly: true,
    sources: [THD75],
  }),
  radio({
    id: "baofeng-uv-5r",
    name: "Baofeng UV-5R",
    aliases: ["baofeng", "uv5r", "uv-5r", "handheld", "vhf", "uhf", "2m", "70cm", "walkie talkie"],
    mode: "fm",
    hoursPerDay: 4,
    note: "From the manual on Baofeng's own site (baofengradio.com); UV-5R models sold by others may differ.",
    receive: amps(0.38, 7.4, "typical", "Consumption 380mA (reception)", 0, "Volts: “Supply voltage 7.4V” (same table)."),
    standby: amps(0.075, 7.4, "at-most", "≤75mA (standby)", 0, "Volts: “Supply voltage 7.4V”."),
    transmit: [
      tx(
        "5w",
        "5 W out",
        5,
        amps(
          1.4,
          7.4,
          "at-most",
          "≤1.4A(transmission)",
          0,
          "Volts: “Supply voltage 7.4V”; output “UV-5R/UV-5R+Plus/UV-5R EX/GT-3: 5W/1W”.",
        ),
      ),
    ],
    fullPowerOnly: true,
    sources: [UV5R],
  }),
  runner({
    id: "rak-wisblock-rak4631",
    name: "RAK WisBlock RAK4631 (Meshtastic)",
    group: "radios",
    aliases: ["lora", "meshtastic", "node", "rak", "wisblock", "rak4631"],
    supply: "dc",
    hoursPerDay: 24,
    note: "The core module alone: the base board, a display and sensors add more. A node spends nearly all its time listening.",
    states: [
      {
        id: "rx",
        label: "Listening (LoRa)",
        figure: amps(
          0.017,
          3.3,
          "typical",
          "Rx mode LoRa @37.5 Kbps 17 mA",
          0,
          "Volts: the module's typical supply, “VBAT_SX SX1262 supply voltage 2.0 3.3 3.7 V” (min, typical, max), same page.",
        ),
      },
      {
        id: "tx",
        label: "Transmitting at 20 dBm",
        figure: amps(
          0.125,
          3.3,
          "typical",
          "Tx mode LoRa @20 dBm 125 mA",
          0,
          "Printed “12 5mA” on the page. Volts: typical 3.3 V, as above.",
        ),
      },
    ],
    sources: [
      sourceRead(
        "RAKwireless",
        "RAK4631 WisBlock LoRaWAN Module Datasheet",
        "https://docs.rakwireless.com/product-categories/wisblock/rak4631/datasheet/",
      ),
    ],
  }),
  // Their batteries.
  charged(
    "pack-yaesu-sbr-14li",
    "Yaesu FT5DR battery (SBR-14LI)",
    mah(2200, 7.2, "Rechargeable Li-Ion Battery Pack (7.2V, 2,200mAh) SBR-14LI"),
    [FT5DR],
    ["yaesu", "ft5d", "handheld", "radio", "battery pack"],
  ),
  charged(
    "pack-kenwood-knb-75la",
    "Kenwood TH-D75 battery (KNB-75LA)",
    mah(1820, 7.4, "KNB-75LA (1,820 mAh)", 0, D75_VOLTS),
    [THD75],
    ["kenwood", "th-d75", "handheld", "radio", "battery pack"],
  ),
  charged(
    "pack-baofeng-uv-5r",
    "Baofeng UV-5R battery (1,800 mAh)",
    mah(1800, 7.4, "1 x 1800mAh Li-ion Battery", 0, "Volts: “Type: Li-ion | Voltage: 7.4V” (Baofeng's page for the battery)."),
    [UV5R, UV5R_BATTERY],
    ["baofeng", "uv-5r", "uv5r", "handheld", "radio", "battery pack"],
  ),
  charged(
    "pack-anytone-d878uvii",
    "AnyTone AT-D878UVII PLUS battery",
    mah(3100, 7.4, "Operating Voltage 7.4V DC ±20% (3100mAh)"),
    [sourceRead("Qixiang Electron (AnyTone)", "AT-D878UVII PLUS, product page", "https://www.anytone.net/pro_info102.html")],
    ["anytone", "d878", "dmr", "handheld", "radio", "battery pack"],
    "AnyTone publishes no current drawn, so only its battery is here.",
  ),
  charged(
    "garmin-inreach-mini-2",
    "Garmin inReach Mini 2 (satellite messenger)",
    mah(1250, 3.6, "Battery capacity 1,250 mAh", 0, NOMINAL_LI_ION),
    [
      sourceRead(
        "Garmin",
        "inReach Mini 2 Owner's Manual, October 2026",
        "https://www8.garmin.com/manuals/webhelp/GUID-802DEF62-EBB2-463C-8C51-C58FB29F89E3/EN-US/inReach_Mini_2_OM_EN-US.pdf",
      ),
      BU_303_LATER,
    ],
    ["garmin", "inreach", "satellite", "sos", "messenger", "gps"],
    "“Rechargeable, built-in lithium-ion battery”, charged over USB-C.",
  ),
];

// ── Type it from the label ──────────────────────────────────────────────────

function label(
  id: string,
  name: string,
  group: LabelEntry["group"],
  unit: LabelEntry["unit"],
  hint: string,
  aliases: string[] = [],
): LabelEntry {
  return { id, name, group, aliases, kind: "label", supply: unit === "Wh" ? "usb" : "dc", unit, hint, sources: [] };
}

const LABELS: CommonDevice[] = [
  label(
    "another-phone",
    "Another phone or tablet",
    "charged",
    "Wh",
    "Add it as a device of your own with its battery's mAh and volts, or its Wh. They are on the battery, in the phone's settings, or in its maker's product information sheet.",
    ["phone", "tablet", "android"],
  ),
  label(
    "a-laptop",
    "A laptop",
    "charged",
    "Wh",
    "Its battery's Wh is printed on the battery or under the laptop. Add it as a device of your own.",
    ["laptop", "notebook"],
  ),
  label(
    "an-e-reader",
    "An e-reader",
    "charged",
    "Wh",
    "Amazon publishes no battery figure for Kindles; others rarely do. Read mAh and volts from the battery or the label, and add it as a device of your own.",
    ["kindle", "kobo", "ereader"],
  ),
  label(
    "a-watch",
    "A watch",
    "charged",
    "Wh",
    "Apple publishes no battery figure for Apple Watch. Read mAh and volts from the label where there is one, and add it as a device of your own.",
    ["watch", "smartwatch", "apple watch"],
  ),
  label(
    "a-pmr446-radio",
    "A PMR446 handheld",
    "radios",
    "Wh",
    "Makers give the pack's mAh (Motorola Talkabout: 800 mAh NiMH; Midland G7 Pro: 4 AA cells of 1,800 mAh) but not its volts or the current drawn. Read them from the pack, and add it as a device of your own.",
    ["pmr", "pmr446", "walkie talkie", "motorola", "midland"],
  ),
  label(
    "another-lamp",
    "Another lamp or lantern",
    "home",
    "W",
    "LED lamps say their watts on the base or the box. A rechargeable lantern: add it as a device of your own that is charged, with its battery's mAh and volts.",
    ["lamp", "light", "lantern", "torch"],
  ),
  label(
    "a-fan",
    "A USB or 12 V fan",
    "home",
    "W",
    "Its label gives volts and amps (or watts): volts × amps is the most it draws. Add it as a device of your own.",
    ["fan", "usb", "12v"],
  ),
  label(
    "an-electric-blanket",
    "An electric blanket",
    "home",
    "W",
    "Its watts are on the label by the plug or on the controller. It draws less on a low setting. Add it as a device of your own; it needs an inverter.",
    ["blanket", "heated", "warmth"],
  ),
  label(
    "an-ont-or-modem",
    "Fibre box (ONT) or modem",
    "connected",
    "W",
    "Openreach and others do not publish what their fibre boxes draw. Its power supply's label gives the most it can (volts × amps). Add it as a device of your own.",
    ["ont", "openreach", "fibre", "modem", "broadband"],
  ),
  label(
    "a-medical-charger",
    "A medical device's charger",
    "home",
    "W",
    "Read the watts (or volts × amps) from the charger's label, and add it as a device of your own. The maker's guide and the person's clinician govern how it is used and powered.",
    ["medical", "hearing aid", "charger"],
  ),
];

/** Every entry, grouped as `DEVICE_GROUPS` and in the order they are offered. */
export const COMMON_DEVICES: readonly CommonDevice[] = [
  ...COMPUTERS,
  ...PI_EXTRAS,
  ...CHARGED,
  ...MORE_CHARGED,
  ...BATTERIES,
  ...RADIOS,
  ...RECEIVERS,
  ...MORE_RADIOS,
  ...CONNECTED,
  ...HOME,
  ...LABELS,
];

// ── Charging losses ─────────────────────────────────────────────────────────

/**
 * Charging over USB: no standards body, national lab or maker publishes one figure for
 * the energy a phone loses between its USB socket and its cell, so 80% is Outpost's
 * assumption, said to be one wherever it is used. What is published: a lithium-ion
 * cell's own energy efficiency is about 97% at 0.5C (Battery University, BU-808c), and the
 * charging circuit loses more besides.
 */
export const USB_CHARGING: ChargingStep = {
  id: "charger",
  label: "Charging over USB",
  share: 0.8,
  basis:
    "80% is Outpost's assumption: no published figure was found for what a phone loses between its USB socket and its battery. Battery University gives a lithium-ion cell's own energy efficiency as “about 97 percent at 0.5C” (BU-808c); the charging circuit loses more.",
  assumption: true,
};

/** The converter from a 12 V battery to USB: one maker's typical figure for a 12 V to 5 V converter. */
export const USB_CONVERTER: ChargingStep = {
  id: "converter",
  label: "12 V to USB converter",
  share: 0.71,
  basis:
    "71% is one maker's typical figure for a converter from 9.2 to 18 V down to 5 V (MEAN WELL, SD-25A-5 specification: “EFFICIENCY (Typ.) 71%”). Your converter's or car charger's data sheet is better.",
  assumption: false,
};

/** The sources of the charging figures, for the docs and the screen. */
export const CHARGING_SOURCES: readonly DeviceSource[] = [
  source(
    "Battery University (Cadex Electronics)",
    "BU-808c: Coulombic and Energy Efficiency with the Battery",
    "https://batteryuniversity.com/article/bu-808c-coulombic-and-energy-efficiency-with-the-battery",
  ),
  source("MEAN WELL", "SD-25 series specification", "https://www.meanwell.com/Upload/PDF/SD-25/SD-25-SPEC.PDF"),
];

// ── Safety where the calculators touch it ───────────────────────────────────

/** Official guidance, quoted as published, on charging, extension leads and generators. Nothing of Outpost's own. */
export const CHARGING_SAFETY: ReadonlyArray<{ quote: string; who: string; url: string; read: string }> = [
  {
    quote:
      "Charge your battery in a safe location that does not block fire escape routes or exits. Do not cover the charger or battery. Charge when you are awake and present, not when you are asleep or away from home. Unplug once the battery is fully charged.",
    who: "Office for Product Safety and Standards, GOV.UK, “Buy Safe, Be Safe: avoid e-bike and e-scooter fires”",
    url: "https://www.gov.uk/guidance/buy-safe-be-safe-avoid-e-bike-and-e-scooter-fires",
    read: READ,
  },
  {
    quote:
      "Don’t leave items continuously on charge after the charge cycle is complete – it's best not to leave your phone plugged in overnight for example.",
    who: "London Fire Brigade, “Batteries and chargers”",
    url: "https://www.london-fire.gov.uk/safety/the-home/electrical-items/batteries-and-chargers/",
    read: READ,
  },
  {
    quote: "Never cover chargers or charging devices – that includes using your laptop power lead in bed.",
    who: "London Fire Brigade, “Batteries and chargers”",
    url: "https://www.london-fire.gov.uk/safety/the-home/electrical-items/batteries-and-chargers/",
    read: READ,
  },
  {
    quote:
      "Check the current rating of the extension lead before plugging appliances into it. Most extension leads are rated at 13A but some older ones and many cable reels may be only 10A or less.",
    who: "Electrical Safety First, “Overloading sockets”",
    url: "https://www.electricalsafetyfirst.org.uk/safety-advice/home-and-people/house-maintenance/overloading-sockets/",
    read: READ,
  },
  {
    quote: "Power-hungry appliances such as kettles, toasters and microwaves shouldn't be on the same extension.",
    who: "London Fire Brigade, “Cables, fuses and leads”",
    url: "https://www.london-fire.gov.uk/safety/the-home/electrical-items/cables-fuses-and-leads/",
    read: READ,
  },
  {
    quote:
      "Do not use petrol or diesel generators or other similar fuel driven equipment indoors as the exhaust gases contain carbon monoxide.",
    who: "The UK Chief Medical Officers, GOV.UK, “Public health advice from UK CMOs during a national power outage”",
    url: "https://www.gov.uk/government/publications/public-health-advice-from-uk-cmos-during-a-national-power-outage/keeping-warm-or-cool-in-extreme-weather-scripts-for-broadcast-media",
    read: READ,
  },
  {
    quote:
      "If you have a generator, place it outdoors at least 6 metres or 20 feet away, with the exhaust facing away from windows or doors.",
    who: "The UK Chief Medical Officers, GOV.UK, as above",
    url: "https://www.gov.uk/government/publications/public-health-advice-from-uk-cmos-during-a-national-power-outage/keeping-warm-or-cool-in-extreme-weather-scripts-for-broadcast-media",
    read: READ,
  },
];
