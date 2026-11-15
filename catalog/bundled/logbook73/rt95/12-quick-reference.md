# RT95 quick reference

## Core controls

| Action                      | Control                              |
| --------------------------- | ------------------------------------ |
| Power off                   | hold power/mute about 2 seconds      |
| Mute/unmute                 | short power/mute                     |
| Open Select Menu            | hold `FUNC`                          |
| Change soft-key group       | short `FUNC`                         |
| Choose/edit/save            | turn `PUSH` knob / press `PUSH`      |
| Lock/unlock main keys       | hold `PUSH`                          |
| Select transmit side        | soft `A/B` or microphone `A/B`       |
| VFO/memory                  | soft `V/M`                           |
| Monitor/open squelch        | soft `MON`                           |
| Scan / scan-list toggle     | tap / hold soft `SCN`                |
| Send live DTMF              | hold PTT and press microphone digits |
| Send programmed DTMF/5-tone | hold PTT + microphone `UP`           |
| Send programmed tone burst  | hold PTT + microphone `DOWN`         |

## Safe first settings

| Setting                 | Start with                         |
| ----------------------- | ---------------------------------- |
| Power                   | `LO` (nominal 5 W)                 |
| Squelch                 | `2–3`, adjusted just above noise   |
| TOT                     | `3 min`                            |
| VOX                     | `OFF`                              |
| Receive tone `RCDT`     | `OFF` unless deliberately required |
| Optional decode `T-DEC` | `OFF`                              |
| Signalling combination  | `SQ`                               |
| Busy lockout            | `BU`                               |
| Scrambler               | `OFF`                              |
| Dual watch              | only when you need both rows       |

## Function Menu 01–21

`01` Beep · `02` step · `03` display · `04` squelch · `05` volume · `06` password · `07` scan dwell · `08` scan pause · `09` auto power-on (`AOP`) · `10` dual watch · `11` brightness · `12` timeout timer · `13` auto power-off (`APO`) · `14` tone burst · `15` display rotation · `16` speaker routing · `17` independent RX/TX (`RTDF`) · `18` VOX · `19` VOX sensitivity (`1` most sensitive) · `20` VOX delay · `21` reset.

## Channel Menu 01–14

`01` RX CTCSS/DCS · `02` TX CTCSS/DCS · `03` power · `04` 5-tone encode · `05` optional DTMF/5-tone decode · `06` gate combination · `07` bandwidth · `08` reverse · `09` talk-around · `10` offset/direction · `11` name · `12` busy lockout · `13` TX permission (**ON allows, OFF prohibits**) · `14` own signalling ID.

## Power, supply and antenna

- Nominal RF power: `25 / 15 / 5 W`.
- Supply: `13.8 V DC ±15%`; never direct to 24 V or AC.
- Manual base-supply recommendation: `12 A`.
- Fuses: `10 A` specified—do not uprate.
- Antenna/load: `50 Ω`; connect before PTT.
- External speaker: 8 Ω, bridge-tied output—**neither conductor to ground**.

## Repeater checklist

1. correct output/receive frequency;
2. published offset sign and magnitude;
3. derived TX frequency checked independently;
4. `TCDT` published access tone/code;
5. `RCDT OFF`, `T-DEC OFF`, gate `SQ` unless intentionally different;
6. correct bandwidth;
7. busy lockout `BU`;
8. Channel 13 `ON` only after verification;
9. low-power test after listening and identifying.

## Silent receiver checklist

`MON` → lower squelch → check mute/volume → Function 16 speaker routing → `RCDT OFF` → `T-DEC OFF` → gate `SQ`.

## Wrong transmit-frequency checklist

Release PTT → check main side → offset → reverse → talk-around → `RTDF` lower TX row → memory saved vs temporary.

## Programming rule

**Read → save factory backup → edit a copy → validate TX fields → write without power interruption → read back → test low power.**

## Official references

- [RT95 product/download page](https://www.retevis.com/products/rt95-25w-dual-band-ham-mobile-radio-with-program-cable)
- [RT95 multi-language manual](https://v3.retevis.com/Themes/Retevis/Assets/files/download/Manuals_Mobile_Radios/RT95-Multi-Language-Manual.pdf)
