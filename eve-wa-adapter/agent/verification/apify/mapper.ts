import type { NormalizedApifyAd } from "./types.ts";

export function normalizeAd(rawItem: any, runInfo: { run_id: string; dataset_id: string; actor_id: string; country: string }): NormalizedApifyAd {
  const adId = String(rawItem.id || rawItem.adArchiveID || String(Math.random()));
  const isActive = rawItem.endDate === null || rawItem.endDate === undefined || rawItem.endDate === "Active" || rawItem.end_date === null;
  
  let daysActive: number | null = null;
  const start = rawItem.startDate || rawItem.ad_delivery_start_time;
  if (start) {
    // If it's a unix timestamp
    const startDate = typeof start === 'number' ? new Date(start * 1000) : new Date(start);
    if (!isNaN(startDate.getTime())) {
      const end = (rawItem.endDate || rawItem.ad_delivery_stop_time) ? 
        (typeof rawItem.endDate === 'number' ? new Date(rawItem.endDate * 1000) : new Date(rawItem.endDate)) : 
        new Date();
      
      const diffTime = Math.abs(end.getTime() - startDate.getTime());
      daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  }

  const image_urls: string[] = [];
  const video_urls: string[] = [];
  
  // Try to parse snapshot cards
  if (rawItem.snapshot && Array.isArray(rawItem.snapshot.cards)) {
    for (const card of rawItem.snapshot.cards) {
      if (card.resized_image_url) image_urls.push(card.resized_image_url);
      else if (card.original_image_url) image_urls.push(card.original_image_url);
    }
  }
  
  const platforms = Array.isArray(rawItem.publisherPlatforms) 
    ? rawItem.publisherPlatforms 
    : (Array.isArray(rawItem.publisher_platform) ? rawItem.publisher_platform : ["INSTAGRAM"]);

  return {
    external_ad_id: adId,
    advertiser: {
      name: rawItem.pageName || rawItem.page_name || null,
      page_id: rawItem.pageId || rawItem.page_id || null,
      page_url: rawItem.page_profile_uri || null,
      instagram_handle: rawItem.instagram_actor_name || null,
      category: Array.isArray(rawItem.page_categories) ? rawItem.page_categories[0] : null,
      verified: null, // Hard to infer reliably from basic ad library payload
    },
    creative: {
      primary_text: rawItem.body || rawItem.snapshot?.body?.markup || null,
      headline: rawItem.title || rawItem.snapshot?.title || null,
      description: rawItem.description || rawItem.snapshot?.caption || null,
      cta: rawItem.callToActionUrl || rawItem.snapshot?.cta_text || null,
      link_url: rawItem.url || rawItem.snapshot?.link_url || null,
      display_format: rawItem.snapshot?.display_format || null,
      image_urls,
      video_urls,
    },
    delivery: {
      is_active: isActive,
      start_date: start ? String(start) : null,
      end_date: rawItem.endDate || rawItem.ad_delivery_stop_time ? String(rawItem.endDate || rawItem.ad_delivery_stop_time) : null,
      days_active: daysActive,
    },
    platforms: platforms.map((p: string) => p.toUpperCase()),
    languages: [],
    country: runInfo.country || "IN",
    source: {
      provider: "apify",
      actor_id: runInfo.actor_id,
      run_id: runInfo.run_id,
      dataset_id: runInfo.dataset_id,
      snapshot_url: rawItem.snapshotUrl || rawItem.ad_snapshot_url || null,
    },
    raw_data: rawItem,
  };
}
