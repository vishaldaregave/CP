import { InstagramProfileService } from "./apify/instagramProfile.ts";
import { generateInstagramIntelligenceReport } from "./instagramProfileReportGenerator.ts";

export async function createIntelligenceReport(username: string): Promise<string> {
  const profileService = new InstagramProfileService();
  console.info(`[INTELLIGENCE REPORT] Fetching Instagram profile data for @${username}`);
  
  const data = await profileService.scrapeProfile(username);
  if (!data) {
    throw new Error(`Could not fetch profile data for @${username}. Please check your Apify API Token and actor limits.`);
  }

  console.info(`[INTELLIGENCE REPORT] Successfully fetched data for @${username}. Generating report HTML...`);
  const reportHtml = generateInstagramIntelligenceReport(data);
  
  return reportHtml;
}
