export const MARKET_DIRECTORY_HOSTS = [
  "yelp.com",
  "angi.com",
  "homeadvisor.com",
  "thumbtack.com",
  "facebook.com",
  "instagram.com",
  "bbb.org",
  "mapquest.com",
  "reddit.com",
  "wikipedia.org",
  "yellowpages.com",
  "nextdoor.com",
  "tripadvisor.com",
  "opentable.com",
  "doordash.com",
  "ubereats.com",
  "grubhub.com",
  "google.com",
  "youtube.com",
  "pinterest.com",
  "tiktok.com",
  "indeed.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "linkedin.com",
  "monster.com",
  "simplyhired.com",
  "careerbuilder.com",
  "craigslist.org",
] as const;

export function isBlockedMarketHost(rawUrlOrHost: string): boolean {
  let host: string;
  try {
    host = new URL(
      /^https?:\/\//i.test(rawUrlOrHost) ? rawUrlOrHost : `https://${rawUrlOrHost}`,
    ).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return true;
  }
  return MARKET_DIRECTORY_HOSTS.some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`),
  );
}
