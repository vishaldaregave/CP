export interface NormalizedApifyAd {
  external_ad_id: string;
  advertiser: {
    name: string | null;
    page_id: string | null;
    page_url: string | null;
    instagram_handle: string | null;
    category: string | null;
    verified: boolean | null;
  };
  creative: {
    primary_text: string | null;
    headline: string | null;
    description: string | null;
    cta: string | null;
    link_url: string | null;
    display_format: string | null;
    image_urls: string[];
    video_urls: string[];
  };
  delivery: {
    is_active: boolean | null;
    start_date: string | null;
    end_date: string | null;
    days_active: number | null;
  };
  platforms: string[];
  languages: string[];
  country: string;
  source: {
    provider: "apify";
    actor_id: string;
    run_id: string;
    dataset_id: string;
    snapshot_url: string | null;
  };
  raw_data: Record<string, any>;
}

export interface ApifyInput {
  query?: string;
  pageId?: string;
  country?: string;
  maxItems?: number;
}
