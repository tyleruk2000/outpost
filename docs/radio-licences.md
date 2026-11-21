<!-- Written by scripts/write-radio-licences.mjs from packages/shared/src/radio-licence-statements.ts. Change that file, not this one. -->

# What needs a radio licence

What you may listen to, what you may send on without a licence, and what needs an amateur licence, as the UK's regulator (Ofcom) and the United States' (the FCC) and their laws say it. Every statement names the document it rests on and the day it was read (21 November 2026). Where Outpost does not know, it says so. This is general information, not legal advice.

Outpost never transmits on APRS or on any amateur frequency. It receives, and helps you plan and practise. The household board can send messages over a Meshtastic radio on its licence-exempt band, through the mesh link (see [mesh-radio.md](mesh-radio.md)).

## Licensed and listen-only households

In **Settings → Radio licence**, switch on **I hold an amateur radio licence** if someone in the household holds one, and give the callsign if you like. This only records that you hold a licence, so that the radio screens stop reminding you that transmitting needs one. Outpost does not transmit, and nothing is ever sent with or because of this callsign.

With it off, which is how Outpost starts, every radio screen says in one line whether what it does needs a licence, and things that only make sense for transmitting (a callsign for the air, planning a transmission) are worded as practice. With it on, the reminders that transmitting needs a licence are left out. Warnings that are not about the licence stay for everyone: a public mesh channel can be read by anyone, and radio is not a way to call the emergency services.

Band plans and what each class of licence may use, country by country, are on **Radio → Licences and band plans**.

## Listening

### Listening to broadcast radio and time-signal stations

**United Kingdom (Ofcom).** No licence is needed to own or use a receive-only radio for broadcast stations. The receivers exemption covers any apparatus that cannot transmit, except equipment mainly for receiving television (covered by other rules) and equipment used to receive unlicensed broadcasting stations.

> “Generally, the use of radio receivers is exempt from requiring a licence unless it is also capable of transmission.”

Sources: [Ofcom, Rules on using radio equipment, published 10 July 2023 (sections on general radio reception and scanners, and unauthorised reception)](https://www.ofcom.org.uk/spectrum/radio-equipment/radio-spectrum-and-the-law) (read 21 November 2026); [UK legislation (legislation.gov.uk), The Wireless Telegraphy Apparatus (Receivers) (Exemption) Regulations 1989, SI 1989/123, as made](https://www.legislation.gov.uk/uksi/1989/123/made) (read 21 November 2026); [Ofcom, Wireless Telegraphy Exemption Regulations, last updated 25 March 2025](https://www.ofcom.org.uk/spectrum/radio-equipment/wireless-telegraphy-regulations) (read 21 November 2026); [UK legislation (legislation.gov.uk), Wireless Telegraphy Act 2006, section 8, Licences and exemptions](https://www.legislation.gov.uk/ukpga/2006/36/section/8) (read 21 November 2026).

**United States (FCC).** Federal law on intercepting and passing on radio messages does not apply to stations transmitting for the general public, which includes broadcast and time-signal stations. Outpost has not read an FCC page that says this in plain words: the FCC's consumer guide on interception was not available to the public when checked.

> “This section shall not apply to the receiving, divulging, publishing, or utilizing the contents of any radio communication which is transmitted by any station for the use of the general public”

Sources: [US Government Publishing Office, 47 U.S.C. 605, Unauthorized publication or use of communications (United States Code, 2023 edition)](https://www.govinfo.gov/content/pkg/USCODE-2023-title47/html/USCODE-2023-title47-chap5-subchapVI-sec605.htm) (read 21 November 2026); [US Government Publishing Office, 18 U.S.C. 2511, Interception and disclosure of wire, oral, or electronic communications prohibited (United States Code, 2023 edition)](https://www.govinfo.gov/content/pkg/USCODE-2023-title18/html/USCODE-2023-title18-partI-chap119-sec2511.htm) (read 21 November 2026).

**Not known.** Other countries: not read. Ask the national radio regulator.

### Listening to amateur radio, including APRS and amateur satellites

**United Kingdom (Ofcom).** No licence is needed to listen with a receive-only radio. Ofcom counts hobby radio among what receivers may be used for. Amateur stations may send calls, beacons and data (APRS is one) for other amateurs to receive. Section 48 still makes it an offence to use a receiver to get at a message meant for someone else, or to pass one on, without lawful authority.

> “Typically, receivers and scanners can only be used for ‘general reception’ such as licensed broadcasting stations and hobby radio.”

Sources: [Ofcom, Rules on using radio equipment, published 10 July 2023 (sections on general radio reception and scanners, and unauthorised reception)](https://www.ofcom.org.uk/spectrum/radio-equipment/radio-spectrum-and-the-law) (read 21 November 2026); [UK legislation (legislation.gov.uk), The Wireless Telegraphy Apparatus (Receivers) (Exemption) Regulations 1989, SI 1989/123, as made](https://www.legislation.gov.uk/uksi/1989/123/made) (read 21 November 2026); [Ofcom, Amateur Radio Wireless Telegraphy Licence Conditions Booklet (OFW611), published 21 February 2024](https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/emf/emf-amateur-licence-terms-and-conditions.pdf) (read 21 November 2026); [UK legislation (legislation.gov.uk), Wireless Telegraphy Act 2006, section 48, Interception and disclosure of messages](https://www.legislation.gov.uk/ukpga/2006/36/section/48) (read 21 November 2026).

**United States (FCC).** Intercepting radio from a station on an authorised amateur, CB or GMRS frequency is not unlawful under the federal interception law, and the rule against passing on radio messages does not apply to amateur and CB stations.

> “by a station operating on an authorized frequency within the bands allocated to the amateur, citizens band, or general mobile radio services”

Sources: [US Government Publishing Office, 18 U.S.C. 2511, Interception and disclosure of wire, oral, or electronic communications prohibited (United States Code, 2023 edition)](https://www.govinfo.gov/content/pkg/USCODE-2023-title18/html/USCODE-2023-title18-partI-chap119-sec2511.htm) (read 21 November 2026); [US Government Publishing Office, 47 U.S.C. 605, Unauthorized publication or use of communications (United States Code, 2023 edition)](https://www.govinfo.gov/content/pkg/USCODE-2023-title47/html/USCODE-2023-title47-chap5-subchapVI-sec605.htm) (read 21 November 2026).

**Not known.** Other countries: not read. Ask the national radio regulator.

### Receiving aircraft: airband voice and ADS-B

**United Kingdom (Ofcom).** A receive-only radio needs no licence. Ofcom says receivers and scanners can typically be used only for general reception, such as broadcasting and hobby radio, and does not mention aircraft. Section 48 makes it an offence, without lawful authority, to use a receiver with intent to learn the contents, sender or addressee of a message you are not meant to receive, or to disclose it. Ofcom adds that it cannot give specific guidance on the law on receiving and suggests legal advice when in doubt.

> “It is an offence for an unauthorised person to use wireless telegraphy apparatus with intent to obtain information as to the contents, sender or addressee of any message”

Sources: [Ofcom, Rules on using radio equipment, published 10 July 2023 (sections on general radio reception and scanners, and unauthorised reception)](https://www.ofcom.org.uk/spectrum/radio-equipment/radio-spectrum-and-the-law) (read 21 November 2026); [UK legislation (legislation.gov.uk), Wireless Telegraphy Act 2006, section 48, Interception and disclosure of messages](https://www.legislation.gov.uk/ukpga/2006/36/section/48) (read 21 November 2026); [UK legislation (legislation.gov.uk), The Wireless Telegraphy Apparatus (Receivers) (Exemption) Regulations 1989, SI 1989/123, as made](https://www.legislation.gov.uk/uksi/1989/123/made) (read 21 November 2026).

**United States (FCC).** Intercepting a marine or aeronautical communications system is not unlawful under the federal interception law. The separate rule against divulging or using intercepted radio for your own benefit makes an exception only for broadcasts to the public, distress, amateur and CB, not for aircraft in general.

> “by any marine or aeronautical communications system”

Sources: [US Government Publishing Office, 18 U.S.C. 2511, Interception and disclosure of wire, oral, or electronic communications prohibited (United States Code, 2023 edition)](https://www.govinfo.gov/content/pkg/USCODE-2023-title18/html/USCODE-2023-title18-partI-chap119-sec2511.htm) (read 21 November 2026); [US Government Publishing Office, 47 U.S.C. 605, Unauthorized publication or use of communications (United States Code, 2023 edition)](https://www.govinfo.gov/content/pkg/USCODE-2023-title47/html/USCODE-2023-title47-chap5-subchapVI-sec605.htm) (read 21 November 2026).

**Not known.** Neither Ofcom's page nor the laws read mention ADS-B: Outpost does not know of a statement specific to ADS-B, in either country. Other countries: not read.

### Receiving ships: marine VHF voice and AIS

**United Kingdom (Ofcom).** A receive-only radio needs no licence. Ofcom's page on receivers does not mention ships; transmitting on marine channels needs a ship radio licence. Section 48 makes it an offence, without lawful authority, to use a receiver with intent to learn the contents, sender or addressee of a message you are not meant to receive, or to disclose it.

> “Typically, receivers and scanners can only be used for ‘general reception’ such as licensed broadcasting stations and hobby radio.”

Sources: [Ofcom, Rules on using radio equipment, published 10 July 2023 (sections on general radio reception and scanners, and unauthorised reception)](https://www.ofcom.org.uk/spectrum/radio-equipment/radio-spectrum-and-the-law) (read 21 November 2026); [UK legislation (legislation.gov.uk), Wireless Telegraphy Act 2006, section 48, Interception and disclosure of messages](https://www.legislation.gov.uk/ukpga/2006/36/section/48) (read 21 November 2026); [UK legislation (legislation.gov.uk), The Wireless Telegraphy Apparatus (Receivers) (Exemption) Regulations 1989, SI 1989/123, as made](https://www.legislation.gov.uk/uksi/1989/123/made) (read 21 November 2026).

**United States (FCC).** Intercepting a marine or aeronautical communications system is not unlawful under the federal interception law. The rule against divulging or using intercepted radio for your own benefit excepts messages relating to ships in distress, but not ships in general.

> “which relates to ships, aircraft, vehicles, or persons in distress”

Sources: [US Government Publishing Office, 18 U.S.C. 2511, Interception and disclosure of wire, oral, or electronic communications prohibited (United States Code, 2023 edition)](https://www.govinfo.gov/content/pkg/USCODE-2023-title18/html/USCODE-2023-title18-partI-chap119-sec2511.htm) (read 21 November 2026); [US Government Publishing Office, 47 U.S.C. 605, Unauthorized publication or use of communications (United States Code, 2023 edition)](https://www.govinfo.gov/content/pkg/USCODE-2023-title47/html/USCODE-2023-title47-chap5-subchapVI-sec605.htm) (read 21 November 2026).

**Not known.** Neither Ofcom's page nor the laws read mention AIS: Outpost does not know of a statement specific to AIS, in either country. Other countries: not read.

### What else is restricted to listen to, or to pass on

**United Kingdom (Ofcom).** Using a receiver to get at a message not meant for you, without lawful authority, is an offence, and so is telling anyone else what was heard. The maximum penalty Ofcom gives is two years in prison or an unlimited fine. Receiving an unlicensed broadcasting station is outside the receivers exemption.

> “This means that it is illegal to disclose to a third party anything heard in a transmission that a person has listened to without authorisation.”

Sources: [Ofcom, Rules on using radio equipment, published 10 July 2023 (sections on general radio reception and scanners, and unauthorised reception)](https://www.ofcom.org.uk/spectrum/radio-equipment/radio-spectrum-and-the-law) (read 21 November 2026); [UK legislation (legislation.gov.uk), Wireless Telegraphy Act 2006, section 48, Interception and disclosure of messages](https://www.legislation.gov.uk/ukpga/2006/36/section/48) (read 21 November 2026); [UK legislation (legislation.gov.uk), The Wireless Telegraphy Apparatus (Receivers) (Exemption) Regulations 1989, SI 1989/123, as made](https://www.legislation.gov.uk/uksi/1989/123/made) (read 21 November 2026).

**United States (FCC).** The federal interception law forbids intentionally intercepting electronic communications, with exceptions for radio readily accessible to the general public. Radio that is scrambled or encrypted, or carried by a common carrier such as a mobile phone network, is not readily accessible. Scanners sold in the US must not be able to tune the cellular telephone bands. Passing on, or using for your own benefit, a radio message you were not meant to receive is forbidden outside the exceptions.

> “No person not being authorized by the sender shall intercept any radio communication and divulge or publish the existence, contents, substance, purport, effect, or meaning of such intercepted communication to any person.”

Sources: [US Government Publishing Office, 47 U.S.C. 605, Unauthorized publication or use of communications (United States Code, 2023 edition)](https://www.govinfo.gov/content/pkg/USCODE-2023-title47/html/USCODE-2023-title47-chap5-subchapVI-sec605.htm) (read 21 November 2026); [US Government Publishing Office, 18 U.S.C. 2511, Interception and disclosure of wire, oral, or electronic communications prohibited (United States Code, 2023 edition)](https://www.govinfo.gov/content/pkg/USCODE-2023-title18/html/USCODE-2023-title18-partI-chap119-sec2511.htm) (read 21 November 2026); [US Government Publishing Office, 18 U.S.C. 2510, Definitions, paragraph (16) (United States Code, 2023 edition)](https://www.govinfo.gov/content/pkg/USCODE-2023-title18/html/USCODE-2023-title18-partI-chap119-sec2510.htm) (read 21 November 2026); [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 15.121, Scanning receivers and frequency converters used with scanning receivers](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol1/xml/CFR-2025-title47-vol1-sec15-121.xml) (read 21 November 2026).

**Not known.** Other countries: not read. Ask the national radio regulator.

## Radio anyone may use

### PMR446 and CB, and in the US FRS, CB and GMRS

**United Kingdom (Ofcom).** No licence is needed for PMR446 (446.0 to 446.2 MHz, 500 mW e.r.p., handheld with a fixed antenna, no base station or repeater) or CB, as long as the radio meets Ofcom's interface requirement. US FRS radios cannot be used licence-exempt in the UK.

> “PMR446 users are reminded that their radios are only licence-exempt if they are built and operated within the conditions of the exemption regulations.”

Sources: [Ofcom, UK Interface Requirement 2030, Licence exempt Short Range Devices, published 23 October 2026](https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/interface-requirements/ir-2030.pdf) (read 21 November 2026); [UK legislation (legislation.gov.uk), The Wireless Telegraphy (Exemption) Regulations 2021, SI 2021/493, revised version valid from 29 April 2026 (regulations 4 and 9)](https://www.legislation.gov.uk/uksi/2021/493) (read 21 November 2026); [Ofcom, Analogue and Digital PMR446 Information Sheet, February 2018](https://www.ofcom.org.uk/siteassets/resources/documents/manage-your-licence/business-radio/business-radio-guidance/ir_2009_analogue_and_digita1.pdf) (read 21 November 2026); [Ofcom, Citizens' Band (CB) radio spectrum use: information and operation, guidance, March 2018](https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/spectrum-enforcement/citizens-band.pdf) (read 21 November 2026).

**United States (FCC).** The FCC authorises FRS, CB and the other Personal Radio Services by rule, with no individual licence. GMRS is the exception: it needs an individual licence, open to anyone 18 or older, which covers the holder's immediate family.

> “A valid individual license is required to operate a GMRS station.”

Sources: [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 95.305, Authorization to operate Personal Radio Services stations](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/xml/CFR-2025-title47-vol5-sec95-305.xml) (read 21 November 2026); [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 95.1705, Individual licenses required; eligibility; who may operate; cooperative use (GMRS)](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/xml/CFR-2025-title47-vol5-sec95-1705.xml) (read 21 November 2026).

**Not known.** Other countries: not read. Ask the national radio regulator.

### Meshtastic and other LoRa radios on the licence-exempt band

**United Kingdom (Ofcom).** Short range devices that meet Ofcom's IR 2030 are licence-exempt. Its general rows in 863 to 870 MHz have low power limits and duty-cycle or access rules; the highest, 869.40 to 869.65 MHz, allows 500 mW e.r.p. A radio set beyond those limits is not licence-exempt. Meshtastic's licensed (ham) mode drops encryption and sends a callsign so that it can be used as amateur radio: that is amateur use and needs an amateur licence, and Ofcom's licence forbids encryption between amateur stations.

> “Transmissions between amateur stations are not encrypted for the purpose of obscuring their meaning”

Sources: [Ofcom, UK Interface Requirement 2030, Licence exempt Short Range Devices, published 23 October 2026](https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/interface-requirements/ir-2030.pdf) (read 21 November 2026); [UK legislation (legislation.gov.uk), The Wireless Telegraphy (Exemption) Regulations 2021, SI 2021/493, revised version valid from 29 April 2026 (regulations 4 and 9)](https://www.legislation.gov.uk/uksi/2021/493) (read 21 November 2026); [Ofcom, Amateur Radio Wireless Telegraphy Licence Conditions Booklet (OFW611), published 21 February 2024](https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/emf/emf-amateur-licence-terms-and-conditions.pdf) (read 21 November 2026); [Ofcom, Amateur Radio Guidance, licensing guidance document for amateur radio, updated 14 October 2025](https://www.ofcom.org.uk/siteassets/resources/documents/manage-your-licence/amateur/amateur_radio_licence_guidance_for_licensees.pdf) (read 21 November 2026); [Meshtastic project, Meshtastic FAQ, Amateur radio (ham)](https://meshtastic.org/docs/faq/#amateur-radio-ham) (read 21 November 2026).

**United States (FCC).** Part 15 lets certified devices run without an individual licence, as long as they cause no harmful interference and accept interference. In 902 to 928 MHz the limit for digitally modulated systems is 1 watt peak conducted output. 902 to 928 MHz is also the 33 cm amateur band in the Americas: Meshtastic's licensed (ham) mode works under the amateur rules, which need a licence and forbid messages encoded to obscure their meaning.

> “This part sets out the regulations under which an intentional, unintentional, or incidental radiator may be operated without an individual license.”

Sources: [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 15.1, Scope of this part](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol1/xml/CFR-2025-title47-vol1-sec15-1.xml) (read 21 November 2026); [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 15.5, General conditions of operation](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol1/xml/CFR-2025-title47-vol1-sec15-5.xml) (read 21 November 2026); [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 15.247, Operation within the bands 902-928 MHz, 2400-2483.5 MHz, and 5725-5850 MHz](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol1/xml/CFR-2025-title47-vol1-sec15-247.xml) (read 21 November 2026); [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 97.301, Authorized frequency bands](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/xml/CFR-2025-title47-vol5-sec97-301.xml) (read 21 November 2026); [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 97.5, Station license required](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/xml/CFR-2025-title47-vol5-sec97-5.xml) (read 21 November 2026); [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 97.113, Prohibited transmissions](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/xml/CFR-2025-title47-vol5-sec97-113.xml) (read 21 November 2026); [Meshtastic project, Meshtastic FAQ, Amateur radio (ham)](https://meshtastic.org/docs/faq/#amateur-radio-ham) (read 21 November 2026).

**Not known.** Outpost has not read Meshtastic's region presets against IR 2030 row by row, so it does not say which UK row a given Meshtastic setting falls under. Other countries: not read.

## Transmitting on amateur bands

### Transmitting on any amateur band

**United Kingdom (Ofcom).** Using radio equipment needs an Ofcom licence unless regulations exempt it, and there is no exemption for amateur bands. Transmitting there needs an amateur licence (Foundation, Intermediate or Full), within its bands and power.

> “It is unlawful— (a) to establish or use a wireless telegraphy station, or (b) to instal or use wireless telegraphy apparatus, except under and in accordance with a licence”

Sources: [UK legislation (legislation.gov.uk), Wireless Telegraphy Act 2006, section 8, Licences and exemptions](https://www.legislation.gov.uk/ukpga/2006/36/section/8) (read 21 November 2026); [Ofcom, Amateur Radio Wireless Telegraphy Licence Conditions Booklet (OFW611), published 21 February 2024](https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/emf/emf-amateur-licence-terms-and-conditions.pdf) (read 21 November 2026); [Ofcom, Amateur Radio Guidance, licensing guidance document for amateur radio, updated 14 October 2025](https://www.ofcom.org.uk/siteassets/resources/documents/manage-your-licence/amateur/amateur_radio_licence_guidance_for_licensees.pdf) (read 21 November 2026).

**United States (FCC).** An amateur station may transmit only when it is under the physical control of a person named in an FCC amateur licence (or authorised for reciprocal operation).

> “The station apparatus must be under the physical control of a person named in an amateur station license grant on the ULS consolidated license database”

Sources: [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 97.5, Station license required](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/xml/CFR-2025-title47-vol5-sec97-5.xml) (read 21 November 2026).

**Not known.** Other countries: not read. Ask the national radio regulator.

### Sending APRS on VHF (144.800 MHz in Europe, 144.390 MHz in North America)

**United Kingdom (Ofcom).** APRS on 2 m is amateur transmission and needs an amateur licence. Ofcom names APRS as an example of a data station and of a transmit-only beacon, with power limits by licence class. 144.800 MHz is the APRS frequency in the IARU Region 1 band plan, not in the licence.

> “Examples of a data station include APRS, UIView/Packet stations, data/trunk links and RF mesh networks.”

Sources: [Ofcom, Amateur Radio Guidance, licensing guidance document for amateur radio, updated 14 October 2025](https://www.ofcom.org.uk/siteassets/resources/documents/manage-your-licence/amateur/amateur_radio_licence_guidance_for_licensees.pdf) (read 21 November 2026); [Ofcom, Amateur Radio Wireless Telegraphy Licence Conditions Booklet (OFW611), published 21 February 2024](https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/emf/emf-amateur-licence-terms-and-conditions.pdf) (read 21 November 2026); [UK legislation (legislation.gov.uk), Wireless Telegraphy Act 2006, section 8, Licences and exemptions](https://www.legislation.gov.uk/ukpga/2006/36/section/8) (read 21 November 2026); [IARU Region 1, IARU-R1 VHF Handbook, version 10.03, February 2026 (band plans for 50 MHz and up)](https://www.iaru-r1.org/wp-content/uploads/2026/02/VHF_Handbook_V10_03_final.pdf) (read 21 November 2026).

**United States (FCC).** APRS on 2 m (144 to 148 MHz in the Americas) is amateur transmission and needs an amateur licence. 144.390 MHz is the APRS centre of activity in the IARU Region 2 band plan, not in the FCC rules.

Sources: [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 97.5, Station license required](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/xml/CFR-2025-title47-vol5-sec97-5.xml) (read 21 November 2026); [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 97.301, Authorized frequency bands](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/xml/CFR-2025-title47-vol5-sec97-301.xml) (read 21 November 2026); [IARU Region 2, IARU Region 2 Band Plan, September 2020](https://www.iaru.org/wp-content/uploads/2020/10/IARU-Region-2-Band-plan.pdf) (read 21 November 2026).

**Not known.** Outpost has not found the APRS frequencies in a regulator's own document; they come from the band plans. Other countries: not read.

### LoRa APRS on 433 MHz (433.775 MHz)

**United Kingdom (Ofcom).** 433.775 MHz is inside the UK 70 cm amateur band (430 to 440 MHz; 432 to 435 MHz is secondary), so LoRa APRS at amateur power is amateur transmission and needs a licence. Separately, IR 2030 lets anyone use short range devices in 433.05 to 434.79 MHz without a licence, but only at 10 mW e.r.p. with a duty cycle of 10 per cent or less (or 1 mW, or 10 mW in 434.04 to 434.79 MHz with 25 kHz or less bandwidth). A LoRa APRS tracker or gateway at amateur power is not that.

Sources: [Ofcom, Amateur Radio Wireless Telegraphy Licence Conditions Booklet (OFW611), published 21 February 2024](https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/emf/emf-amateur-licence-terms-and-conditions.pdf) (read 21 November 2026); [UK legislation (legislation.gov.uk), Wireless Telegraphy Act 2006, section 8, Licences and exemptions](https://www.legislation.gov.uk/ukpga/2006/36/section/8) (read 21 November 2026); [Ofcom, UK Interface Requirement 2030, Licence exempt Short Range Devices, published 23 October 2026](https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/interface-requirements/ir-2030.pdf) (read 21 November 2026); [Ofcom, Analogue and Digital PMR446 Information Sheet, February 2018](https://www.ofcom.org.uk/siteassets/resources/documents/manage-your-licence/business-radio/business-radio-guidance/ir_2009_analogue_and_digita1.pdf) (read 21 November 2026).

**United States (FCC).** 433.775 MHz is inside the 70 cm amateur band (420 to 450 MHz in the Americas), so LoRa APRS there is amateur transmission and needs an amateur licence.

Sources: [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 97.301, Authorized frequency bands](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/xml/CFR-2025-title47-vol5-sec97-301.xml) (read 21 November 2026); [US Government Publishing Office (Code of Federal Regulations, 1 October 2025 edition), 47 CFR 97.5, Station license required](https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/xml/CFR-2025-title47-vol5-sec97-5.xml) (read 21 November 2026).

**Not known.** 433.775 MHz for LoRa APRS is a common choice among operators; the IARU Region 1 band plan lists 433.625 to 433.775 MHz as digital communications channels but does not name LoRa APRS, and Outpost has not found it in a regulator's document. Outpost has not read a Part 15 rule for 433 MHz. Other countries: not read.
