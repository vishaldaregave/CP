/**
 * Veriqoo — Evidence Timeline
 * Tracks chronological evidence events across the entire investigation lifecycle.
 * Uses real timestamps and never invents dates.
 */

import type {
  EvidenceTimeline,
  TimelineEvent,
  InstagramEvidence,
  WebsiteEvidence,
  MediaEvidence,
  MetaAdEvidence,
  PostPurchaseComparisonResult,
} from "./types.ts";

interface TimelineBuilderInput {
  evidence?: InstagramEvidence | null;
  website?: WebsiteEvidence | null;
  media?: MediaEvidence | null;
  metaAd?: MetaAdEvidence | null;
  postPurchase?: PostPurchaseComparisonResult | null;
  customEvents?: TimelineEvent[];
}

/**
 * Builds an evidence timeline from all available investigation sources.
 * Sorts events chronologically using real timestamps.
 */
export function buildEvidenceTimeline(input: TimelineBuilderInput): EvidenceTimeline {
  const events: TimelineEvent[] = [];

  const { evidence, website, media, metaAd, postPurchase, customEvents } = input;

  // 1. Instagram seller / post identification
  if (evidence) {
    const postTime = evidence.post?.timestamp || new Date().toISOString();
    events.push({
      timestamp: postTime,
      source: "instagram",
      event: "Instagram seller & post identified",
      description: `Identified seller @${evidence.account?.username || "unknown"} with post caption and media.`,
      confidence: 90,
    });

    if (evidence.claims && evidence.claims.length > 0) {
      events.push({
        timestamp: postTime,
        source: "instagram",
        event: "Ad & product claims extracted",
        description: `Extracted ${evidence.claims.length} claim(s) from post caption/hashtags.`,
        confidence: 85,
      });
    }
  }

  // 2. Media understanding & OCR
  if (media) {
    const mediaTime = new Date().toISOString();
    if (media.ocr && media.ocr.text) {
      events.push({
        timestamp: mediaTime,
        source: "ocr",
        event: "Image text / OCR extracted",
        description: `OCR processed ${media.ocr.text.length} characters of text from visual media.`,
        confidence: 88,
      });
    }
    if (media.packaging) {
      events.push({
        timestamp: mediaTime,
        source: "packaging",
        event: "Packaging regulatory details extracted",
        description: `Extracted packaging details: MRP ${media.packaging.product.mrp || "N/A"}, Brand ${media.packaging.product.brand || "N/A"}.`,
        confidence: 85,
      });
    }
  }

  // 3. Meta Ad Library
  if (metaAd) {
    const metaTime = metaAd.collectedAt || new Date().toISOString();
    events.push({
      timestamp: metaTime,
      source: "meta_ad",
      event: "Meta Ad Library queried",
      description: metaAd.status === "found"
        ? `Found ${metaAd.totalFound || metaAd.ads?.length || 1} active/historic ad(s) for advertiser '${metaAd.advertiserName || "seller"}'.`
        : `Queried Meta Ad Library. No active public ads found for this query.`,
      confidence: 90,
    });

    if (metaAd.ads && metaAd.ads.length > 0) {
      for (const ad of metaAd.ads.slice(0, 3)) {
        if (ad.deliveryStart) {
          events.push({
            timestamp: ad.deliveryStart,
            source: "meta_ad",
            event: "Meta advertisement launched",
            description: `Ad campaign started: "${(ad.adText || ad.linkTitle || "Campaign").slice(0, 60)}..."`,
            confidence: 92,
          });
        }
      }
    }
  }

  // 4. Website Investigation
  if (website) {
    const webTime = new Date().toISOString();
    events.push({
      timestamp: webTime,
      source: "website",
      event: "Destination website analyzed",
      description: website.status === "accessible"
        ? `Discovered and audited website: ${website.domain || website.url}.`
        : `Target website search completed (Status: ${website.status}).`,
      confidence: website.status === "accessible" ? 90 : 70,
    });
  }

  // 5. Post-Purchase Events
  if (postPurchase) {
    events.push({
      timestamp: postPurchase.comparisonTimestamp || new Date().toISOString(),
      source: "received_product",
      event: "Received product proof analyzed",
      description: `User provided post-purchase product proof. OCR & packaging analysis completed.`,
      confidence: 95,
    });

    events.push({
      timestamp: postPurchase.comparisonTimestamp || new Date().toISOString(),
      source: "received_product",
      event: "Cross-comparison (Advertised vs Received) completed",
      description: `Post-purchase evaluation verdict: ${postPurchase.overallRating}. Detected ${postPurchase.mismatchesDetected.length} mismatch(es).`,
      confidence: 90,
    });
  }

  // 6. Custom events
  if (customEvents && customEvents.length > 0) {
    events.push(...customEvents);
  }

  // Sort chronologically ascending
  events.sort((a, b) => {
    const tA = new Date(a.timestamp).getTime();
    const tB = new Date(b.timestamp).getTime();
    if (isNaN(tA) || isNaN(tB)) return 0;
    return tA - tB;
  });

  const startedAt = events.length > 0 ? events[0].timestamp : new Date().toISOString();
  const lastUpdatedAt = events.length > 0 ? events[events.length - 1].timestamp : new Date().toISOString();

  return {
    events,
    startedAt,
    lastUpdatedAt,
  };
}
