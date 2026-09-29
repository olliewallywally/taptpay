import "./support/test-env";

import { limitAddress } from "../client-address";

/** R1-T4 phase B: the form an address limit counts. */
describe("limitAddress", () => {
  test.each([
    ["203.0.113.9", "203.0.113.9"],
    ["::ffff:203.0.113.9", "203.0.113.9"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:db8:1:2::9", "2001:db8:1:2::/64"],
    ["2001:DB8:0001:0002::", "2001:db8:1:2::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["64:ff9b::192.0.2.1", "64:ff9b:0:0::/64"],
  ])("counts %p as %p", (raw, expected) => {
    expect(limitAddress(raw)).toBe(expected);
  });

  it("puts every address of one /64 network in one count, and the next network in another", () => {
    expect(limitAddress("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe(limitAddress("2001:db8:1:2::1"));
    expect(limitAddress("2001:db8:1:3::1")).not.toBe(limitAddress("2001:db8:1:2::1"));
  });

  test.each([[undefined], [""], ["not-an-address"], ["203.0.113.999"]])("has no count for %p", (raw) => {
    expect(limitAddress(raw)).toBeNull();
  });
});
