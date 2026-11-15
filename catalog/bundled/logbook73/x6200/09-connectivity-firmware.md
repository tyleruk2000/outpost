# USB, Bluetooth, Wi-Fi, remote control and firmware

Connectivity is where a working X6200 can become either a very capable station or an afternoon of mysterious ports. Keep the paths separate: `DEV` makes the radio a USB device for a computer; `HOST` lets the radio host a limited peripheral; Wi-Fi joins a network; Bluetooth pairs a supported device; WFSERVER starts a remote-control service. Firmware updating uses the microSD slot and an in-radio baseband stage. None is a generic substitute for another.

## Port map

| Path           | Direction / purpose                   | Typical use                                   | Important limit                         |
| -------------- | ------------------------------------- | --------------------------------------------- | --------------------------------------- |
| `DEV` USB-C    | radio behaves as computer peripheral  | CAT/CI-V, virtual sound card, N1MM CW/control | use a data cable and correct driver     |
| `HOST` USB-C   | radio powers/hosts accessory          | keyboard, mouse, supported adapter, WR12      | limited power; manual says no USB hub   |
| `CARD` microSD | removable storage/boot image          | official system firmware stage                | do not remove while active              |
| Wi-Fi/WLAN     | radio joins IP network                | time, WFSERVER/remote                         | manual setup may require static IP      |
| Bluetooth      | radio pairs supported peripherals/app | keyboard/mouse, FT8CN on 1.0.6+               | not every BT audio/profile is supported |
| `ACC`          | band/TRX/ALC control signals          | documented XPA125B/L4001                      | not an audio/data jack                  |

## USB DEV: computer control and sound

Use a known data-capable USB-C cable from the X6200 `DEV` port directly to the computer. A charge-only cable can power indicators while exposing no devices.

The manufacturer instructions call for the CH342 driver where the operating system lacks it. After connection, expect serial/control device(s) and USB audio input/output. Device names differ by operating system, so identify by disconnecting/reconnecting once and observing which entries appear.

### CAT / CI-V setup

CAT lets logging and digital applications read/set frequency, mode and PTT. The manufacturer-authored [X6200 CI-V implementation for firmware 1.0.6 is available as a supporting mirror](https://radioddity.s3.amazonaws.com/2025-06-20_Xiegu_X6200_CI-V_Implementation_of_Firmware_V1.0.6.pdf).

That reference assigns radio control to **SERIAL-B** at **`19200` baud, 8 data bits, no parity, 1 stop bit (`8N1`)**, with CI-V address **`0xA4`**. **SERIAL-A** is the terminal path and can run at other speeds up to `115200`; it is not the CAT port to guess first. A current native X6200 profile may fill these values automatically, but knowing the published baseline makes a silent or half-working setup diagnosable.

Setup order:

1. Confirm SYSTEM INFO and note firmware.
2. Connect DEV; install/confirm CH342 driver.
3. Select `XIEGU X6200` in the application when available.
4. Select **SERIAL-B**, `19200`, `8N1` and CI-V address `0xA4`, unless a later firmware reference or tested native profile explicitly supersedes them.
5. Disable other programs competing for that port.
6. Test read-only: does the application show the radio's frequency and mode?
7. Test a small safe frequency change on receive.
8. Configure PTT/CAT last and test into a dummy load at minimum power.

The Rev 05 manual warns that choosing another “compatible” CI-V rig may leave some commands unanswered. A fallback profile can change frequency while failing split, mode, meter or PTT. Native X6200 support is preferable.

### Multiple serial ports

A composite USB interface exposes more than one serial entry because they have different jobs: the firmware 1.0.6 CI-V reference names **SERIAL-B** as CAT/CI-V and **SERIAL-A** as the terminal. Identify which operating-system device maps to each rather than choosing randomly. Do not give the CAT port simultaneously to a logger, digital application and rotor/control software. Usually one process owns a serial port at a time; use the digital program's network/API link to the logger where supported, or a deliberate port-sharing tool.

Symptoms of contention include intermittent CAT, frequency snapping back, PTT stuck or “access denied.” Close all applications, identify one working owner, then add integration one layer at a time.

## USB audio

The manual says to choose the sound card virtualised by the radio and notes that input and output can be distinct devices:

- **computer input / recording device** receives X6200 audio, governed by LINE OUT GAIN and computer input level;
- **computer output / playback device** sends modulating audio to the X6200, governed by application output and LINE IN GAIN.

Calibration:

### Receive

1. Tune steady band noise/known signal.
2. Set LINE OUT GAIN to a moderate value.
3. Select the X6200 recording device in the decoder.
4. Adjust so noise is visible and strong signals do not clip.
5. Save the OS level; do not let “automatic enhancements” alter it.

### Transmit

1. Dummy load, lowest power, correct data mode/frequency.
2. COMP off; mic path irrelevant/disabled as appropriate.
3. Begin application output and LINE IN GAIN low.
4. Generate a test tone only in a legal/test context.
5. Raise until expected clean RF output, avoiding excessive ALC.
6. Verify on a separate receiver/spectrum display.

RF power is not a licence to drive audio harder. Once the selected clean output is reached, more audio creates distortion rather than useful watts.

## N1MM and computer-sent CW

The manufacturer describes using DEV with N1MM to command CW transmission. Treat that as a controlled station integration:

1. prove CAT read/write;
2. configure the X6200 rig profile and CW method supported by current N1MM/radio docs;
3. use CW mode, dummy load and low power;
4. send a short test string;
5. inspect first-element timing, spacing and return to receive;
6. increase QSK/lead timing if an amplifier/accessory needs it.

Stored radio MSG memories are often simpler in the field; N1MM provides richer contest macros/logging. Do not let both transmit macro systems respond to one key.

## HOST: keyboard, mouse and WR12

Compatible USB keyboards and mice can help edit text and control supported interface elements. The radio supplies limited current and the manual says USB hubs are not supported. A high-current backlit keyboard, storage disk or several devices behind a hub can cause resets/disconnects.

Power down before rearranging accessories where practical. If a peripheral causes instability, remove it, restart normally and test one low-power device directly.

### WR12 wide-band receiver module

Firmware `1.0.6` adds support for the optional Xiegu WR12 wide-band receive add-on. Connect it to `HOST` according to its own instructions. When recognised, a blue `WR12` icon appears at the upper right, just left of the voltage display.

Important boundaries:

- WR12 is an optional receiver expansion, not extra transmit coverage;
- the module and host firmware must be mutually supported;
- `1.0.7` fixes a black-screen/disconnection case caused by spinning the main tuning wheel quickly with WR12 connected;
- if the icon does not appear, check firmware, direct HOST connection, module power/contact and remove other peripherals;
- do not invent a frequency claim from the X6200's own 0.5–136 MHz ranges—use the current WR12 documentation for its coverage.

## Wi-Fi / WLAN

Open `GEN → SYSTEM → WLAN/WIFI`. The documented page provides:

- adapter edit/on state;
- `SCAN` for nearby access points;
- network list;
- `EDIT` and `NEXT` for fields;
- password;
- IP address;
- gateway;
- DNS;
- network prefix;
- `CONNECT / DISCONNECT`;
- `EXIT`.

The manual describes a static configuration rather than assuming DHCP works everywhere. Choose an unused IP in the same subnet as the router; gateway is normally the router address; prefix describes subnet size. DNS/prefix may be left blank in the manual's simple case, but a network administrator should supply correct values on a managed network.

Example structure only, not values to copy:

```text
Router/gateway: 192.168.x.1
Radio IP:       192.168.x.y   (unused, same subnet)
Prefix:         network-specific
Password:       access-point credential
```

Do not publish the password in screenshots. Avoid guest/corporate networks with captive portals, client isolation or policies against unmanaged devices.

### Connection sequence

1. SETTING 2 → BUILT-IN ON for internal adapter.
2. Open WLAN and enable adapter through EDIT.
3. SCAN, select SSID.
4. Enter password/IP/gateway carefully.
5. Connect; wait for the green connected indication.
6. Check NETWORK information in SYSTEM INFO on `1.0.6+`.
7. Test time sync or WFSERVER separately.

Older UI can discard unfinished input if the knob moves. Finish/save each field before navigating. Successfully joining Wi-Fi saves configuration; a failed attempt may not.

### Wi-Fi interference

The 2.4 GHz adapter shares spectrum with keyboards, mice, phones and routers. Dropouts can be local congestion rather than an HF fault. Move the radio/router, remove redundant adapters and use wired USB for critical data where possible.

## Bluetooth

Open SYSTEM → BLUETOOTH. Controls are `OFF/ON`, `SCAN`, `CONNECT/DISCONNECT` and `EXIT`. The radio may automatically pair without a PIN and try to reconnect after reboot.

Supported uses include keyboards/mice and the FT8CN workflow added fully in `1.0.6`. Bluetooth profile support is not universal. A device visible in SCAN may still lack a compatible service.

Recovery:

1. forget/disconnect at both ends;
2. restart radio/device normally;
3. ensure BUILT-IN adapter choice is correct;
4. scan nearby with other 2.4 GHz peripherals temporarily off;
5. pair one device;
6. verify input/control before testing transmit.

For FT8CN, exact app permissions and UI belong to the current app documentation. The radio-side fact is 1.0.6+ Bluetooth support.

## WFSERVER remote control

WFSERVER is a service, not the Wi-Fi connection itself. First obtain stable LAN connectivity, then open `GEN → SYSTEM → WFSERVER`, fill the displayed service/network settings and press `START`. After a few seconds a blue `WF` icon at upper right indicates it is running.

Security and reliability rules:

- use a trusted private LAN;
- do not expose the service directly to the public internet without a secure, understood VPN/firewall design;
- confirm the compatible client and version;
- begin with receive-only remote testing;
- provide an independent way to remove power if unattended operation is lawful and intended;
- stop the service when not needed;
- never rely on network PTT as the only transmit-release safeguard.

If WFSERVER will not start, separate the layers: adapter on → Wi-Fi connected → IP/gateway valid → client can reach radio → service started/icon visible → control protocol works.

## Firmware: know the two layers

The X6200 update tutorial treats an update as two stages:

1. **system/UI image** written to a microSD card and installed through a controlled boot/update process;
2. **baseband firmware** selected/upgraded from the radio's SYSTEM → FIRMWARE UPGRADE screen.

Completing only one can leave mismatched behaviour. The archive's read-me and tutorial for that exact release are the authority.

## Safe full update workflow

The [official X6200 firmware upgrade tutorial](https://xiegu.eu/wp-content/uploads/sites/4/2024/07/X6200FirmwareUpgradeTutorialWS-JSZL-2407-01ENRevised.pdf) includes model-specific illustrations. This checklist highlights, but does not replace, it:

### Prepare

1. Download only from [Xiegu's authorised downloads page](https://xiegu.eu/downloads/) or your authorised regional source.
2. Confirm the archive says **X6200**, the intended version and compatible hardware/region.
3. Verify published checksum when supplied.
4. Read release note and tutorial end to end.
5. Photograph SYSTEM INFO and all personal settings/memories.
6. Use a known-good microSD and approved image-writing tool; selecting the wrong computer disk can erase it.
7. Provide a stable `13.8 V` supply capable of at least `3 A` (the operating manual specifies at least 3.5 A generally).
8. **Remove the detachable battery for the update process as directed by the tutorial.** Do not rely on two power sources.

### System-image stage

1. Write, do not merely copy, the supplied image to the correct microSD.
2. Safely eject the card.
3. Radio off, external power disconnected as instructed: insert card.
4. Connect stable external supply and start exactly as the tutorial shows.
5. Do not touch controls, remove card or interrupt power while writing.
6. Wait for explicit completion/shutdown instruction, not just a temporary black screen.

### Baseband stage

1. Start into the newly installed system as instructed.
2. Open SYSTEM → FIRMWARE UPGRADE.
3. Select the matching baseband file from the release package.
4. Press the displayed UPGRADE action once.
5. Wait for completion/restart; do not interrupt.

### Finish and verify

1. Remove update card/power only in the documented order.
2. Refit battery when directed.
3. Start normally and check SYSTEM INFO for both expected versions.
4. Perform a factory reset only if the matching release notes/tutorial require it.
5. Restore settings manually, one group at a time.
6. Test receive, knobs, audio, battery indication and CAT.
7. Test transmit last into a dummy load at minimum power.

## Firmware release channels and the reviewed baseline

As reviewed on 28 August 2026, the release channels are no longer numerically aligned:

- [Xiegu EU](https://xiegu.eu/downloads/) provides `1.0.7` with detailed English release notes;
- the [manufacturer download site](https://www.cqxiegu.com/zlxz) lists V06 Chinese documentation and `x6200udimg-260820001.zip`, posted 21 August 2026;
- [Radioddity's current support catalogue](https://www.radioddity.com/pages/new-xiegu-download-test) labels a `1.0.8` package dated 23 August 2026.

This companion uses EU `1.0.7` as the fully documented English procedural baseline and identifies V06 manual deltas where they are explicit. It does **not** infer undocumented `1.0.8` behaviour or tell an owner to cross-flash a package from another regional/retailer channel. Use the authorised source that supports your radio, read that archive's notes, verify SYSTEM INFO and ask the supplying channel when compatibility is unclear.

## Firmware 1.0.6 and EU 1.0.7 audit

After updating, verify features rather than trusting the filename:

### 1.0.6

- KEY page 2 CW decoder/threshold 1–50;
- FT8CN Bluetooth support;
- WR12 icon/operation;
- NETWORK info in SYSTEM INFO;
- AM/NFM, NR, battery gauge improvements.

### 1.0.7

- DISPLAY page 3 SHOW RX LEVEL, WATERFALL SPEED and 3D BANDSCOPE;
- SSB 2.5/5 kHz step options;
- AM 9/12/15 kHz presets;
- CW removed from MODEM;
- WFM-idle, battery, CW crackle, WR12 fast-tuning and alpha-freeze fixes;
- 136 MHz receive upper limit.

## Factory reset

SYSTEM → FACTORY RESET clears personal settings, asks for `OK` twice, and restarts. Record mic/line levels, filters, EQ, H-22 functions, memories and network details first.

Use reset when the release specifically requires it, settings are corrupt, or support directs it. It is not the first fix for propagation, an unplugged antenna or the wrong USB device.

## Freeze and hard recovery

Normal: hold power until interface exits, release, wait at least five seconds.

If genuinely frozen:

1. hold power more than `12 seconds` until screen/light/sound stop;
2. if ineffective, disconnect external supply and remove battery panel;
3. wait, refit and restart normally.

The manual also describes a severe baseband/system hang with a flashing red message: remove both power sources, then restore. Use hard removal only for a hang, because abrupt power loss can corrupt internal storage.

## Common connection faults

| Symptom                              | First checks                                                        |
| ------------------------------------ | ------------------------------------------------------------------- |
| no USB devices                       | DEV not HOST; data cable; direct port; driver; restart              |
| CAT reads but PTT fails              | native rig model; correct control port; PTT method; frequency legal |
| CAT intermittent                     | competing apps; RF common-mode; cable; power saving                 |
| audio decodes nothing                | correct X6200 input; LINE OUT; clock; mode/filter                   |
| transmit audio no RF                 | correct X6200 output; LINE IN; CAT PTT; COMP off; dummy load        |
| HOST accessory resets radio          | power draw/hub; connect one supported device                        |
| WR12 absent                          | firmware 1.0.6+; HOST direct; module docs/contact                   |
| Wi-Fi connected, no remote           | IP reachability; WFSERVER START/WF icon; client/version/firewall    |
| Bluetooth sees but cannot use device | unsupported profile; BUILT-IN; re-pair; 2.4 GHz congestion          |
| update features half-present         | verify both system and baseband versions/stages                     |

## Key takeaways

- DEV connects to a computer for CAT/audio; HOST accepts limited peripherals and WR12. No USB hubs.
- Prefer the native X6200 rig profile and published CI-V reference; a compatible model may only partly work.
- Calibrate USB receive and transmit audio separately. Test PTT last, into a dummy load.
- Wi-Fi connection, Bluetooth pairing and WFSERVER service are three different layers.
- WR12 support begins in 1.0.6; 1.0.7 fixes a fast-tuning disconnect/freeze.
- A full firmware update has system-image and baseband stages and requires the exact tutorial, stable external power and battery removal.
- Verify both versions and visible features after update; restore settings deliberately.
- Use forced shutdown only for a real freeze.

Next, [Operating Configurations](outpost:entry/logbook73.guide.x6200/configs) turns all these controls into ready-to-use voice, CW, data, listening and field recipes.

### Primary and supporting references

- [X6200 public English manual](https://xiegu.eu/wp-content/uploads/sites/4/2024/07/X6200-USER-MANUAL-V01-PileupDX.com.pdf)
- [Official X6200 firmware downloads and release notes](https://xiegu.eu/downloads/)
- [Official X6200 firmware upgrade tutorial](https://xiegu.eu/wp-content/uploads/sites/4/2024/07/X6200FirmwareUpgradeTutorialWS-JSZL-2407-01ENRevised.pdf)
- [Manufacturer-authored Rev 05 manual mirror](https://radioddity.s3.amazonaws.com/Xiegu_X6200_Manual_20240925.pdf)
- [X6200 CI-V 1.0.6 reference mirror](https://radioddity.s3.amazonaws.com/2025-06-20_Xiegu_X6200_CI-V_Implementation_of_Firmware_V1.0.6.pdf)
