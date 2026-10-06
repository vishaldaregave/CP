import { ApifyClient } from "apify-client";

export interface InstagramProfileData {
  username: string;
  fullName: string;
  biography: string;
  followersCount: number;
  followsCount: number;
  postsCount: number;
  isVerified: boolean;
  profilePicUrl: string;
  latestPosts: any[];
  reels: any[];
  taggedPosts: any[];
}

export class InstagramProfileService {
  private client: ApifyClient;

  constructor() {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      console.warn("APIFY_API_TOKEN not found for Instagram Profile Scraper");
    }
    this.client = new ApifyClient({ token });
  }

  async scrapeProfile(username: string): Promise<InstagramProfileData | null> {
    try {
      const input = {
        usernames: [username],
      };
      // apify/instagram-profile-scraper
      const run = await this.client.actor("apify/instagram-profile-scraper").call(input);
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
      
      if (items.length > 0) {
        return items[0] as unknown as InstagramProfileData;
      }
      return null;
    } catch (e) {
      console.error("Failed to scrape Instagram profile:", e);
      return null;
    }
  }
}
