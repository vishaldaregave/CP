import { InstagramProfileService } from "./apify/instagramProfile.ts";
import {
  generateInstagramIntelligenceReport,
  generateInstagramIntelligenceReportPdf,
} from "./instagramProfileReportGenerator.ts";
import * as path from "node:path";

export async function createIntelligenceReport(username: string): Promise<string> {
  const profileService = new InstagramProfileService();
  console.info(`[INTELLIGENCE REPORT] Fetching Instagram profile data for @${username}`);

  const data = await profileService.scrapeProfile(username);
  if (!data) {
    throw new Error(
      `Could not fetch profile data for @${username}. Please check your Apify API Token and actor limits.`,
    );
  }

  console.info(`[INTELLIGENCE REPORT] Successfully fetched data for @${username}. Generating report HTML...`);
  const reportHtml = generateInstagramIntelligenceReport(data);

  return reportHtml;
}

export async function createIntelligenceReportPdf(
  username: string,
  outputPath?: string,
): Promise<string> {
  const profileService = new InstagramProfileService();
  console.info(`[INTELLIGENCE REPORT] Fetching Instagram profile data for @${username}`);

  const data = await profileService.scrapeProfile(username);
  if (!data) {
    throw new Error(
      `Could not fetch profile data for @${username}. Please check your Apify API Token and actor limits.`,
    );
  }

  const targetPath =
    outputPath || path.resolve(process.cwd(), "reports", `verification-${username}.pdf`);

  console.info(`[INTELLIGENCE REPORT] Generating publication-grade PDF report for @${username} at "${targetPath}"...`);
  return generateInstagramIntelligenceReportPdf(data, targetPath);
}
