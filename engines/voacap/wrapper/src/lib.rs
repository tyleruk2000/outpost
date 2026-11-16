//! Outpost's bridge to the VOACAP engine (the `hfcast` crate).
//!
//! One request in as JSON, one answer out as JSON. Nothing is worked out here: the
//! request is handed to the engine's own entry points (`hfcast::api`) and the numbers
//! it returns are written out as they are. The engine's files (coefficients, antenna
//! definitions) are read from the directory the request names in `root`.
//!
//! Built for `wasm32-wasip1` the three exported functions below are the whole
//! interface; built natively the same `answer` is used by the tests and by
//! `src/bin/outpost-voacap.rs`, which exists to compare this build with the WebAssembly
//! one and with the Fortran original.

use std::path::PathBuf;

use hfcast::api::{
    self, AntennaChoice, EfVar, FoF2Model, HourPrediction, Ionosphere, Model, MufHourOut, Numerics, ParRow, Recompute,
    Report, Request, Site, Son, Task,
};
use hfcast::json::{self, num, obj, str_of, Json};

/// The layer a mode reflects from, as the listing names it.
fn layer(index: i32) -> &'static str {
    match index {
        1 => "E",
        2 => "F1",
        3 => "F2",
        4 => "Es",
        _ => "",
    }
}

fn n(value: f32) -> Json {
    if value.is_finite() {
        num(f64::from(value))
    } else {
        Json::Null
    }
}

fn site(req: &Json, key: &str) -> Result<Site, String> {
    let spec = req.get(key).ok_or_else(|| format!("\"{key}\" is missing"))?;
    Ok(Site {
        name: spec.get("name").and_then(Json::as_str).unwrap_or("").to_string(),
        lat_deg: spec.number("lat")?,
        lon_deg: spec.number("lon")?,
    })
}

fn antennas(req: &Json, key: &str) -> Result<Vec<AntennaChoice>, String> {
    let Some(list) = req.get(key).and_then(Json::as_array) else {
        return Ok(Vec::new());
    };
    list.iter()
        .map(|spec| {
            Ok(AntennaChoice {
                file: spec.string("file")?,
                design_freq: spec.get("designFreq").and_then(Json::as_f64).unwrap_or(0.0),
                beam_deg: spec.get("beamDeg").and_then(Json::as_f64).unwrap_or(0.0),
                min_freq: spec.get("minFreq").and_then(Json::as_f64).unwrap_or(2.0) as i32,
                max_freq: spec.get("maxFreq").and_then(Json::as_f64).unwrap_or(30.0) as i32,
                last_field: None,
            })
        })
        .collect()
}

fn triple(spec: &Json, key: &str) -> Result<[f64; 3], String> {
    let list = spec.get(key).and_then(Json::as_array).ok_or_else(|| format!("\"{key}\" must be three numbers"))?;
    if list.len() != 3 {
        return Err(format!("\"{key}\" must be three numbers"));
    }
    let mut out = [0.0; 3];
    for (slot, value) in out.iter_mut().zip(list) {
        *slot = value.as_f64().ok_or_else(|| format!("\"{key}\" must be three numbers"))?;
    }
    Ok(out)
}

/// The layer parameters a person has measured, one set per control point: the engine's
/// `EFVAR` cards, which only stand when the run is told to keep the layers.
fn ionosphere(req: &Json) -> Result<Ionosphere, String> {
    let mut out = Ionosphere::default();
    if let Some(list) = req.get("layers").and_then(Json::as_array) {
        for spec in list {
            out.layers.push(EfVar {
                area: spec.number("point")? as usize,
                fi: triple(spec, "critical")?,
                yi: triple(spec, "semithickness")?,
                hi: triple(spec, "height")?,
            });
        }
        if !out.layers.is_empty() {
            out.recompute = Recompute::KeepLayers;
        }
    }
    Ok(out)
}

fn request(req: &Json) -> Result<Request, String> {
    let freqs = req
        .get("freqs")
        .and_then(Json::as_array)
        .ok_or("\"freqs\" must be a list of frequencies in MHz")?
        .iter()
        .map(|f| f.as_f64().ok_or_else(|| "\"freqs\" must be a list of frequencies in MHz".to_string()))
        .collect::<Result<Vec<f64>, String>>()?;
    let sporadic_e = matches!(req.get("sporadicE"), Some(Json::Bool(true)));
    Ok(Request {
        tx: site(req, "tx")?,
        rx: site(req, "rx")?,
        month: req.number("month")? as u32,
        year: req.number("year")? as u32,
        ssn: req.number("ssn")?,
        power_watts: req.number("powerWatts")?,
        freqs_mhz: freqs,
        required_snr_db: req.number("requiredSnrDb")?,
        noise_dbw: req.number("noiseDbw")?,
        fof2: FoF2Model::Ccir,
        layer_multipliers: [1.0, 1.0, 1.0, if sporadic_e { 0.7 } else { 0.0 }],
        tx_antennas: antennas(req, "txAntennas")?,
        rx_antennas: antennas(req, "rxAntennas")?,
        ionosphere: ionosphere(req)?,
        // The tier that is held to the Fortran original, with the original's arithmetic.
        model: Model::Compatible,
        numerics: Numerics::reference(),
    })
}

/// One frequency of one hour: the rows of the engine's method 30 table, by name.
fn slot(mhz: f32, s: &Son, long_model: bool) -> Json {
    if s.nhp <= 0 && !long_model && s.mode_layer <= 0 {
        return obj([("mhz", n(mhz)), ("mode", Json::Null)]);
    }
    let mode = if long_model {
        format!("{}{}", layer(s.mode_layer), layer(s.moder_layer))
    } else {
        format!("{}{}", s.nhp, layer(s.mode_layer))
    };
    obj([
        ("mhz", n(mhz)),
        ("mode", str_of(&mode)),
        ("hops", num(f64::from(s.nhp))),
        ("layer", str_of(layer(s.mode_layer))),
        ("takeoffDeg", n(s.angle)),
        ("delayMs", n(s.delay)),
        ("virtualHeightKm", n(s.vhigh)),
        ("mufDay", n(s.cprob)),
        ("lossDb", n(s.dblos)),
        ("fieldDbu", n(s.dbu)),
        ("signalDbw", n(s.dbw)),
        ("noiseDbw", n(s.xnynois + s.rneff)),
        ("snrDb", n(s.sndb)),
        ("requiredPowerGainDb", n(s.snpr)),
        ("reliability", n(s.reliab)),
        ("multipath", n(s.probmp)),
        ("serviceProbability", n(s.sprob)),
        ("signalLowDb", n(s.dblosl)),
        ("signalUpDb", n(s.dblosu)),
        ("snrLowDb", n(s.snrlw)),
        ("snrUpDb", n(s.snrup)),
        ("txGainDbi", n(s.gaint)),
        ("rxGainDbi", n(s.gainr)),
        ("snrAtRequiredReliabilityDb", n(s.snxx)),
        ("noiseUpDb", n(s.du_nois)),
        ("noiseLowDb", n(s.dl_nois)),
    ])
}

fn systems_hour(h: &HourPrediction, count: usize) -> Json {
    let slots: Vec<Json> = (0..count).map(|i| slot(h.frel[i], &h.son[i], h.long_model)).collect();
    obj([
        ("utc", n(h.gmt)),
        ("localMeanTime", n(h.lmt)),
        ("mufMhz", n(h.allmuf)),
        ("fotMhz", n(h.fot)),
        ("hpfMhz", n(h.hpf)),
        ("mufTakeoffDeg", n(h.angmuf)),
        ("longModel", Json::Bool(h.long_model)),
        ("atMuf", slot(h.allmuf, &h.son[11], h.long_model)),
        ("freqs", Json::Arr(slots)),
    ])
}

fn window_hour(h: &MufHourOut) -> Json {
    const NAMES: [&str; 4] = ["E", "F1", "F2", "Es"];
    let layers: Vec<Json> = h
        .layers
        .iter()
        .zip(NAMES)
        .map(|(l, name)| {
            obj([
                ("layer", str_of(name)),
                ("mufMhz", n(l.yfot)),
                ("takeoffDeg", n(l.delmuf)),
                ("virtualHeightKm", n(l.hpmuf)),
                ("trueHeightKm", n(l.htmuf)),
                ("verticalFrequencyMhz", n(l.fvmuf)),
                ("hops", num(f64::from(l.nhopmf))),
            ])
        })
        .collect();
    obj([
        ("utc", n(h.gmt)),
        ("localMeanTime", n(h.lmt)),
        ("mufMhz", n(h.allmuf)),
        ("fotMhz", n(h.fot)),
        ("hpfMhz", n(h.hpf)),
        ("lufMhz", n(h.xluf)),
        ("layers", Json::Arr(layers)),
    ])
}

fn parameter_row(r: &ParRow) -> Json {
    obj([
        ("lat", n(r.lat)),
        ("lon", n(r.lon)),
        ("utc", n(r.gmt)),
        ("localMeanTime", n(r.lmt)),
        ("foE", n(r.fe)),
        ("foF1", n(r.f1)),
        ("foF2", n(r.f2z)),
        ("hmE", n(r.he)),
        ("ymE", n(r.ye)),
        ("hmF1", n(r.h1)),
        ("ymF1", n(r.y1)),
        ("hmF2", n(r.h2)),
        ("ymF2", n(r.y2)),
        ("m3000", n(r.m3000)),
        ("virtualHeightF2Km", n(r.hpf2)),
        ("halfGyroMhz", n(r.fh2)),
        ("sunZenithDeg", n(r.zen)),
        ("magneticLatitude", n(r.magl)),
    ])
}

fn task(name: &str) -> Result<Task, String> {
    match name {
        "systems" => Ok(Task::Systems),
        "window" => Ok(Task::Luf),
        "parameters" => Ok(Task::Parameters),
        other => Err(format!("\"task\" must be \"systems\", \"window\" or \"parameters\", not \"{other}\"")),
    }
}

/// Answers one request. An error is a sentence for whoever is driving the engine.
pub fn answer(input: &str) -> Result<String, String> {
    let req = json::parse(input)?;
    let root = PathBuf::from(req.string("root")?);
    let which = task(&req.string("task")?)?;
    let request = request(&req)?;
    let count = request.freqs_mhz.len();

    // The text the original program would print for this question, when asked for: it is
    // what the port is held to, so it is what a comparison should read.
    if matches!(req.get("listing"), Some(Json::Bool(true))) {
        let text = api::listing(&root, &request, which)?;
        return Ok(obj([("listing", str_of(&text))]).write());
    }

    let deck = api::deck(&request, which)?;
    let body = match api::predict(&root, &request, which)? {
        Report::Systems(p) => obj([
            ("distanceKm", n(p.path.gcd_km)),
            ("bearingTxDeg", n(p.path.btrd)),
            ("bearingRxDeg", n(p.path.brtd)),
            ("hours", Json::Arr(p.hours.iter().map(|h| systems_hour(h, count)).collect())),
        ]),
        Report::Muf(hours) => obj([("hours", Json::Arr(hours.iter().map(window_hour).collect()))]),
        Report::Parameters(rows) => obj([("rows", Json::Arr(rows.iter().map(parameter_row).collect()))]),
        Report::Ionograms(_) => return Err("ionograms are not asked for here".into()),
    };
    let Json::Obj(mut fields) = body else { unreachable!() };
    fields.insert("deck".to_string(), str_of(&deck));
    Ok(Json::Obj(fields).write())
}

// ---------------------------------------------------------------------------------
// The WebAssembly interface: a buffer in, a buffer out. The answer begins with its
// length as four little-endian bytes, then a byte saying whether it is an answer (1)
// or an error message (0), then UTF-8 text.

#[no_mangle]
pub extern "C" fn outpost_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len.max(1));
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// # Safety
/// `pointer` and `len` must be what `outpost_alloc` was asked for, or what
/// `outpost_run` returned (the text's length plus five).
#[no_mangle]
pub unsafe extern "C" fn outpost_free(pointer: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(pointer, 0, len.max(1)));
}

/// # Safety
/// `pointer` must hold `len` bytes of UTF-8 written into a buffer from `outpost_alloc`.
#[no_mangle]
pub unsafe extern "C" fn outpost_run(pointer: *const u8, len: usize) -> *mut u8 {
    let input = std::slice::from_raw_parts(pointer, len);
    let (ok, text) = match std::str::from_utf8(input) {
        Ok(text) => match answer(text) {
            Ok(body) => (1u8, body),
            Err(message) => (0u8, message),
        },
        Err(_) => (0u8, "the request is not UTF-8".to_string()),
    };
    let bytes = text.as_bytes();
    let total = bytes.len() + 5;
    let out = outpost_alloc(total);
    let slice = std::slice::from_raw_parts_mut(out, total);
    slice[..4].copy_from_slice(&(bytes.len() as u32).to_le_bytes());
    slice[4] = ok;
    slice[5..].copy_from_slice(bytes);
    out
}
