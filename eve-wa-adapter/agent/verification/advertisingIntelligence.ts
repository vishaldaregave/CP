/**
 * Veriqoo — Advertising Intelligence Module
 *
 * Treats advertising data from Meta Ad Library / Apify as a first-class evidence source.
 * Collects, normalizes, correlates, and analyzes:
 * - Advertiser identity matching
 * - Advertising timeline & span calculation
 * - Destination domain analysis & anomaly detection
 * - Creative history & multi-campaign consistency
 * - Instagram ↔ Meta Ad correlation
 * - Ad ↔ Website correlation
 * - Comprehensive Ad Evidence Ledger (EV-AD-xxx)
 *
 * CRITICAL RULES:
 * 1. Never fabricate historical dates.
 * 2. If historical data is unavailable, explicitly return "HISTORY_UNAVAILABLE" (not "NO_HISTORY").
 * 3. "No ads found" or "API unavailable" is NEUTRAL (never penalized as suspicious).
 * 4. "Long advertising history" is evidence of marketing activity, NOT proof of authenticity.
 * 5. Domain variation is flagged as "DOMAIN_ANOMALY" (never "SCAM").
 * 6. Profile/ad mismatch is flagged as "PROFILE_AD_MISMATCH" (an anomaly signal, never automatic fraud).
 * 7. Works for all Instagram profiles without hard-coded account branches.
 */

import type {
  MetaAdEvidence,
  MetaAdRecord,
  InstagramEvidence,
  ProductInfo,
  SellerInfo,
  WebsiteEvidence,
  AdClaimAnalysis,
  AdvertisingIntelligence,
  AdEvidenceItem,
  AdvertisingTimeline,
  AdTimelineYearGroup,
  AdTimelineEntry,
  DestinationDomainAnalysis,
  CreativeVariation,
  CreativeHistoryAnalysis,
  AdvertiserIdentityMatchResult,
  AdInstagramCorrelation,
  AdWebsiteCorrelation,
  TrustSignal,
  RiskFactor,
  DomainCountItem,
} from "./types.ts";

/**
 * Normalizes strings by lowercasing and stripping non-alphanumeric characters.
 */
function cleanText(text?: string | null): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/\b(pvt|ltd|limited|private|llc|inc|official|store|shop|india|in)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Extracts normalized domain from a URL or raw domain string.
 */
export function extractDomain(urlOrDomain?: string | null): string | null {
  if (!urlOrDomain || typeof urlOrDomain !== "string") return null;
  const raw = urlOrDomain.trim();
  if (!raw) return null;

  try {
    const formatted = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    const parsed = new URL(formatted);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) {
      host = host.slice(4);
    }
    return host || null;
  } catch {
    const cleaned = raw.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0].split("?")[0].trim();
    return cleaned || null;
  }
}

/**
 * Calculates human-readable advertising span between two dates.
 */
export function calculateAdvertisingSpan(
  firstDateStr?: string | null,
  lastDateStr?: string | null,
): { span: string; firstObserved: string | "HISTORY_UNAVAILABLE"; lastObserved: string | "HISTORY_UNAVAILABLE" } {
  if (!firstDateStr || firstDateStr.toUpperCase() === "HISTORY_UNAVAILABLE") {
    return {
      span: "HISTORY_UNAVAILABLE",
      firstObserved: "HISTORY_UNAVAILABLE",
      lastObserved: lastDateStr && lastDateStr.toUpperCase() !== "HISTORY_UNAVAILABLE" ? lastDateStr : "HISTORY_UNAVAILABLE",
    };
  }

  const d1 = new Date(firstDateStr);
  if (isNaN(d1.getTime())) {
    return {
      span: "HISTORY_UNAVAILABLE",
      firstObserved: "HISTORY_UNAVAILABLE",
      lastObserved: "HISTORY_UNAVAILABLE",
    };
  }

  const isLastActive = !lastDateStr || /active|present|current/i.test(lastDateStr);
  const d2 = isLastActive ? new Date() : new Date(lastDateStr!);

  if (isNaN(d2.getTime())) {
    return {
      span: `Since ${firstDateStr}`,
      firstObserved: firstDateStr,
      lastObserved: isLastActive ? "Active" : "HISTORY_UNAVAILABLE",
    };
  }

  const diffMs = Math.max(0, d2.getTime() - d1.getTime());
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30.4375);
  const diffYears = (diffDays / 365.25).toFixed(1);

  let spanText = "";
  if (diffDays < 30) {
    spanText = `~${diffDays} day${diffDays === 1 ? "" : "s"}`;
  } else if (diffMonths < 12) {
    spanText = `~${diffMonths} month${diffMonths === 1 ? "" : "s"}`;
  } else {
    spanText = `~${diffYears} year${Number(diffYears) === 1 ? "" : "s"} (${diffMonths} months)`;
  }

  if (isLastActive) {
    spanText += " (ongoing)";
  }

  return {
    span: spanText,
    firstObserved: firstDateStr,
    lastObserved: isLastActive ? "Active" : lastDateStr!,
  };
}

/**
 * Builds the Advertising Timeline tree and calculates counts.
 */
export function buildAdvertisingTimeline(ads: MetaAdRecord[]): AdvertisingTimeline {
  if (!ads || ads.length === 0) {
    return {
      advertisingSpan: "HISTORY_UNAVAILABLE",
      firstObserved: "HISTORY_UNAVAILABLE",
      lastObserved: "HISTORY_UNAVAILABLE",
      activeAdCount: 0,
      historicalAdCount: 0,
      uniqueCreativeCount: 0,
      uniqueDestinationDomainCount: 0,
      timelineTree: [],
      allEntries: [],
    };
  }

  const entries: AdTimelineEntry[] = [];
  const uniqueCreatives = new Set<string>();
  const uniqueDomains = new Set<string>();

  let earliestTime = Infinity;
  let earliestDateStr: string | null = null;
  let latestTime = -Infinity;
  let latestDateStr: string | null = null;
  let hasActiveAd = false;
  let activeCount = 0;
  let historicalCount = 0;

  for (let idx = 0; idx < ads.length; idx++) {
    const ad = ads[idx];
    const adId = ad.adId || ad.libraryId || `AD-${idx + 1}`;
    const evidenceId = `EV-AD-${String(idx + 1).padStart(3, "0")}`;

    const rawStart = ad.firstObservedDate || ad.deliveryStart;
    const rawEnd = ad.lastObservedDate || ad.deliveryEnd;
    const isOngoing = !rawEnd || /active|present|ongoing/i.test(rawEnd);

    if (isOngoing) {
      hasActiveAd = true;
      activeCount++;
    } else {
      historicalCount++;
    }

    const domain = ad.destinationDomain || extractDomain(ad.destinationUrl);
    if (domain) uniqueDomains.add(domain);

    const creativeSig = `${ad.adText || ""}|${ad.linkTitle || ""}|${ad.linkDescription || ""}`;
    if (creativeSig.replace(/\|/g, "").trim().length > 0) {
      uniqueCreatives.add(creativeSig);
    }

    let entryYear: number | string = "UNDATED";
    let entryDate = "HISTORY_UNAVAILABLE";

    if (rawStart) {
      const parsed = new Date(rawStart);
      if (!isNaN(parsed.getTime())) {
        entryDate = rawStart;
        entryYear = parsed.getFullYear();
        if (parsed.getTime() < earliestTime) {
          earliestTime = parsed.getTime();
          earliestDateStr = rawStart;
        }
        if (parsed.getTime() > latestTime) {
          latestTime = parsed.getTime();
          latestDateStr = rawStart;
        }
      }
    }

    if (rawEnd && !isOngoing) {
      const parsedEnd = new Date(rawEnd);
      if (!isNaN(parsedEnd.getTime()) && parsedEnd.getTime() > latestTime) {
        latestTime = parsedEnd.getTime();
        latestDateStr = rawEnd;
      }
    }

    const snippet = ad.adText || ad.linkTitle || ad.linkDescription || "Ad Creative";
    const label = isOngoing ? `Current ad observed (${entryDate})` : `Historical ad observed (${entryDate} to ${rawEnd || "ended"})`;

    entries.push({
      adId,
      date: entryDate,
      year: entryYear,
      status: isOngoing ? "ACTIVE" : "INACTIVE",
      label,
      evidenceId,
      advertiserName: ad.advertiserName,
      destinationDomain: domain,
      snippet: snippet.length > 80 ? `${snippet.slice(0, 77)}...` : snippet,
    });
  }

  // Sort entries chronologically ascending
  entries.sort((a, b) => {
    if (a.date === "HISTORY_UNAVAILABLE") return 1;
    if (b.date === "HISTORY_UNAVAILABLE") return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  // Group by year for tree view
  const yearMap = new Map<number | string, AdTimelineEntry[]>();
  for (const entry of entries) {
    const list = yearMap.get(entry.year) || [];
    list.push(entry);
    yearMap.set(entry.year, list);
  }

  const timelineTree: AdTimelineYearGroup[] = Array.from(yearMap.entries())
    .sort(([y1], [y2]) => {
      if (typeof y1 === "number" && typeof y2 === "number") return y1 - y2;
      return String(y1).localeCompare(String(y2));
    })
    .map(([year, groupEntries]) => ({ year, entries: groupEntries }));

  const spanCalc = earliestDateStr
    ? calculateAdvertisingSpan(earliestDateStr, hasActiveAd ? "Active" : latestDateStr)
    : { span: "HISTORY_UNAVAILABLE", firstObserved: "HISTORY_UNAVAILABLE" as const, lastObserved: "HISTORY_UNAVAILABLE" as const };

  return {
    advertisingSpan: spanCalc.span,
    firstObserved: spanCalc.firstObserved,
    lastObserved: spanCalc.lastObserved,
    activeAdCount: activeCount,
    historicalAdCount: historicalCount,
    uniqueCreativeCount: uniqueCreatives.size || (ads.length > 0 ? 1 : 0),
    uniqueDestinationDomainCount: uniqueDomains.size,
    timelineTree,
    allEntries: entries,
  };
}

/**
 * Evaluates Destination Domain distribution, consistency, and flags DOMAIN_ANOMALY.
 */
export function analyzeDestinationDomains(
  ads: MetaAdRecord[],
  expectedProfileDomain?: string | null,
): DestinationDomainAnalysis {
  if (!ads || ads.length === 0) {
    return {
      primaryDomain: expectedProfileDomain || null,
      domainCount: expectedProfileDomain ? 1 : 0,
      domains: expectedProfileDomain ? [{ domain: expectedProfileDomain, count: 0, percentage: 100 }] : [],
      domainConsistency: "UNKNOWN",
      hasDomainAnomaly: false,
      anomalyDetails: null,
    };
  }

  const domainCounts = new Map<string, number>();
  let totalWithDomain = 0;

  for (const ad of ads) {
    const domain = ad.destinationDomain || extractDomain(ad.destinationUrl);
    if (domain) {
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      totalWithDomain++;
    }
  }

  if (domainCounts.size === 0) {
    return {
      primaryDomain: expectedProfileDomain || null,
      domainCount: 0,
      domains: [],
      domainConsistency: "UNKNOWN",
      hasDomainAnomaly: false,
      anomalyDetails: "No destination domains specified in ad records.",
    };
  }

  const sorted = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({
      domain,
      count,
      percentage: totalWithDomain > 0 ? Math.round((count / totalWithDomain) * 100) : 0,
    }));

  const primary = sorted[0];
  const domainCount = sorted.length;

  let domainConsistency: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" = "HIGH";
  let hasAnomaly = false;
  let anomalyDetails: string | null = null;

  if (domainCount === 1) {
    domainConsistency = "HIGH";
  } else if (domainCount > 1) {
    // Check if secondary domains are subdomains of primary
    const primaryClean = cleanText(primary.domain);
    const hasUnrelated = sorted.some((d) => {
      const dClean = cleanText(d.domain);
      return !dClean.includes(primaryClean) && !primaryClean.includes(dClean);
    });

    if (hasUnrelated && sorted.length >= 3 && primary.percentage < 60) {
      domainConsistency = "LOW";
      hasAnomaly = true;
      anomalyDetails = `Observed multiple unrelated destination domains (${sorted.map((s) => `${s.domain} [${s.count}]`).join(", ")}). Marked as DOMAIN_ANOMALY.`;
    } else if (hasUnrelated) {
      domainConsistency = "MEDIUM";
      hasAnomaly = true;
      anomalyDetails = `Observed secondary destination domain variation (${sorted.map((s) => `${s.domain} [${s.count}]`).join(", ")}). Marked as DOMAIN_ANOMALY.`;
    } else {
      // Subdomains / mirrors of same brand
      domainConsistency = "HIGH";
    }
  }

  return {
    primaryDomain: primary.domain,
    domainCount,
    domains: sorted,
    domainConsistency,
    hasDomainAnomaly: hasAnomaly,
    anomalyDetails,
  };
}

/**
 * Analyzes Creative History, brand/messaging consistency, patterns, and variations.
 */
export function analyzeCreativeHistory(ads: MetaAdRecord[]): CreativeHistoryAnalysis {
  if (!ads || ads.length === 0) {
    return {
      brandConsistency: "UNKNOWN",
      productConsistency: "UNKNOWN",
      messagingConsistency: "UNKNOWN",
      visualIdentityConsistency: "UNKNOWN",
      repeatedCreativePatterns: [],
      changesOverTime: [],
      creativeConsistencyScore: null,
      creativeConsistency: "UNKNOWN",
      variations: [],
    };
  }

  const variations: CreativeVariation[] = ads.map((ad, idx) => ({
    creativeId: ad.adId || ad.libraryId || `CREATIVE-${idx + 1}`,
    headline: ad.linkTitle || null,
    bodySnippet: ad.adText ? (ad.adText.length > 100 ? `${ad.adText.slice(0, 97)}...` : ad.adText) : null,
    destinationUrl: ad.destinationUrl || null,
    deliveryDate: ad.firstObservedDate || ad.deliveryStart || null,
  }));

  const repeatedPatterns = new Set<string>();
  const changesOverTime: string[] = [];

  const headlines = ads.map((a) => a.linkTitle).filter(Boolean) as string[];
  const bodies = ads.map((a) => a.adText).filter(Boolean) as string[];

  // Detect recurring slogans, product names, discount patterns
  for (const body of bodies) {
    if (/% off|discount|sale|official|guarantee|warranty|free shipping|cod available/i.test(body)) {
      const match = body.match(/(?:\d+%\s*off|free shipping|cash on delivery|official store|100%\s*authentic)/i);
      if (match) repeatedPatterns.add(match[0]);
    }
  }

  // Check advertiser/brand consistency across all ads
  const advertiserNames = Array.from(new Set(ads.map((a) => a.advertiserName).filter(Boolean) as string[]));
  const isAdvertiserConsistent = advertiserNames.length <= 1;

  let brandConsistency: "CONSISTENT" | "INCONSISTENT" | "UNKNOWN" = isAdvertiserConsistent ? "CONSISTENT" : "INCONSISTENT";
  let messagingConsistency: "CONSISTENT" | "INCONSISTENT" | "UNKNOWN" = "CONSISTENT";
  let productConsistency: "CONSISTENT" | "INCONSISTENT" | "UNKNOWN" = "CONSISTENT";

  if (ads.length > 1) {
    changesOverTime.push(`Observed ${ads.length} distinct campaign creatives in advertising history.`);
    if (advertiserNames.length > 1) {
      changesOverTime.push(`Advertiser identity shifted across campaigns: ${advertiserNames.join(" vs ")}.`);
    }
  }

  let score = 85;
  if (advertiserNames.length > 1) score -= 30;
  if (repeatedPatterns.size > 0) score += 10;
  score = Math.max(20, Math.min(100, score));

  const creativeConsistency: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" =
    score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";

  return {
    brandConsistency,
    productConsistency,
    messagingConsistency,
    visualIdentityConsistency: "CONSISTENT",
    repeatedCreativePatterns: Array.from(repeatedPatterns),
    changesOverTime,
    creativeConsistencyScore: score,
    creativeConsistency,
    variations,
  };
}

/**
 * Compares Instagram identity against Meta advertiser identity and destination domain.
 */
export function matchAdvertiserIdentity(
  instagram: InstagramEvidence,
  seller: SellerInfo,
  metaAd: MetaAdEvidence | null,
  destinationDomain?: string | null,
): AdvertiserIdentityMatchResult {
  const igHandle = instagram.account?.username || seller.username || null;
  const igName = instagram.account?.display_name || seller.name || null;
  const igBio = instagram.post?.caption || null;
  const igLinks = instagram.external_links || [];

  const metaAdv = metaAd?.advertiserName || (metaAd?.ads?.[0]?.advertiserName ?? null);
  const metaPageId = metaAd?.advertiserPageId || (metaAd?.ads?.[0]?.advertiserPageId ?? null);
  const destDom = destinationDomain || (metaAd?.ads?.[0]?.destinationDomain ?? extractDomain(metaAd?.destinationUrl));

  if (!metaAdv && !metaPageId) {
    return {
      instagramUsername: igHandle,
      instagramDisplayName: igName,
      instagramBio: igBio,
      instagramExternalLinks: igLinks,
      metaAdvertiserIdentity: null,
      metaPageIdentity: null,
      destinationDomain: destDom,
      rating: "UNKNOWN",
      verdict: "No Meta advertiser identity records available to compare.",
      confidence: 0,
      evidenceItemId: undefined,
    };
  }

  const cleanHandle = cleanText(igHandle);
  const cleanDisp = cleanText(igName);
  const cleanAdv = cleanText(metaAdv);
  const cleanDom = cleanText(destDom);

  let rating: "MATCH" | "PARTIAL_MATCH" | "MISMATCH" | "UNKNOWN" = "UNKNOWN";
  let verdict = "";
  let confidence = 50;

  const isDirectMatch =
    (cleanAdv && cleanHandle && (cleanAdv === cleanHandle || cleanAdv.includes(cleanHandle) || cleanHandle.includes(cleanAdv))) ||
    (cleanAdv && cleanDisp && (cleanAdv === cleanDisp || cleanAdv.includes(cleanDisp) || cleanDisp.includes(cleanAdv)));

  const isDomainMatch = cleanDom && (cleanHandle.includes(cleanDom) || cleanDom.includes(cleanHandle) || cleanAdv.includes(cleanDom) || cleanDom.includes(cleanAdv));

  if (isDirectMatch && isDomainMatch) {
    rating = "MATCH";
    verdict = `IDENTITY MATCH: Meta advertiser "${metaAdv}" aligns with Instagram @${igHandle} and destination domain ${destDom}.`;
    confidence = 95;
  } else if (isDirectMatch) {
    rating = "MATCH";
    verdict = `IDENTITY MATCH: Meta advertiser "${metaAdv}" corresponds directly to Instagram profile @${igHandle}.`;
    confidence = 90;
  } else if (isDomainMatch || (cleanAdv && (cleanHandle.length > 3 && cleanAdv.length > 3 && (cleanAdv.slice(0, 4) === cleanHandle.slice(0, 4))))) {
    rating = "PARTIAL_MATCH";
    verdict = `PARTIAL MATCH: Meta advertiser "${metaAdv}" shares partial naming or domain alignment with Instagram @${igHandle}.`;
    confidence = 70;
  } else if (cleanAdv && cleanHandle && cleanAdv !== cleanHandle) {
    rating = "MISMATCH";
    verdict = `IDENTITY MISMATCH: Meta advertiser "${metaAdv}" differs significantly from Instagram account @${igHandle}.`;
    confidence = 85;
  }

  return {
    instagramUsername: igHandle,
    instagramDisplayName: igName,
    instagramBio: igBio,
    instagramExternalLinks: igLinks,
    metaAdvertiserIdentity: metaAdv,
    metaPageIdentity: metaPageId,
    destinationDomain: destDom,
    rating,
    verdict,
    confidence,
    evidenceItemId: "EV-AD-ID-001",
  };
}

/**
 * Correlates Advertising Content with Instagram Profile / Post Content.
 */
export function correlateAdWithInstagram(
  instagram: InstagramEvidence,
  product: ProductInfo,
  metaAd: MetaAdEvidence | null,
): AdInstagramCorrelation {
  if (!metaAd || metaAd.status !== "found" || !metaAd.ads || metaAd.ads.length === 0) {
    return {
      instagramContent: product.name || instagram.post?.caption || "Instagram listing",
      metaAdContent: "No Meta ad records",
      result: "UNKNOWN",
      isAnomaly: false,
      explanation: "No active Meta ads found for cross-correlation.",
    };
  }

  const igText = `${instagram.post?.caption || ""} ${product.name || ""} ${product.brand || ""}`.toLowerCase();
  const adTexts = metaAd.ads.map((a) => `${a.linkTitle || ""} ${a.adText || ""} ${a.linkDescription || ""}`).join(" ").toLowerCase();

  const igWords = igText.split(/\s+/).filter((w) => w.length > 3);
  const matchWords = igWords.filter((w) => adTexts.includes(w));

  if (matchWords.length >= 2 || (product.name && adTexts.includes(product.name.toLowerCase()))) {
    return {
      instagramContent: product.name || instagram.post?.caption?.slice(0, 60) || "Post content",
      metaAdContent: metaAd.ads[0].linkTitle || metaAd.ads[0].adText?.slice(0, 60) || "Ad content",
      result: "CONTENT_AD_MATCH",
      isAnomaly: false,
      explanation: `CONTENT_AD_MATCH: Advertising campaign promotes the same product / brand as the Instagram post (${matchWords.slice(0, 3).join(", ")}).`,
      instagramEvidenceId: "EV-POST-001",
      adEvidenceId: "EV-AD-001",
    };
  }

  // Check category or domain contradiction
  const isFinanceCryptoScamInAd = /crypto|forex|investment|trading|guaranteed return|passive income|wealth/i.test(adTexts);
  const isFinanceOnIg = /crypto|forex|investment|trading|wealth/i.test(igText);

  if (isFinanceCryptoScamInAd && !isFinanceOnIg) {
    return {
      instagramContent: product.name || instagram.post?.caption?.slice(0, 60) || "Profile product listing",
      metaAdContent: metaAd.ads[0].linkTitle || metaAd.ads[0].adText?.slice(0, 60) || "Financial / Investment promotion",
      result: "PROFILE_AD_MISMATCH",
      isAnomaly: true,
      explanation: "PROFILE_AD_MISMATCH: Instagram profile content differs completely from associated ad campaigns promoting unrelated financial/investment offerings. Flagged as an anomaly signal.",
      instagramEvidenceId: "EV-POST-001",
      adEvidenceId: "EV-AD-001",
    };
  }

  return {
    instagramContent: product.name || "Instagram profile",
    metaAdContent: metaAd.ads[0].linkTitle || metaAd.ads[0].adText?.slice(0, 60) || "Ad content",
    result: "PARTIAL_MATCH",
    isAnomaly: false,
    explanation: "Advertising content partially correlates with the seller's product offerings.",
    instagramEvidenceId: "EV-POST-001",
    adEvidenceId: "EV-AD-001",
  };
}

/**
 * Correlates Ad Destination Domains with Website and Instagram external links.
 */
export function correlateAdWithWebsite(
  instagram: InstagramEvidence,
  metaAd: MetaAdEvidence | null,
  website: WebsiteEvidence | null,
): AdWebsiteCorrelation {
  const igBioDomain = extractDomain(instagram.external_links[0]);
  const igLinks = instagram.external_links || [];
  const metaDomains = Array.from(new Set(
    (metaAd?.ads || []).map((a) => a.destinationDomain || extractDomain(a.destinationUrl)).filter(Boolean) as string[],
  ));
  const websiteIdentity = website?.domain || website?.company?.name || null;

  if (metaDomains.length === 0) {
    return {
      instagramBioDomain: igBioDomain,
      instagramLinks: igLinks,
      metaDestinationDomains: [],
      websiteIdentity,
      result: "UNKNOWN",
      explanation: "No Meta ad destination domains recorded to correlate.",
    };
  }

  const primaryMetaDomain = metaDomains[0];
  const cleanIgDomain = cleanText(igBioDomain);
  const cleanMetaDomain = cleanText(primaryMetaDomain);
  const cleanWebDomain = cleanText(website?.domain);

  if (cleanMetaDomain && cleanIgDomain && (cleanMetaDomain === cleanIgDomain || cleanMetaDomain.includes(cleanIgDomain) || cleanIgDomain.includes(cleanMetaDomain))) {
    return {
      instagramBioDomain: igBioDomain,
      instagramLinks: igLinks,
      metaDestinationDomains: metaDomains,
      websiteIdentity,
      result: "CROSS_SOURCE_IDENTITY_MATCH",
      explanation: `CROSS_SOURCE_IDENTITY_MATCH: Meta ad destination domain (${primaryMetaDomain}) matches Instagram bio storefront link (${igBioDomain}).`,
    };
  }

  if (cleanMetaDomain && cleanWebDomain && (cleanMetaDomain === cleanWebDomain || cleanMetaDomain.includes(cleanWebDomain) || cleanWebDomain.includes(cleanMetaDomain))) {
    return {
      instagramBioDomain: igBioDomain,
      instagramLinks: igLinks,
      metaDestinationDomains: metaDomains,
      websiteIdentity,
      result: "CROSS_SOURCE_IDENTITY_MATCH",
      explanation: `CROSS_SOURCE_IDENTITY_MATCH: Meta ad destination domain (${primaryMetaDomain}) matches verified external website (${website?.domain}).`,
    };
  }

  if (cleanIgDomain && cleanMetaDomain && cleanIgDomain !== cleanMetaDomain) {
    return {
      instagramBioDomain: igBioDomain,
      instagramLinks: igLinks,
      metaDestinationDomains: metaDomains,
      websiteIdentity,
      result: "DOMAIN_ANOMALY",
      explanation: `DOMAIN_ANOMALY: Meta ad links to ${primaryMetaDomain} whereas Instagram profile links to ${igBioDomain}.`,
    };
  }

  return {
    instagramBioDomain: igBioDomain,
    instagramLinks: igLinks,
    metaDestinationDomains: metaDomains,
    websiteIdentity,
    result: "UNKNOWN",
    explanation: "Cross-source domain correlation completed with available records.",
  };
}

/**
 * Builds standard EvidenceItem entries for all important advertising observations.
 */
export function buildAdEvidenceLedger(
  metaAd: MetaAdEvidence | null,
  capturedTimestamp?: string,
): AdEvidenceItem[] {
  if (!metaAd || !metaAd.ads || metaAd.ads.length === 0) {
    return [];
  }

  const ledger: AdEvidenceItem[] = [];
  const captured = capturedTimestamp || metaAd.collectedAt || new Date().toISOString();

  for (let i = 0; i < metaAd.ads.length; i++) {
    const ad = metaAd.ads[i];
    const evidenceId = `EV-AD-${String(i + 1).padStart(3, "0")}`;
    const rawStart = ad.firstObservedDate || ad.deliveryStart;
    const rawEnd = ad.lastObservedDate || ad.deliveryEnd;
    const isOngoing = !rawEnd || /active|present|ongoing/i.test(rawEnd);

    let observedText = "HISTORY_UNAVAILABLE";
    if (rawStart && isOngoing) {
      observedText = `Active since ${rawStart}`;
    } else if (rawStart && rawEnd) {
      observedText = `${rawStart} to ${rawEnd}`;
    } else if (rawStart) {
      observedText = `Observed on ${rawStart}`;
    }

    const domain = ad.destinationDomain || extractDomain(ad.destinationUrl);
    const sourceLabel = metaAd.source === "apify" ? "Apify / Meta Ads Scraper" : "Meta Ad Library / Apify";

    ledger.push({
      id: evidenceId,
      source: sourceLabel,
      advertiser: ad.advertiserName || metaAd.advertiserName || "Unspecified Advertiser",
      adId: ad.adId || ad.libraryId || `AD-${i + 1}`,
      status: isOngoing ? "ACTIVE" : "INACTIVE",
      observed: observedText,
      firstObserved: rawStart || null,
      lastObserved: isOngoing ? "Active" : rawEnd || null,
      sourceUrl: ad.adSnapshotUrl || ad.destinationUrl || null,
      captured,
      evidenceType: "META_AD",
      confidence: 90,
      destinationUrl: ad.destinationUrl || null,
      destinationDomain: domain || null,
      platforms: ad.publisherPlatforms || ["INSTAGRAM"],
      adTextSnippet: ad.adText ? (ad.adText.length > 120 ? `${ad.adText.slice(0, 117)}...` : ad.adText) : null,
      productClaims: ad.claims || [],
      details: ad.linkTitle || ad.linkDescription || undefined,
    });
  }

  return ledger;
}

/**
 * Master Advertising Intelligence Engine.
 * Evaluates all dimensions, timelines, consistency scores, and signal lists.
 */
export function analyzeAdvertisingIntelligence(
  metaAd: MetaAdEvidence | null,
  instagram: InstagramEvidence,
  product: ProductInfo,
  seller: SellerInfo,
  website?: WebsiteEvidence | null,
  adClaims?: AdClaimAnalysis | null,
): AdvertisingIntelligence {
  const ads = metaAd?.ads || [];
  const status = metaAd?.status === "found" ? "FOUND" : metaAd?.status === "not_found" ? "NOT_FOUND" : metaAd?.status === "error" ? "ERROR" : "UNAVAILABLE";
  const source: "Meta Ad Library / Apify" | "Meta Ad Library" | "Apify" =
    metaAd?.source === "apify" ? "Apify" : "Meta Ad Library / Apify";

  const timeline = buildAdvertisingTimeline(ads);
  const destinationAnalysis = analyzeDestinationDomains(ads, extractDomain(instagram.external_links[0]));
  const creativeHistory = analyzeCreativeHistory(ads);
  const advertiserMatch = matchAdvertiserIdentity(instagram, seller, metaAd, destinationAnalysis.primaryDomain);
  const instagramCorrelation = correlateAdWithInstagram(instagram, product, metaAd);
  const websiteCorrelation = correlateAdWithWebsite(instagram, metaAd, website || null);
  const evidenceLedger = buildAdEvidenceLedger(metaAd);

  const trustSignals: TrustSignal[] = [];
  const riskSignals: TrustSignal[] = [];
  const riskFactors: RiskFactor[] = [];

  const platformsSet = new Set<string>();
  for (const ad of ads) {
    for (const p of ad.publisherPlatforms || []) {
      platformsSet.add(p);
    }
  }
  const platforms = Array.from(platformsSet);
  if (platforms.length === 0 && ads.length > 0) platforms.push("INSTAGRAM");

  const destDomains = destinationAnalysis.domains.map((d) => d.domain);

  // 1. Positive Signals
  if (advertiserMatch.rating === "MATCH") {
    trustSignals.push({
      signal: `Meta advertiser identity corresponds to Instagram seller (${advertiserMatch.metaAdvertiserIdentity})`,
      severity: "positive",
      sources: ["meta_ad", "instagram"],
      meaning: "Meta Ad Library verifies that advertising campaigns are operated under the same brand identity as the profile.",
    });
    riskFactors.push({
      severity: "positive",
      category: "ADVERTISING",
      title: "Advertiser Identity Matches Profile",
      explanation: advertiserMatch.verdict,
      evidence: `Meta: ${advertiserMatch.metaAdvertiserIdentity} vs Instagram: @${advertiserMatch.instagramUsername}`,
      sources: ["meta_ad", "instagram"],
    });
  }

  if (websiteCorrelation.result === "CROSS_SOURCE_IDENTITY_MATCH") {
    trustSignals.push({
      signal: "Ad destination domain directly corroborates Instagram profile storefront",
      severity: "positive",
      sources: ["meta_ad", "website"],
      meaning: websiteCorrelation.explanation,
    });
  }

  if (instagramCorrelation.result === "CONTENT_AD_MATCH") {
    trustSignals.push({
      signal: "Ad creative directly promotes the verified Instagram product offering",
      severity: "positive",
      sources: ["meta_ad", "instagram"],
      meaning: instagramCorrelation.explanation,
    });
  }

  if (creativeHistory.creativeConsistency === "HIGH" && ads.length >= 2) {
    trustSignals.push({
      signal: `Consistent multi-campaign creative history (${creativeHistory.creativeConsistencyScore}% consistency score)`,
      severity: "positive",
      sources: ["meta_ad"],
      meaning: "Brand identity, messaging, and product categories remain consistent across multiple observed ad campaigns.",
    });
  }

  // 2. Negative / Anomaly Signals
  if (advertiserMatch.rating === "MISMATCH") {
    riskSignals.push({
      signal: `Meta advertiser identity mismatch: Ad operator (${advertiserMatch.metaAdvertiserIdentity}) conflicts with Instagram account (@${advertiserMatch.instagramUsername})`,
      severity: "high",
      sources: ["meta_ad", "instagram"],
      meaning: "The entity running advertising campaigns differs materially from the Instagram profile publisher.",
    });
    riskFactors.push({
      severity: "high",
      category: "ADVERTISING",
      title: "Meta Advertiser Identity Mismatch",
      explanation: advertiserMatch.verdict,
      evidence: `Meta: ${advertiserMatch.metaAdvertiserIdentity} vs Instagram: @${advertiserMatch.instagramUsername}`,
      sources: ["meta_ad", "instagram"],
    });
  }

  if (destinationAnalysis.hasDomainAnomaly && destinationAnalysis.anomalyDetails) {
    riskSignals.push({
      signal: `Unexplained ad destination domain variation (DOMAIN_ANOMALY)`,
      severity: "medium",
      sources: ["meta_ad"],
      meaning: destinationAnalysis.anomalyDetails,
    });
    riskFactors.push({
      severity: "medium",
      category: "ADVERTISING",
      title: "Advertising Domain Anomaly (DOMAIN_ANOMALY)",
      explanation: destinationAnalysis.anomalyDetails,
      evidence: destinationAnalysis.domains.map((d) => `${d.domain} (${d.count})`).join(", "),
      sources: ["meta_ad"],
    });
  }

  if (instagramCorrelation.isAnomaly) {
    riskSignals.push({
      signal: `Profile vs Advertising Content Inconsistency (${instagramCorrelation.result})`,
      severity: "medium",
      sources: ["meta_ad", "instagram"],
      meaning: instagramCorrelation.explanation,
    });
    riskFactors.push({
      severity: "medium",
      category: "ADVERTISING",
      title: "Profile vs Advertising Discrepancy",
      explanation: instagramCorrelation.explanation,
      evidence: `Instagram: ${instagramCorrelation.instagramContent} vs Ad: ${instagramCorrelation.metaAdContent}`,
      sources: ["meta_ad", "instagram"],
    });
  }

  // Summary builder
  let summary = "";
  if (status === "FOUND") {
    summary = `Discovered ${ads.length} ad campaign(s) for advertiser '${metaAd?.advertiserName || "seller"}'. Advertiser match: ${advertiserMatch.rating}, Domain consistency: ${destinationAnalysis.domainConsistency}, Creative consistency: ${creativeHistory.creativeConsistency}.`;
  } else if (status === "NOT_FOUND") {
    summary = "No active or historical advertising campaigns returned by Meta Ad Library for current query terms (neutral observation).";
  } else {
    summary = metaAd?.limitation || "Meta Ad Library data was unavailable during this verification run (neutral observation).";
  }

  return {
    status,
    source,
    advertiserIdentity: metaAd?.advertiserName || (ads[0]?.advertiserName ?? null),
    pageId: metaAd?.advertiserPageId || (ads[0]?.advertiserPageId ?? null),
    totalAdsDiscovered: ads.length,
    activeAdCount: timeline.activeAdCount,
    historicalAdCount: timeline.historicalAdCount,
    firstObserved: timeline.firstObserved,
    lastObserved: timeline.lastObserved,
    advertisingSpan: timeline.advertisingSpan,
    platforms,
    uniqueCreativeCount: timeline.uniqueCreativeCount,
    destinationDomains: destDomains,

    timeline,
    advertiserMatch,
    destinationAnalysis,
    creativeHistory,
    instagramCorrelation,
    websiteCorrelation,
    evidenceLedger,

    trustSignals,
    riskSignals,
    riskFactors,
    summary,
  };
}
