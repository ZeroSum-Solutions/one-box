import { describe, expect, it } from "vitest";
import { MARKET_DIRECTORY_HOSTS, isBlockedMarketHost } from "./marketSourcePolicy";

describe("market source policy", () => {
  it("blocks every governed directory host in both bare-host and full-URL form", () => {
    for (const host of MARKET_DIRECTORY_HOSTS) {
      expect(isBlockedMarketHost(host), host).toBe(true);
      expect(isBlockedMarketHost(`https://www.${host}/listing`), host).toBe(true);
    }
  });

  it("uses host-label boundaries and fails closed for invalid URLs", () => {
    expect(isBlockedMarketHost("https://notyelp.com/services")).toBe(false);
    expect(isBlockedMarketHost("https://pool-care.example/services")).toBe(false);
    expect(isBlockedMarketHost("https://yelp.com./listing")).toBe(true);
    expect(isBlockedMarketHost("not a host")).toBe(true);
  });
});
