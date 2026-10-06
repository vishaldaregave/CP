import type {
  MetaAdEvidence,
  MetaAdRecord,
  MetaAdCollectionInput,
  InstagramEvidence,
  ProductInfo,
  SellerInfo,
} from "./types.ts";
import { ApifyClient } from "apify-client";

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
import { ApifyService } from "./apify/index.ts";

export async function collectMetaAdEvidence(
  inputOrEvidence: MetaAdCollectionInput | InstagramEvidence,
  product?: ProductInfo,
  seller?: SellerInfo,
): Promise<MetaAdEvidence> {
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
      const seenAdIds = new Set<string>();
      
      for (const ad of normalizedAds) {
        if (!seenAdIds.has(ad.external_ad_id)) {
            seenAdIds.add(ad.external_ad_id);
            // Push it to allFoundAds. Since MetaAdRecord is now identically typed to NormalizedApifyAd, this is completely safe.
            allFoundAds.push(ad as MetaAdRecord);
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
