# APRS: WebChat, digipeater, iGate and the map

APRS is where DigiPi shines brightest, because it offers all four of the classic APRS roles in one box: a **messenger** you use like a chat app, a **map** of everything on the channel, a **digipeater** that extends other people's reach, and an **iGate** that bridges radio to the internet. This chapter takes the roles in that order — from the ones that are pure fun to the ones that make you infrastructure, with the responsibilities that follow. If APRS itself is new to you, the handbook's [APRS series](outpost:entry/logbook73.handbook/aprs) is the deep background; this chapter assumes its vocabulary and concentrates on DigiPi's part.

## The channel

APRS regionally standardises on one calling channel, and DigiPi's digipeater is built for exactly those: **`144.390 MHz` in the Americas and `144.800 MHz` in Europe** (the project words it as repeating "packets heard on 144.390 and 144.800(europe)"). Your radio sits on your region's channel in FM; everything below happens there. Other regions and special channels exist — [the handbook](outpost:entry/logbook73.handbook/aprs-infrastructure) maps them — and the operator, as always, is the one responsible for transmitting where their licence and band plan allow.

## WebChat: APRS as a messaging app

The WebChat screen is DigiPi's headline trick: [APRS messaging](outpost:entry/logbook73.handbook/aprs-messaging) presented the way your phone presents texts. You type to a callsign; the station packetises, transmits, and listens for the acknowledgement; replies land back in the thread. Because the browser is doing the _displaying_ and the Pi the _radioing_, this works identically from the sofa or a summit.

Operating notes that keep chat happy:

- **Messages ride the same shared channel as everything else** — short, purposeful exchanges are the culture. This is texting over a party line, not an instant messenger.
- **Delivery is best-effort.** Acks get lost; distant stations hear you via luck and [digipeaters](outpost:entry/logbook73.handbook/aprs-paths). No ack means "try again in a bit", not necessarily "not delivered".
- **Know your reach.** Direct is best; a digipeated hop or two is normal; the wider APRS-IS world is reachable when an iGate (maybe yours, below) is in play.

## The map: seeing the channel

The map/dashboard turns everything the station hears into positions and traces — the [station zoo](outpost:entry/logbook73.handbook/aprs-station-zoo) of trackers, weather stations, digis and mobiles, live. It is the fastest way to answer operating questions ("is the local digi up?", "did my beacon get out?") and, honestly, the screen most likely to convert houseguests into licensees. Reading it well is a skill the handbook teaches ([reading a station](outpost:entry/logbook73.handbook/aprs-reading-a-station)); DigiPi's contribution is putting it in every browser in the house.

## The digipeater: becoming a relay

Flip the digipeater on and your station starts **repeating other stations' packets** — the cell towers of APRS, and now you are one. On the air this is transformative for your local area (one well-placed digi can bring a valley to life) and it is also the point where this chapter changes tone, because a digipeater:

- **transmits automatically**, whenever a qualifying packet asks it to;
- **transmits when you are not there**, if you leave it running;
- **identifies as you** the whole time.

So, the licence paragraph — honestly and without invention. **Automatic and unattended operation are regulated differently in different countries.** In the UK, unattended operation carries its own conditions under the amateur licence, and the details (duration, supervision, notification) are the licence's to state, not this guide's. Elsewhere the rules differ again. Before your digipeater runs beyond your supervision, read _your_ licence's terms for automatic/unattended stations and satisfy them. That reading takes an evening; being the operator whose unattended station misbehaved takes much longer to live down.

Craft, once you are cleared to play:

- **Modest is beautiful.** A digi that hears well and repeats cleanly at sensible power serves better than a loud one that clobbers the channel. The [paths chapter](outpost:entry/logbook73.handbook/aprs-paths) explains why the modern network prefers short hops and well-behaved digis.
- **Mind the duty cycle.** A digi on a busy channel transmits _a lot_. The cheap-HT digi is a fine experiment and a poor institution; if the role sticks, [chapter 10](outpost:entry/logbook73.guide.digipi/configs)'s shelf build with a proper rig is the upgrade path.
- **Watch your own effect.** The map shows your digi's repeats; if the channel's character worsens when your station appears, that is data.

## The iGate: bridging RF to the internet

An [iGate](outpost:entry/logbook73.handbook/aprs-igates) forwards packets heard on RF into **APRS-IS**, the internet backbone — which is how a hiker's beacon in your valley becomes visible to their family's browser across the world. DigiPi's iGate needs your **APRS-IS passcode** (from [setup](outpost:entry/logbook73.guide.digipi/install)) and, once running, quietly performs one of the network's most genuinely useful services.

iGate wisdom:

- **Receive-only iGating is the humble, valuable default.** Just hearing well and gating faithfully improves the network. The RF side of your station stays silent in this role, which also simplifies the licence questions above.
- **Coverage honesty**: an iGate in a good location with a decent antenna gates a whole region; one on a rubber duck gates your street. Both are legitimate; know which you are before drawing conclusions from what "the internet" saw.
- **The internet is forever-ish.** What your iGate hears becomes globally visible and archived by the APRS-IS ecosystem. That is the system working as designed — and worth remembering when choosing what your _own_ beacons say ([your station](outpost:entry/logbook73.handbook/aprs-your-station) discusses beacon hygiene).

## Beacons: your own presence

Alongside the roles above, the station can announce _itself_ — position, symbol, comment — using the identity and grid from setup. Keep the [SSID conventions](outpost:entry/logbook73.handbook/aprs-anatomy) (a distinct SSID for the digi/iGate role versus your personal messaging presence keeps the map legible), beacon at a civilised interval, and say something useful in the comment or nothing at all.

## A sane APRS progression on DigiPi

1. **Week one — listener**: radio on channel, map on the tablet, WebChat with a nearby friend. Learn your local RF neighbourhood.
2. **Week two — participant**: beacons on with sensible settings; messaging habits formed.
3. **When cleared and convinced — infrastructure**: receive-only iGate first, then digipeater where coverage genuinely needs it and your licence's automatic/unattended conditions are met.

Everything above shares the channel with everyone else's everything above; the [best-practices chapter](outpost:entry/logbook73.guide.digipi/best-practices) collects the etiquette in one place. Next hat: [email over radio](outpost:entry/logbook73.guide.digipi/winlink).
