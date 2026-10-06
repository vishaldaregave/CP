import type {
  MetaAdEvidence,
  MetaAdRecord,
  MetaAdCollectionInput,
  InstagramEvidence,
  ProductInfo,
  SellerInfo,
} from "./types.ts";
import { extractDomain } from "./advertisingIntelligence.ts";

function cleanHandle(handle?: string | null): string | null {
  if (!handle) return null;
  const cleaned = handle.replace(/^@+/, "").trim();
  return cleaned.length > 2 ? cleaned : null;
}

/**
 * Normalizes an ad record from either Meta Graph API, Apify actor output, or raw dataset item.
 */
export function normalizeApifyOrMetaRecord(raw: any, sourceTag?: "meta_ad_library" | "apify" | "meta_ad_library_apify"): MetaAdRecord {
  const libraryId = String(raw.id || raw.ad_id || raw.adId || raw.ad_archive_id || raw.archive_id || `AD-${Date.now()}`);
  const advertiserName = raw.page_name || raw.pageName || raw.advertiser_name || raw.advertiserName || null;
  const advertiserPageId = raw.page_id ? String(raw.page_id) : raw.pageId ? String(raw.pageId) : null;

  // Platforms
  let publisherPlatforms: string[] = ["INSTAGRAM"];
  if (Array.isArray(raw.publisher_platforms) && raw.publisher_platforms.length > 0) {
    publisherPlatforms = raw.publisher_platforms;
  } else if (Array.isArray(raw.publisherPlatforms) && raw.publisherPlatforms.length > 0) {
    publisherPlatforms = raw.publisherPlatforms;
  }

  // Delivery start / First observed date (never fabricate)
  let deliveryStart: string | null = null;
  const rawStart = raw.ad_delivery_start_time || raw.startDate || raw.start_date || raw.deliveryStart || raw.firstObservedDate;
  if (rawStart) {
    deliveryStart = String(rawStart).split("T")[0];
  }

  // Delivery end / Last observed date (never fabricate)
  let deliveryEnd: string | null = "Active";
  const rawEnd = raw.ad_delivery_stop_time || raw.endDate || raw.end_date || raw.deliveryEnd || raw.lastObservedDate;
  if (rawEnd) {
    deliveryEnd = String(rawEnd).split("T")[0];
  } else if (raw.is_active === false || raw.isActive === false || raw.status === "INACTIVE") {
    deliveryEnd = deliveryStart || "Inactive";
  }

  // Ad text & titles
  const bodies = raw.ad_creative_bodies || (raw.body ? [raw.body] : []) || (raw.adText ? [raw.adText] : []);
  const adText = Array.isArray(bodies) ? bodies.filter(Boolean).join("\n") || null : String(bodies || "");
  const titles = raw.ad_creative_link_titles || (raw.title ? [raw.title] : []) || (raw.linkTitle ? [raw.linkTitle] : []);
  const linkTitle = Array.isArray(titles) ? titles[0] || null : String(titles || "");
  const descs = raw.ad_creative_link_descriptions || (raw.description ? [raw.description] : []) || (raw.linkDescription ? [raw.linkDescription] : []);
  const linkDescription = Array.isArray(descs) ? descs[0] || null : String(descs || "");

  // Snapshot & Destination URLs
  const adSnapshotUrl = raw.ad_snapshot_url || raw.snapshot_url || raw.snapshotUrl || raw.adSnapshotUrl || null;
  const destinationUrl = (Array.isArray(raw.ad_creative_link_captions) && raw.ad_creative_link_captions[0]) ||
    raw.destinationUrl || raw.destination_url || raw.link_url || raw.linkUrl || raw.link || null;
  const destinationDomain = extractDomain(destinationUrl);

  const isOngoing = !deliveryEnd || /active|ongoing|present/i.test(deliveryEnd);
  const adStatus: "ACTIVE" | "INACTIVE" | "PAUSED" | "UNKNOWN" =
    raw.status === "PAUSED" ? "PAUSED" : isOngoing ? "ACTIVE" : "INACTIVE";

  const claims: string[] = [];
  if (adText && /100%|guarantee|warranty|certified|fda|fssai|iso|discount|sale/i.test(adText)) {
    const matched = adText.match(/(?:100%\s*[a-z]+|\d+%\s*off|money back guarantee|certified [a-z0-9]+)/gi);
    if (matched) {
      for (const m of matched) claims.push(m);
    }
  }

  return {
    libraryId,
    adId: libraryId,
    advertiserName,
    advertiserPageId,
    publisherPlatforms,
    deliveryStart,
    deliveryEnd,
    adText: adText || null,
    linkTitle: linkTitle || null,
    linkDescription: linkDescription || null,
    adSnapshotUrl,
    destinationUrl: destinationUrl || null,
    destinationDomain,
    adStatus,
    firstObservedDate: deliveryStart,
    lastObservedDate: isOngoing ? null : deliveryEnd,
    claims,
    evidenceSource: sourceTag || "meta_ad_library",
  };
}

/**
 * Searches the official Meta Ad Library API or Apify Meta Ads Scraper for active or historical advertising records.
 *
 * Implements priority-based query strategy:
 * 1. Known Meta/Facebook Page ID if already available
 * 2. Seller display name
 * 3. Instagram handle without @
 * 4. Brand name
 * 5. Product name
 *
 * NOTE: Never logs the access token.
 */
import { ApifyService } from "./apify/index.ts";

export async function collectMetaAdEvidence(
  inputOrEvidence: MetaAdCollectionInput | InstagramEvidence,
  product?: ProductInfo,
  seller?: SellerInfo,
): Promise<MetaAdEvidence> {
  const token = process.env.META_AD_LIBRARY_ACCESS_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
  const country = process.env.META_AD_LIBRARY_COUNTRY || "IN";
  const collectedAt = new Date().toISOString();

  // Normalize input fields
  let instagramUrl = "";
  let instagramHandle: string | null = null;
  let sellerName: string | null = null;
  let brandName: string | null = null;
  let productName: string | null = null;
  let pageId: string | null = null;

  if ("source" in inputOrEvidence) {
    instagramUrl = inputOrEvidence.source?.url || "";
    instagramHandle = cleanHandle(inputOrEvidence.account?.username);
    sellerName = seller?.name || inputOrEvidence.seller?.name || inputOrEvidence.account?.display_name || null;
    brandName = product?.brand || inputOrEvidence.product?.brand || null;
    productName = product?.name || inputOrEvidence.product?.name || null;
  } else {
    instagramUrl = inputOrEvidence.instagramUrl || "";
    instagramHandle = cleanHandle(inputOrEvidence.instagramHandle);
    sellerName = inputOrEvidence.sellerName || seller?.name || null;
    brandName = inputOrEvidence.brand || product?.brand || null;
    productName = inputOrEvidence.product || product?.name || null;
    pageId = inputOrEvidence.pageId || null;
  }

  // Build candidate search terms with strict prioritization
  const candidateTerms: string[] = [];
  if (pageId && pageId.trim().length > 0) {
    candidateTerms.push(pageId.trim());
  }
  if (sellerName && sellerName.trim().length > 2) {
    const cleanSeller = sellerName.trim();
    if (!candidateTerms.includes(cleanSeller)) candidateTerms.push(cleanSeller);
  }
  if (instagramHandle && !candidateTerms.includes(instagramHandle)) {
    candidateTerms.push(instagramHandle);
  }
  if (brandName && brandName.trim().length > 2 && !candidateTerms.includes(brandName.trim())) {
    candidateTerms.push(brandName.trim());
  }
  if (productName && productName.trim().length > 3 && !candidateTerms.includes(productName.trim())) {
    if (candidateTerms.length < 3) {
      candidateTerms.push(productName.trim());
    }
  }

  if (!process.env.APIFY_API_TOKEN || !process.env.APIFY_API_TOKEN.trim()) {
    return {
      status: "unavailable",
      queryTerms: candidateTerms,
      country,
      ads: [],
      totalFound: 0,
      source: "meta_ad_library",
      collectedAt,
      error: "No Apify API token configured",
      limitation: "Apify API access token is missing in .env",
      evidenceSource: "Apify Scraper",
    };
  }

  if (candidateTerms.length === 0) {
    return {
      status: "not_found",
      queryTerms: [],
      country,
      ads: [],
      totalFound: 0,
      source: "meta_ad_library",
      collectedAt,
      limitation: "No matching ads were returned because no search terms were generated.",
      evidenceSource: "Apify Scraper",
    };
  }

  const allFoundAds: MetaAdRecord[] = [];
  let lastApiError: string | null = null;
  let hadSuccessfulQuery = false;

  try {
    const apifyService = new ApifyService();
    console.log(`[MetaAdEvidence] Calling Apify Actor with term:`, candidateTerms[0]);
    
    // We use the first highest-priority term as query for the scraper
    const normalizedAds = await apifyService.runMetaAdsScraperSync({
        query: candidateTerms[0],
        maxItems: 10,
        country
    });

    if (normalizedAds && normalizedAds.length > 0) {
      hadSuccessfulQuery = true;
      const data = (await res.json()) as { data?: any[] };

      if (data.data && data.data.length > 0) {
        for (const item of data.data) {
          if (item.id && !seenAdIds.has(String(item.id))) {
            seenAdIds.add(String(item.id));
            allFoundAds.push(normalizeApifyOrMetaRecord(item, "meta_ad_library"));
          }
        }
      }
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastApiError = isAbort ? "Request timed out" : err instanceof Error ? err.message : String(err);
      console.warn(`[MetaAdEvidence] Page ID request for "${pid}" failed: ${lastApiError}`);
    }
  }

  // 2. Search by Terms (Seller display name -> Handle -> Brand -> Product)
  for (const term of candidateTerms) {
    if (allFoundAds.length >= 10) break;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const url = new URL(`https://graph.facebook.com/${apiVersion}/ads_archive`);
      url.searchParams.set("access_token", token);
      url.searchParams.set("ad_reached_countries", `["${country}"]`);
      url.searchParams.set("ad_type", "ALL");
      url.searchParams.set("search_terms", term);
      url.searchParams.set("publisher_platforms", '["INSTAGRAM"]');
      url.searchParams.set("limit", "10");
      url.searchParams.set(
        "fields",
        "id,page_id,page_name,ad_creation_time,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,ad_snapshot_url,publisher_platforms",
      );

      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = (errJson as { error?: { message?: string; code?: number } })?.error?.message || `HTTP ${res.status}`;
        lastApiError = errMsg;
        if (/commercial|coverage|permission|country|ad_type/i.test(errMsg)) {
          commercialCoverageLimitation = "Meta's official Ad Library API did not provide the requested commercial-ad coverage for this country/category.";
        }
        console.warn(`[MetaAdEvidence] Query for "${term}" returned ${res.status}: ${errMsg}`);
        continue;
      }

      hadSuccessfulQuery = true;
      const data = (await res.json()) as { data?: any[] };

      if (data.data && data.data.length > 0) {
        for (const item of data.data) {
          if (item.id && !seenAdIds.has(String(item.id))) {
            seenAdIds.add(String(item.id));
            allFoundAds.push(normalizeApifyOrMetaRecord(item, "meta_ad_library"));
          }
        }
      }
    }
  } catch (err: any) {
    lastApiError = err?.message || String(err);
    console.warn(`[MetaAdEvidence] Apify Scraper failed: ${lastApiError}`);
  }

  if (allFoundAds.length > 0) {
    const topAd = allFoundAds[0];
    return {
      status: "found",
      queryTerms: candidateTerms,
      country,
      ads: allFoundAds,
      totalFound: allFoundAds.length,
      source: "meta_ad_library",
      collectedAt,
      // Backward compatibility fields expected by formatting / risk engine layers
      libraryId: topAd.external_ad_id,
      advertiserName: topAd.advertiser.name || undefined,
      advertiserPageId: topAd.advertiser.page_id || undefined,
      publisherPlatforms: topAd.platforms,
      deliveryStart: topAd.delivery.start_date || undefined,
      deliveryEnd: topAd.delivery.end_date || undefined,
      adText: topAd.creative.primary_text || undefined,
      linkTitle: topAd.creative.headline || undefined,
      linkDescription: topAd.creative.description || undefined,
      adSnapshotUrl: topAd.source.snapshot_url || undefined,
      destinationUrl: topAd.creative.link_url || undefined,
      evidenceSource: "Apify Scraper",
    };
  }

  if (!hadSuccessfulQuery && lastApiError) {
    return {
      status: "error",
      queryTerms: candidateTerms,
      country,
      ads: [],
      totalFound: 0,
      source: "meta_ad_library",
      collectedAt,
      error: lastApiError,
      limitation: "Apify Scraper encountered an error or was unavailable.",
      evidenceSource: "Apify Scraper",
    };
  }

  return {
    status: "not_found",
    queryTerms: candidateTerms,
    country,
    ads: [],
    totalFound: 0,
    source: "meta_ad_library",
    collectedAt,
    limitation: "No matching ads were returned by the Apify Scraper for the current queries.",
    evidenceSource: "Apify Scraper",
  };
}
