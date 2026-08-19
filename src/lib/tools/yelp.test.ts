import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CostCapExceeded } from "../runstate";
import {
  fetchYelpMarket,
  parseYelpListings,
  summarizeMarket,
  yelpSearchUrl,
} from "./yelp";

const addCost = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../runstate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../runstate")>()),
  addCost,
}));

/** A real Yelp search page, captured live via Firecrawl on 2026-08-16
 * ("bakery" / "Portland, OR"). Kept whole on purpose: the parser has to
 * ignore the sponsored blocks, the FAQ, and the related-search tails, and a
 * trimmed fixture would stop proving that. */
const FIXTURE = fs.readFileSync(
  path.join(__dirname, "__fixtures__", "yelp-search-portland-bakery.md"),
  "utf8"
);

/** The other layout. Yelp numbers organic results on food categories but not
 * on service categories, and service pages carry no price tier. Captured live
 * 2026-08-16 ("emergency plumber" / "Austin, TX") after the numbered-only
 * parser returned an empty roster against it. */
const SERVICE_FIXTURE = fs.readFileSync(
  path.join(__dirname, "__fixtures__", "yelp-search-austin-plumber.md"),
  "utf8"
);

describe("yelpSearchUrl", () => {
  it("encodes category and location into a Yelp search URL", () => {
    expect(yelpSearchUrl("emergency plumber", "Austin, TX")).toBe(
      "https://www.yelp.com/search?find_desc=emergency+plumber&find_loc=Austin%2C+TX"
    );
  });
});

describe("parseYelpListings", () => {
  it("extracts the ranked organic roster from a real search page", () => {
    const listings = parseYelpListings(FIXTURE);

    expect(listings).toHaveLength(10);
    expect(listings[0]).toEqual({
      rank: 1,
      name: "Ken's Artisan Bakery",
      rating: 4.4,
      reviewCount: 1100,
      categories: ["Bakeries", "Cafes", "Pizza"],
      priceRange: "$$",
      yelpUrl: "https://www.yelp.com/biz/kens-artisan-bakery-portland",
    });
    expect(listings.map((l) => l.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("drops sponsored placements so paid slots never enter the market bar", () => {
    const names = parseYelpListings(FIXTURE).map((l) => l.name);

    // Sponsored blocks in the fixture — ad placement, not organic rank.
    expect(names).not.toContain("Nothing Bundt Cakes");
    expect(names).not.toContain("Whole Foods Market");
    expect(names).not.toContain("Sincerely Bagel");
  });

  it("reads the un-numbered service-category layout too", () => {
    const listings = parseYelpListings(SERVICE_FIXTURE);

    expect(listings).toHaveLength(10);
    expect(listings[0]).toEqual({
      rank: 1,
      name: "Blue Dragon Plumbing",
      rating: 4.9,
      reviewCount: 529,
      categories: ["Plumbing"],
      yelpUrl: "https://www.yelp.com/biz/blue-dragon-plumbing-austin-2",
    });
    expect(listings.map((l) => l.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Service listings carry no price tier — absent, not guessed.
    expect(listings.every((l) => l.priceRange === undefined)).toBe(true);
  });

  it("keeps pagination links out of the last listing's categories", () => {
    const listings = parseYelpListings(SERVICE_FIXTURE);
    const last = listings[listings.length - 1];

    // The pagination strip sits inside the final result's block and its links
    // share the /search?find_desc= shape that categories use.
    expect(last.name).toBe("O & M Plumbing Services");
    expect(last.categories).toEqual([
      "Plumbing",
      "Water Heater Installation/Repair",
      "Water Purification Services",
    ]);
  });

  it("keeps sponsored plumbers out even when the layout has no rank numbers", () => {
    const listings = parseYelpListings(SERVICE_FIXTURE);
    const names = listings.map((l) => l.name);

    expect(names).not.toContain("Roto Rooter");
    expect(names).not.toContain("Spot-On Plumbing");
    expect(names).not.toContain("AVAI Contractor");
    expect(listings.every((l) => l.yelpUrl?.includes("/biz/"))).toBe(true);
  });

  it("returns an empty roster for a bot-challenge page instead of throwing", () => {
    expect(parseYelpListings("# Just a moment...\n\nEnable JavaScript.")).toEqual([]);
    expect(parseYelpListings("")).toEqual([]);
  });
});

describe("fetchYelpMarket", () => {
  const originalKey = process.env.FIRECRAWL_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    addCost.mockClear();
    if (originalKey === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = originalKey;
  });

  const opts = {
    category: "bakery",
    location: "Portland, OR",
    allowPaidFirecrawlFallback: true,
  };

  function stubScrape(body: unknown, status = 200) {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns the parsed roster and bills the scrape to the run", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    const fetchMock = stubScrape({ data: { markdown: FIXTURE } });

    const market = await fetchYelpMarket("run-1", opts);

    expect(market.unavailable).toBeUndefined();
    expect(market.listings).toHaveLength(10);
    expect(market.summary.rosterSize).toBe(10);
    expect(market.summary.ratingMedian).toBeGreaterThan(0);
    expect(market.searchUrl).toContain("find_desc=bakery");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(addCost).toHaveBeenCalledWith("run-1", 0.01);
  });

  it("skips the call entirely when metered discovery was not approved", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    const fetchMock = stubScrape({ data: { markdown: FIXTURE } });

    const market = await fetchYelpMarket("run-1", {
      ...opts,
      allowPaidFirecrawlFallback: false,
    });

    expect(market.unavailable).toMatch(/not approved/i);
    expect(market.listings).toEqual([]);
    expect(market.summary).toEqual({ rosterSize: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(addCost).not.toHaveBeenCalled();
  });

  it("degrades instead of throwing when Firecrawl rejects the request", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    stubScrape({ error: "forbidden" }, 403);

    const market = await fetchYelpMarket("run-1", opts);

    expect(market.unavailable).toContain("403");
    expect(market.listings).toEqual([]);
    expect(addCost).not.toHaveBeenCalled();
  });

  it("degrades loudly when the page parses to an empty roster", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    stubScrape({ data: { markdown: "# Just a moment...\n" } });

    const market = await fetchYelpMarket("run-1", opts);

    expect(market.unavailable).toMatch(/no listings/i);
    expect(market.listings).toEqual([]);
  });

  it("degrades when no Firecrawl key is configured", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const fetchMock = stubScrape({ data: { markdown: FIXTURE } });

    const market = await fetchYelpMarket("run-1", opts);

    expect(market.unavailable).toContain("FIRECRAWL_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a cost-cap trip stop the run instead of swallowing it", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    stubScrape({ data: { markdown: FIXTURE } });
    addCost.mockRejectedValueOnce(new CostCapExceeded("run-1", 3.01, 3));

    await expect(fetchYelpMarket("run-1", opts)).rejects.toBeInstanceOf(
      CostCapExceeded
    );
  });
});

describe("summarizeMarket", () => {
  const listing = (rating?: number, reviewCount?: number) => ({
    rank: 1,
    name: "x",
    rating,
    reviewCount,
    categories: [],
  });

  it("takes the middle value for an odd roster", () => {
    expect(
      summarizeMarket([listing(4.0, 10), listing(4.8, 30), listing(4.4, 20)])
    ).toEqual({ rosterSize: 3, ratingMedian: 4.4, reviewCountMedian: 20 });
  });

  it("averages the two middle values for an even roster", () => {
    expect(
      summarizeMarket([listing(4.0, 10), listing(4.5, 20)])
    ).toEqual({ rosterSize: 2, ratingMedian: 4.25, reviewCountMedian: 15 });
  });

  it("ignores listings missing a rating rather than scoring them zero", () => {
    expect(
      summarizeMarket([listing(4.0, 10), listing(undefined, undefined), listing(5.0, 20)])
    ).toEqual({ rosterSize: 3, ratingMedian: 4.5, reviewCountMedian: 15 });
  });

  it("reports no medians for an empty roster", () => {
    expect(summarizeMarket([])).toEqual({ rosterSize: 0 });
  });
});
