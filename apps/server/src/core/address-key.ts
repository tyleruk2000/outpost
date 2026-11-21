/**
 * What a per-address limit counts by. An IPv4 address is one device. An IPv6 device is
 * given a whole /64 by its network and may take a new address in it whenever it likes
 * (temporary addresses, RFC 8981), so it is counted by its /64: "2001:db8:1:2::/64".
 * Without this, a device could get round a limit on wrong sign-ins or requests by moving
 * to the next address (outpost-vsm).
 */

/** The 8 groups of an IPv6 address, or null when it is not one. */
function groups(address: string): number[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const part = (text: string) => (text === "" ? [] : text.split(":"));
  const head = part(halves[0]!);
  const tail = halves.length === 2 ? part(halves[1]!) : [];
  // An IPv4 tail ("::ffff:192.168.1.2") is two groups.
  const last = tail.length > 0 ? tail : head;
  if (last.length > 0 && last[last.length - 1]!.includes(".")) {
    const v4 = last.pop()!.split(".").map(Number);
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    last.push(((v4[0]! << 8) | v4[1]!).toString(16), ((v4[2]! << 8) | v4[3]!).toString(16));
  }
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (all.length !== 8 || all.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  return all.map((group) => Number.parseInt(group, 16));
}

/** The key a per-address limit uses: an IPv4 address as it is, an IPv6 one by its /64. */
export function limitKey(address: string): string {
  const value = address.trim().toLowerCase().replace(/%.*$/, "");
  if (value.startsWith("::ffff:") && value.includes(".")) return value.slice("::ffff:".length);
  if (!value.includes(":")) return value;
  const parts = groups(value);
  if (!parts) return value;
  return `${parts
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}
