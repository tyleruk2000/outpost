/**
 * Which networks a scan may look at. Every interface list here is made up; nothing reads
 * this computer's own.
 */
import type os from "node:os";
import { describe, expect, it } from "vitest";
import { classify, type InterfaceList, insidePlanned, planSubnets, sweepAddresses } from "../src/modules/network/subnets.ts";

const v4 = (address: string, prefix: number, extra: Partial<os.NetworkInterfaceInfo> = {}): os.NetworkInterfaceInfo =>
  ({
    address,
    netmask: "",
    family: "IPv4",
    mac: "02:00:00:00:00:01",
    internal: false,
    cidr: `${address}/${prefix}`,
    ...extra,
  }) as os.NetworkInterfaceInfo;

const v6 = (address: string, prefix: number): os.NetworkInterfaceInfo =>
  ({
    address,
    netmask: "",
    family: "IPv6",
    mac: "02:00:00:00:00:01",
    internal: false,
    cidr: `${address}/${prefix}`,
    scopeid: 0,
  }) as os.NetworkInterfaceInfo;

describe("planSubnets", () => {
  it("sweeps a home /24, leaving out the network, broadcast and this computer's own address", () => {
    const { subnets, skipped } = planSubnets({ en0: [v4("192.168.50.20", 24)] });
    expect(skipped).toEqual([]);
    expect(subnets).toHaveLength(1);
    expect(subnets[0]).toMatchObject({ cidr: "192.168.50.0/24", kind: "private", plan: "sweep", swept: null, addresses: 253 });
    const addresses = sweepAddresses(subnets[0]!);
    expect(addresses[0]).toBe("192.168.50.1");
    expect(addresses.at(-1)).toBe("192.168.50.254");
    expect(addresses).not.toContain("192.168.50.20");
    expect(addresses).not.toContain("192.168.50.0");
    expect(addresses).not.toContain("192.168.50.255");
  });

  it("sweeps a /22 whole and narrows anything larger to the /24 this computer is in, saying why", () => {
    const whole = planSubnets({ eth0: [v4("10.4.6.9", 22)] }).subnets[0]!;
    expect(whole).toMatchObject({ cidr: "10.4.4.0/22", plan: "sweep", addresses: 1021 });

    const narrowed = planSubnets({ eth0: [v4("10.20.30.40", 8)] }).subnets[0]!;
    expect(narrowed).toMatchObject({ cidr: "10.0.0.0/8", plan: "narrowed", swept: "10.20.30.0/24", addresses: 253 });
    expect(narrowed.reason).toMatch(/10\.0\.0\.0\/8 has 16,777,214 addresses.*only 10\.20\.30\.0\/24/);
    const addresses = sweepAddresses(narrowed);
    expect(addresses.every((address) => address.startsWith("10.20.30."))).toBe(true);

    const sixteen = planSubnets({ eth0: [v4("172.16.9.3", 16)] }).subnets[0]!;
    expect(sixteen).toMatchObject({ plan: "narrowed", swept: "172.16.9.0/24" });
  });

  it("never scans a public address, the carriers' shared range, loopback or a tunnel", () => {
    const interfaces: InterfaceList = {
      lo0: [v4("127.0.0.1", 8, { internal: true })],
      en0: [v4("203.0.113.7", 24), v4("8.8.8.8", 24)],
      en5: [v4("100.72.1.2", 10)],
      utun3: [v4("10.8.0.2", 24)],
      tailscale0: [v4("100.101.102.103", 32)],
      wg0: [v4("192.168.200.1", 24)],
      en7: [v6("2001:db8::5", 64)],
    };
    const { subnets, skipped } = planSubnets(interfaces);
    expect(subnets).toEqual([]);
    const reasons = Object.fromEntries(skipped.map((entry) => [entry.address, entry.reason]));
    expect(reasons["203.0.113.7"]).toMatch(/public address/);
    expect(reasons["8.8.8.8"]).toMatch(/public address/);
    expect(reasons["100.72.1.2"]).toMatch(/100\.64\.0\.0\/10/);
    expect(reasons["10.8.0.2"]).toMatch(/tunnel/);
    expect(reasons["192.168.200.1"]).toMatch(/tunnel/);
    expect(reasons["2001:db8::5"]).toMatch(/public IPv6/);
    // Loopback is the computer's own and is simply not listed.
    expect(skipped.some((entry) => entry.address === "127.0.0.1")).toBe(false);
  });

  it("lists IPv6 unique-local and link-local networks to listen on, never to sweep", () => {
    const { subnets } = planSubnets({ en0: [v4("192.168.1.2", 24), v6("fd12:3456:789a::2", 64), v6("fe80::1c:2d", 64)] });
    const six = subnets.filter((subnet) => subnet.family === 6);
    expect(six.map((subnet) => [subnet.kind, subnet.plan, subnet.addresses])).toEqual([
      ["unique-local", "listen", 0],
      ["link-local", "listen", 0],
    ]);
    for (const subnet of six) expect(sweepAddresses(subnet)).toEqual([]);
  });

  it("takes link-local IPv4 (169.254/16) as narrowed to its /24", () => {
    const subnet = planSubnets({ en0: [v4("169.254.33.7", 16)] }).subnets[0]!;
    expect(subnet).toMatchObject({ kind: "link-local", plan: "narrowed", swept: "169.254.33.0/24" });
  });

  it("looks at a network once when two interfaces are on it, and skips a point-to-point link", () => {
    const { subnets, skipped } = planSubnets({ en0: [v4("192.168.1.2", 24)], en1: [v4("192.168.1.3", 24)], en2: [v4("10.1.1.1", 32)] });
    expect(subnets).toHaveLength(1);
    expect(skipped[0]?.reason).toMatch(/single other address/);
  });

  it("in a container sees only the container's own bridge network, which is what it plans", () => {
    // Docker's default bridge: the container has 172.17.0.2/16 and nothing else. The service refuses
    // to scan in a container unless told it has host networking; this is what it would otherwise see.
    const { subnets } = planSubnets({ lo: [v4("127.0.0.1", 8, { internal: true })], eth0: [v4("172.17.0.2", 16)] });
    expect(subnets).toEqual([expect.objectContaining({ cidr: "172.17.0.0/16", plan: "narrowed", swept: "172.17.0.0/24" })]);
  });
});

describe("classify and insidePlanned", () => {
  it("knows each private and link-local range by its RFC", () => {
    expect(classify("10.0.0.1")).toEqual({ kind: "private" });
    expect(classify("172.31.255.1")).toEqual({ kind: "private" });
    expect(classify("172.32.0.1")).toHaveProperty("reason");
    expect(classify("192.168.0.1")).toEqual({ kind: "private" });
    expect(classify("169.254.1.1")).toEqual({ kind: "link-local" });
    expect(classify("fd00::1")).toEqual({ kind: "unique-local" });
    expect(classify("fe80::1%en0")).toEqual({ kind: "link-local" });
    expect(classify("2a00:1450::1")).toHaveProperty("reason");
  });

  it("keeps only addresses on the networks planned", () => {
    const { subnets } = planSubnets({ en0: [v4("192.168.1.2", 24), v6("fe80::2", 64)] });
    expect(insidePlanned("192.168.1.77", subnets)).toBe(true);
    expect(insidePlanned("192.168.2.77", subnets)).toBe(false);
    expect(insidePlanned("8.8.8.8", subnets)).toBe(false);
    expect(insidePlanned("fe80::99", subnets)).toBe(true);
    expect(insidePlanned("fd00::99", subnets)).toBe(false);
  });
});
