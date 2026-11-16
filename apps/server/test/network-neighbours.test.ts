/**
 * Reading what each operating system prints. The samples are laid out as each program
 * lays out its output, with made-up addresses (documentation ranges and locally
 * administered hardware addresses), not taken from any real network.
 */
import { describe, expect, it } from "vitest";
import { parseAvahi, parseInstances, parseServiceTypes, serviceLabel } from "../src/modules/network/announcements.ts";
import { parseMakers } from "../src/modules/network/makers.ts";
import {
  isDeviceMac,
  isPrivateMac,
  normaliseMac,
  parseIpNeigh,
  parseMacArp,
  parseMacNdp,
  parseMacRoute,
  parseProcArp,
  parseProcRoute,
} from "../src/modules/network/neighbours.ts";

const MAC_ARP = `? (192.168.77.1) at 2:11:22:33:44:55 on en0 ifscope [ethernet]
? (192.168.77.12) at 0:1b:2c:3d:4e:5f on en0 ifscope [ethernet]
? (192.168.77.40) at (incomplete) on en0 ifscope [ethernet]
? (192.168.77.255) at ff:ff:ff:ff:ff:ff on en0 ifscope [ethernet]
? (224.0.0.251) at 1:0:5e:0:0:fb on en0 ifscope permanent [ethernet]
? (169.254.10.20) at 6:aa:bb:cc:dd:ee on en0 [ethernet]
`;

const MAC_NDP = `Neighbor                                Linklayer Address  Netif Expire    St Flgs Prbs
fe80::1%lo0                             (incomplete)         lo0 permanent R R
fe80::4c1:2ff:fe33:4455%en0             2:11:22:33:44:55     en0 23h59m50s S R
fd00:77::12                             0:1b:2c:3d:4e:5f     en0 permanent R
ff02::fb%en0                            33:33:0:0:0:fb       en0 permanent R
`;

const PROC_ARP = `IP address       HW type     Flags       HW address            Mask     Device
192.168.77.1     0x1         0x2         02:11:22:33:44:55     *        eth0
192.168.77.12    0x1         0x2         00:1b:2c:3d:4e:5f     *        eth0
192.168.77.50    0x1         0x0         00:00:00:00:00:00     *        eth0
`;

const IP_NEIGH = `192.168.77.1 dev wlan0 lladdr 02:11:22:33:44:55 REACHABLE
192.168.77.12 dev wlan0 lladdr 00:1b:2c:3d:4e:5f STALE
192.168.77.50 dev wlan0  FAILED
192.168.77.51 dev wlan0  INCOMPLETE
fe80::4c1:2ff:fe33:4455 dev wlan0 lladdr 02:11:22:33:44:55 router STALE
`;

describe("neighbour tables", () => {
  it("reads macOS arp -an, padding the parts macOS shortens and leaving out what is not a device", () => {
    expect(parseMacArp(MAC_ARP)).toEqual([
      { address: "192.168.77.1", mac: "02:11:22:33:44:55", interface: "en0" },
      { address: "192.168.77.12", mac: "00:1b:2c:3d:4e:5f", interface: "en0" },
      { address: "169.254.10.20", mac: "06:aa:bb:cc:dd:ee", interface: "en0" },
    ]);
  });

  it("reads macOS ndp -an, without the zone and without multicast", () => {
    expect(parseMacNdp(MAC_NDP)).toEqual([
      { address: "fe80::4c1:2ff:fe33:4455", mac: "02:11:22:33:44:55", interface: "en0" },
      { address: "fd00:77::12", mac: "00:1b:2c:3d:4e:5f", interface: "en0" },
    ]);
  });

  it("reads Linux /proc/net/arp, leaving out incomplete entries", () => {
    expect(parseProcArp(PROC_ARP).map((entry) => entry.address)).toEqual(["192.168.77.1", "192.168.77.12"]);
  });

  it("reads Linux ip neigh show, IPv4 and IPv6, leaving out failed and incomplete entries", () => {
    expect(parseIpNeigh(IP_NEIGH)).toEqual([
      { address: "192.168.77.1", mac: "02:11:22:33:44:55", interface: "wlan0" },
      { address: "192.168.77.12", mac: "00:1b:2c:3d:4e:5f", interface: "wlan0" },
      { address: "fe80::4c1:2ff:fe33:4455", mac: "02:11:22:33:44:55", interface: "wlan0" },
    ]);
  });

  it("finds the router on macOS and Linux", () => {
    const route = `   route to: default
destination: default
       mask: default
    gateway: 192.168.77.1
  interface: en0
`;
    expect(parseMacRoute(route)).toEqual(["192.168.77.1"]);
    const proc = `Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT
eth0\t00000000\t014DA8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0
eth0\t004DA8C0\t00000000\t0001\t0\t0\t100\t00FFFFFF\t0\t0\t0
`;
    expect(parseProcRoute(proc)).toEqual(["192.168.77.1"]);
  });

  it("tells a device's address from a group address, and a made-up (private) one from a maker's", () => {
    expect(normaliseMac("a:b:c:d:e:f")).toBe("0a:0b:0c:0d:0e:0f");
    expect(normaliseMac("nonsense")).toBeNull();
    expect(isDeviceMac("01:00:5e:00:00:fb")).toBe(false);
    expect(isDeviceMac("33:33:00:00:00:01")).toBe(false);
    expect(isDeviceMac("ff:ff:ff:ff:ff:ff")).toBe(false);
    expect(isDeviceMac("00:1b:2c:3d:4e:5f")).toBe(true);
    expect(isPrivateMac("02:11:22:33:44:55")).toBe(true);
    expect(isPrivateMac("da:11:22:33:44:55")).toBe(true);
    expect(isPrivateMac("00:1b:2c:3d:4e:5f")).toBe(false);
  });
});

describe("announcements", () => {
  it("reads the kinds of service from dns-sd's browse of _services._dns-sd._udp", () => {
    const output = `Browsing for _services._dns-sd._udp.local.
DATE: ---Mon 16 Nov 2026---
16:06:52.004  ...STARTING...
Timestamp     A/R    Flags  if Domain               Service Type         Instance Name
16:06:52.005  Add        3  14 .                    _tcp.local.          _smb
16:06:52.005  Add        3  14 .                    _tcp.local.          _ipp
16:06:52.006  Add        2  14 .                    _udp.local.          _sleep-proxy
16:06:52.006  Rmv        0  14 .                    _tcp.local.          _gone
`;
    expect(parseServiceTypes(output)).toEqual(["_smb._tcp", "_ipp._tcp", "_sleep-proxy._udp"]);
  });

  it("reads instances from dns-sd's browse of one kind", () => {
    const output = `Browsing for _smb._tcp.local.
Timestamp     A/R    Flags  if Domain               Service Type         Instance Name
16:06:52.005  Add        3  14 local.               _smb._tcp.           Shed NAS
16:06:52.005  Add        2  14 local.               _smb._tcp.           Workshop  Pi
`;
    expect(parseInstances(output, "_smb._tcp")).toEqual(["Shed NAS", "Workshop  Pi"]);
  });

  it("leaves out a name that a command would read as an option", () => {
    const output = `Browsing for _smb._tcp.local.
16:06:52.005  Add        3  14 local.               _smb._tcp.           -timeout
16:06:52.005  Add        3  14 local.               _smb._tcp.           --help
16:06:52.005  Add        2  14 local.               _smb._tcp.           Shed-NAS
`;
    expect(parseInstances(output, "_smb._tcp")).toEqual(["Shed-NAS"]);
  });

  it("reads Avahi's parsable output, resolved lines only, with its escapes", () => {
    const output = `+;wlan0;IPv4;Shed\\032NAS;_smb._tcp;local
=;wlan0;IPv4;Shed\\032NAS;_smb._tcp;local;shed-nas.local;192.168.77.12;445;
=;wlan0;IPv4;Hall\\032printer;_ipp._tcp;local;hall-printer.local;192.168.77.30;631;"txtvers=1" "ty=Printer"
=;wlan0;IPv6;Hall\\032printer;_ipp._tcp;local;hall-printer.local;fe80::30%wlan0;631;
`;
    expect(parseAvahi(output)).toEqual([
      { type: "_smb._tcp", name: "Shed NAS", host: "shed-nas.local", address: "192.168.77.12", port: 445 },
      { type: "_ipp._tcp", name: "Hall printer", host: "hall-printer.local", address: "192.168.77.30", port: 631 },
      { type: "_ipp._tcp", name: "Hall printer", host: "hall-printer.local", address: "fe80::30", port: 631 },
    ]);
  });

  it("says what a service is in plain words, and leaves an unknown one as announced", () => {
    expect(serviceLabel("_smb._tcp")).toBe("File sharing");
    expect(serviceLabel("_ipp._tcp")).toBe("Printer");
    expect(serviceLabel("_airplay._tcp")).toBe("AirPlay");
    expect(serviceLabel("_something-else._tcp")).toBe("_something-else._tcp");
  });
});

describe("the IEEE registry", () => {
  it("reads MA-L lines, with quoted names that hold commas", () => {
    const rows = [
      "Registry,Assignment,Organization Name,Organization Address",
      'MA-L,001B2C,"Example Makers, Ltd.","1 Some Street, Somewhere"',
      "MA-L,ABCDEF,Plain Name Inc,Address",
      "MA-M,0011223,Medium Block Co,Address",
    ];
    // The reader wants a file the size of the registry before it keeps one; parsing alone has no minimum.
    const makers = parseMakers(rows.join("\n"));
    expect(makers.get("001b2c")).toBe("Example Makers, Ltd.");
    expect(makers.get("abcdef")).toBe("Plain Name Inc");
    expect(makers.size).toBe(2);
    expect(parseMakers("not,the,registry\nMA-L,001B2C,X,Y").size).toBe(0);
  });
});
