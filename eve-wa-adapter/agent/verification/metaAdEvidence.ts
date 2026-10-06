import type {
  MetaAdEvidence,
  MetaAdRecord,
  MetaAdCollectionInput,
  InstagramEvidence,
  ProductInfo,
  SellerInfo,
} from "./types.ts";

function cleanHandle(handle?: string | null): string | null {
  if (!handle) return null;
  const cleaned = handle.replace(/^@+/, "").trim();
  return cleaned.length > 2 ? cleaned : null;
}

/**
 * Searches the official Meta Ad Library API for active or historical advertising records
 * associated with the seller identity, page, brand, or product.
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
export async function collectMetaAdEvidence(
  inputOrEvidence: MetaAdCollectionInput | InstagramEvidence,
  product?: ProductInfo,
  seller?: SellerInfo,
): Promise<MetaAdEvidence> {
  const token = process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  const country = process.env.META_AD_LIBRARY_COUNTRY || "IN";
  const apiVersion = process.env.META_API_VERSION || "v20.0";
  const collectedAt = new Date().toISOString();

  // Normalize input fields
  let instagramUrl = "";
  let instagramHandle: string | null = null;
  let sellerName: string | null = null;
  let brandName: string | null = null;
  let productName: string | null = null;
  let pageId: string | null = null;

  if ("source" in inputOrEvidence) {
    // InstagramEvidence object passed
    instagramUrl = inputOrEvidence.source?.url || "";
    instagramHandle = cleanHandle(inputOrEvidence.account?.username);
    sellerName = seller?.name || inputOrEvidence.seller?.name || inputOrEvidence.account?.display_name || null;
    brandName = product?.brand || inputOrEvidence.product?.brand || null;
    productName = product?.name || inputOrEvidence.product?.name || null;
  } else {
    // MetaAdCollectionInput object passed
    instagramUrl = inputOrEvidence.instagramUrl || "";
    instagramHandle = cleanHandle(inputOrEvidence.instagramHandle);
    sellerName = inputOrEvidence.sellerName || seller?.name || null;
    brandName = inputOrEvidence.brand || product?.brand || null;
    productName = inputOrEvidence.product || product?.name || null;
    pageId = inputOrEvidence.pageId || null;
  }

  // Build candidate search terms with strict prioritization
  // 1. Page ID (if present)
  // 2. Seller display name
  // 3. Instagram handle without @
  // 4. Brand name
  // 5. Product name
  const candidateTerms: string[] = [];
  const candidatePageIds: string[] = [];

  if (pageId && pageId.trim().length > 0) {
    candidatePageIds.push(pageId.trim());
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
    // Only search by product name if terms list is small, prioritizing seller identity
    if (candidateTerms.length < 3) {
      candidateTerms.push(productName.trim());
    }
  }

  const queryTerms = candidatePageIds.length > 0 ? candidatePageIds.concat(candidateTerms) : candidateTerms;

  if (!token || !token.trim()) {
    return {
      status: "unavailable",
      queryTerms,
      country,
      ads: [],
      totalFound: 0,
      source: "meta_ad_library",
      collectedAt,
      error: "No Meta Ad Library access token configured",
      limitation: "Meta Ad Library API access token is missing.",
      evidenceSource: "Meta Ad Library",
    };
  }

  if (queryTerms.length === 0) {
    return {
      status: "not_found",
      queryTerms: [],
      country,
      ads: [],
      totalFound: 0,
      source: "meta_ad_library",
      collectedAt,
      limitation: "No matching ads were returned by the Meta Ad Library API for the current query.",
      evidenceSource: "Meta Ad Library",
    };
  }

  const TIMEOUT_MS = 8000;
  let lastApiError: string | null = null;
  let commercialCoverageLimitation: string | null = null;
  let hadSuccessfulQuery = false;
  const allFoundAds: MetaAdRecord[] = [];
  const seenAdIds = new Set<string>();

  // 1. Search by Page IDs if available
  for (const pid of candidatePageIds) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const url = new URL(`https://graph.facebook.com/${apiVersion}/ads_archive`);
      url.searchParams.set("access_token", token);
      url.searchParams.set("ad_reached_countries", `["${country}"]`);
      url.searchParams.set("ad_type", "ALL");
      url.searchParams.set("search_page_ids", pid);
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
        console.warn(`[MetaAdEvidence] Page ID query for "${pid}" returned ${res.status}: ${errMsg}`);
        continue;
      }

      hadSuccessfulQuery = true;
      const data = (await res.json()) as {
        data?: Array<{
          id?: string;
          page_id?: string;
          page_name?: string;
          publisher_platforms?: string[];
          ad_delivery_start_time?: string;
          ad_delivery_stop_time?: string;
          ad_creative_bodies?: string[];
          ad_creative_link_titles?: string[];
          ad_creative_link_descriptions?: string[];
          ad_creative_link_captions?: string[];
          ad_snapshot_url?: string;
        }>;
      };

      if (data.data && data.data.length > 0) {
        for (const item of data.data) {
          if (item.id && !seenAdIds.has(item.id)) {
            seenAdIds.add(item.id);
            const bodies = item.ad_creative_bodies || [];
            allFoundAds.push({
              libraryId: item.id,
              advertiserName: item.page_name || null,
              advertiserPageId: item.page_id || null,
              publisherPlatforms: item.publisher_platforms || ["INSTAGRAM"],
              deliveryStart: item.ad_delivery_start_time ? item.ad_delivery_start_time.split("T")[0] : null,
              deliveryEnd: item.ad_delivery_stop_time ? item.ad_delivery_stop_time.split("T")[0] : "Active",
              adText: bodies.filter(Boolean).join("\n") || null,
              linkTitle: item.ad_creative_link_titles?.[0] || null,
              linkDescription: item.ad_creative_link_descriptions?.[0] || null,
              adSnapshotUrl: item.ad_snapshot_url || null,
              destinationUrl: item.ad_creative_link_captions?.[0] || null,
              evidenceSource: "meta_ad_library",
            });
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
      const data = (await res.json()) as {
        data?: Array<{
          id?: string;
          page_id?: string;
          page_name?: string;
          publisher_platforms?: string[];
          ad_delivery_start_time?: string;
          ad_delivery_stop_time?: string;
          ad_creative_bodies?: string[];
          ad_creative_link_titles?: string[];
          ad_creative_link_descriptions?: string[];
          ad_creative_link_captions?: string[];
          ad_snapshot_url?: string;
        }>;
      };

      if (data.data && data.data.length > 0) {
        for (const item of data.data) {
          if (item.id && !seenAdIds.has(item.id)) {
            seenAdIds.add(item.id);
            const bodies = item.ad_creative_bodies || [];
            allFoundAds.push({
              libraryId: item.id,
              advertiserName: item.page_name || null,
              advertiserPageId: item.page_id || null,
              publisherPlatforms: item.publisher_platforms || ["INSTAGRAM"],
              deliveryStart: item.ad_delivery_start_time ? item.ad_delivery_start_time.split("T")[0] : null,
              deliveryEnd: item.ad_delivery_stop_time ? item.ad_delivery_stop_time.split("T")[0] : "Active",
              adText: bodies.filter(Boolean).join("\n") || null,
              linkTitle: item.ad_creative_link_titles?.[0] || null,
              linkDescription: item.ad_creative_link_descriptions?.[0] || null,
              adSnapshotUrl: item.ad_snapshot_url || null,
              destinationUrl: item.ad_creative_link_captions?.[0] || null,
              evidenceSource: "meta_ad_library",
            });
          }
        }
      }
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastApiError = isAbort ? "Request timed out" : err instanceof Error ? err.message : String(err);
      console.warn(`[MetaAdEvidence] Request for "${term}" failed: ${lastApiError}`);
    }
  }

  // Return structured results
  if (allFoundAds.length > 0) {
    const topAd = allFoundAds[0];
    return {
      status: "found",
      queryTerms,
      country,
      ads: allFoundAds,
      totalFound: allFoundAds.length,
      source: "meta_ad_library",
      collectedAt,
      // Top-level properties for convenience
      libraryId: topAd.libraryId,
      advertiserName: topAd.advertiserName || undefined,
      advertiserPageId: topAd.advertiserPageId || undefined,
      publisherPlatforms: topAd.publisherPlatforms,
      deliveryStart: topAd.deliveryStart || undefined,
      deliveryEnd: topAd.deliveryEnd || undefined,
      adText: topAd.adText || undefined,
      linkTitle: topAd.linkTitle || undefined,
      linkDescription: topAd.linkDescription || undefined,
      adSnapshotUrl: topAd.adSnapshotUrl || undefined,
      destinationUrl: topAd.destinationUrl || undefined,
      evidenceSource: "Meta Ad Library",
    };
  }

  if (!hadSuccessfulQuery && lastApiError) {
    return {
      status: commercialCoverageLimitation ? "unavailable" : "error",
      queryTerms,
      country,
      ads: [],
      totalFound: 0,
      source: "meta_ad_library",
      collectedAt,
      error: lastApiError,
      limitation: commercialCoverageLimitation || "Meta Ad Library API encountered an error or was unavailable.",
      evidenceSource: "Meta Ad Library",
    };
  }

  return {
    status: "not_found",
    queryTerms,
    country,
    ads: [],
    totalFound: 0,
    source: "meta_ad_library",
    collectedAt,
    limitation: "No matching ads were returned by the Meta Ad Library API for the current query.",
    evidenceSource: "Meta Ad Library",
  };
}
