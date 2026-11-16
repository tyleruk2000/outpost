/**
 * A made-up computer on a made-up home network, for the tests of "Devices on this
 * network" and the end-to-end suite (OUTPOST_NETWORK_STAND_IN). Nothing in it comes
 * from a real network: the addresses are in a private range picked for the tests, and
 * the hardware addresses are locally administered or made up.
 */
import type { StandIn } from "../../../src/modules/network/system.ts";

export function standInWorld(overrides: Partial<StandIn> = {}): StandIn {
  return {
    os: "linux",
    interfaces: {
      lo: [{ address: "127.0.0.1", netmask: "255.0.0.0", family: "IPv4", mac: "00:00:00:00:00:00", internal: true, cidr: "127.0.0.1/8" }],
      eth0: [
        {
          address: "192.168.77.5",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "02:00:5e:00:00:05",
          internal: false,
          cidr: "192.168.77.5/24",
        },
        {
          address: "fe80::5",
          netmask: "ffff:ffff:ffff:ffff::",
          family: "IPv6",
          mac: "02:00:5e:00:00:05",
          internal: false,
          cidr: "fe80::5/64",
          scopeid: 2,
        },
      ],
    },
    routers: ["192.168.77.1"],
    responders: {
      "192.168.77.1": { ping: true, ports: [80], mac: "00:1b:2c:00:00:01", name: "router.home" },
      "192.168.77.12": { ping: false, ports: [445], mac: "00:1b:2c:00:00:12" },
      "192.168.77.30": { silent: true, mac: "00:5e:6f:00:00:30" },
      "192.168.77.44": { ping: true, mac: "06:aa:bb:cc:dd:44", name: "garden-pi.home" },
    },
    neighbours: [
      // Already known before the scan, on the same link but outside what is swept: kept.
      { address: "fe80::12", mac: "00:1b:2c:00:00:12", interface: "eth0" },
      // On no network of this computer's: dropped.
      { address: "10.9.9.9", mac: "00:1b:2c:00:00:99", interface: "eth0" },
    ],
    announcements: [
      { type: "_smb._tcp", name: "Shed NAS", host: "shed-nas.local", address: "192.168.77.12", port: 445 },
      { type: "_http._tcp", name: "Shed NAS admin", host: "shed-nas.local", address: "192.168.77.12", port: 5000 },
      { type: "_ipp._tcp", name: "Hall printer", host: "hall-printer.local", address: "192.168.77.30", port: 631 },
      // Somewhere this computer is not: ignored.
      { type: "_smb._tcp", name: "Elsewhere", host: "elsewhere.local", address: "10.9.9.10", port: 445 },
    ],
    ...overrides,
  };
}
