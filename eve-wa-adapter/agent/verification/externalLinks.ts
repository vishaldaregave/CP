import type { ExternalProfileLink, ProfileLinkPlatform } from "./types.ts";

/**
 * Categorizes external URL into known platforms.
 */
export function identifyPlatform(url: string): ProfileLinkPlatform {
  const lower = url.toLowerCase();
  if (lower.includes("github.com") || lower.includes("github.io")) return "github";
  if (lower.includes("linkedin.com")) return "linkedin";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "twitter_x";
  if (lower.includes("linktr.ee") || lower.includes("lnk.bio") || lower.includes("beacons.ai") || lower.includes("bento.me")) return "linktree";
  if (lower.includes("mailto:") || lower.includes("@")) return "contact_email";
  if (lower.includes("tel:") || lower.includes("wa.me") || lower.includes("whatsapp.com")) return "contact_phone";
  if (lower.includes("portfolio") || lower.includes(".dev") || lower.includes(".me")) return "portfolio";
  if (lower.includes("shop") || lower.includes("store") || lower.includes("cart") || lower.includes("buy")) return "company_website";
  return "personal_website";
}

/**
 * Extracts clean domain from URL.
 */
export function extractProfileDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0].toLowerCase();
  }
}

/**
 * Normalizes URL string.
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    parsed.hash = "";
    // strip tracking params
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");
    parsed.searchParams.delete("igshid");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

/**
 * Extracts and classifies all external profile links from bio, page metadata, and external sources.
 */
export function extractExternalLinks(
  rawLinks: string[],
  source: string = "Instagram Profile Bio",
): ExternalProfileLink[] {
  const links: ExternalProfileLink[] = [];
  let linkSeq = 1;

  const seen = new Set<string>();

  for (const raw of rawLinks) {
    if (!raw || typeof raw !== "string" || !raw.trim()) continue;
    const clean = raw.trim();
    if (clean.includes("instagram.com") || clean.includes("instagr.am")) continue;

    const norm = normalizeUrl(clean);
    if (seen.has(norm.toLowerCase())) continue;
    seen.add(norm.toLowerCase());

    const domain = extractProfileDomain(norm);
    const platform = identifyPlatform(norm);
    const evidenceId = `EV-LINK-${String(linkSeq++).padStart(3, "0")}`;

    links.push({
      originalUrl: clean,
      normalizedUrl: norm,
      domain,
      platform,
      source,
      evidenceId,
      accessible: true,
    });
  }

  return links;
}
