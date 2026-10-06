import { ApifyClient } from "apify-client";
import type { ApifyInput, NormalizedApifyAd } from "./types.ts";
import { normalizeAd } from "./mapper.ts";

export class ApifyService {
  private client: ApifyClient;
  private readonly actorId = "bo5X18oGenWEV9vVo";

  constructor(token?: string) {
    const apiToken = token || process.env.APIFY_API_TOKEN;
    if (!apiToken) {
      throw new Error("APIFY_API_TOKEN is missing.");
    }
    this.client = new ApifyClient({ token: apiToken });
  }

  /**
   * Triggers an Apify scrape job and returns the run ID (asynchronous job).
   */
  async startMetaAdsScraper(input: ApifyInput): Promise<string> {
    const run = await this.client.actor(this.actorId).start({
      query: input.query || "",
      maxItems: input.maxItems || 10,
    });
    return run.id;
  }

  /**
   * Check run status
   */
  async getRunStatus(runId: string): Promise<string> {
    const run = await this.client.run(runId).get();
    return run?.status || "UNKNOWN";
  }

  /**
   * Retrieves default dataset, waiting if necessary, and normalizes the output.
   */
  async getRunResults(runId: string, country: string): Promise<NormalizedApifyAd[]> {
    const run = await this.client.run(runId).get();
    if (!run || !run.defaultDatasetId) {
      throw new Error("No dataset found for Apify run.");
    }
    
    const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
    
    return items.map((item: any) => normalizeAd(item, {
      run_id: runId,
      dataset_id: run.defaultDatasetId!,
      actor_id: this.actorId,
      country
    }));
  }

  /**
   * Synchronous helper for testing or simple flows that block and wait for completion.
   */
  async runMetaAdsScraperSync(input: ApifyInput): Promise<NormalizedApifyAd[]> {
    const run = await this.client.actor(this.actorId).call({
      query: input.query || "",
      maxItems: input.maxItems || 10,
    });
    
    if (!run.defaultDatasetId) {
      return [];
    }

    const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
    
    return items.map((item: any) => normalizeAd(item, {
      run_id: run.id,
      dataset_id: run.defaultDatasetId!,
      actor_id: this.actorId,
      country: input.country || "IN"
    }));
  }
}
