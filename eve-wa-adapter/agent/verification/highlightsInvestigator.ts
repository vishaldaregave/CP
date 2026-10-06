import type { ProfileHighlight, HighlightCategory } from "./types.ts";

/**
 * Classifies a highlight title into prioritized investigative categories.
 */
export function categorizeHighlight(title: string): HighlightCategory {
  const t = title.toLowerCase().trim();
  if (/\b(?:reviews?|feedback|ratings?|proof)\b/.test(t)) return "Reviews";
  if (/\b(?:testimonials?|results?|success|shoutouts?)\b/.test(t)) return "Testimonials";
  if (/\b(?:about|who\s+i\s+am|intro|story|me)\b/.test(t)) return "About";
  if (/\b(?:work|projects?|portfolio|code|builds?|case\s+studies)\b/.test(t)) return "Work";
  if (/\b(?:clients?|customers?|brands?|partners?)\b/.test(t)) return "Clients";
  if (/\b(?:products?|catalog|drops?|collection|shop|merch)\b/.test(t)) return "Products";
  if (/\b(?:services?|consulting|agency|coaching|mentorship|offerings?)\b/.test(t)) return "Services";
  if (/\b(?:contact|dm|reach\s+out|faq|location|hours)\b/.test(t)) return "Contact";
  if (/\b(?:business|registered|press|media|features?|events?)\b/.test(t)) return "Business";
  return "General";
}

/**
 * Extracts and investigates public Instagram highlights.
 * If highlights cannot be accessed, returns HIGHLIGHTS_UNAVAILABLE gracefully without penalizing.
 */
export function extractProfileHighlights(
  rawHighlights?: Array<{ title: string; sourceUrl?: string; stories?: string[] }> | null,
  isAvailable: boolean = true,
): ProfileHighlight[] {
  if (!isAvailable || !rawHighlights || rawHighlights.length === 0) {
    return [
      {
        highlightId: "HL-UNAVAILABLE-001",
        title: "Highlights Investigation",
        category: "General",
        visibleContent: [],
        extractedClaims: [],
        entities: [],
        productsServices: [],
        evidenceIds: ["EV-HIGHLIGHT-000"],
        capturedAt: new Date().toISOString(),
        status: "HIGHLIGHTS_UNAVAILABLE",
      },
    ];
  }

  let hlSeq = 1;
  const results: ProfileHighlight[] = [];

  for (const raw of rawHighlights) {
    if (!raw.title) continue;
    const category = categorizeHighlight(raw.title);
    const evidenceId = `EV-HIGHLIGHT-${String(hlSeq++).padStart(3, "0")}`;
    const visibleContent = raw.stories || [raw.title];

    // Extract basic claims and entities from title and stories
    const extractedClaims: string[] = [];
    const productsServices: string[] = [];
    const entities: string[] = [];

    if (category === "Reviews" || category === "Testimonials") {
      extractedClaims.push(`Profile showcases verified customer feedback in "${raw.title}"`);
    } else if (category === "Work" || category === "Portfolio") {
      extractedClaims.push(`Profile presents active portfolio projects in "${raw.title}"`);
    } else if (category === "Products" || category === "Services") {
      productsServices.push(raw.title);
      extractedClaims.push(`Profile lists active commercial offerings in "${raw.title}"`);
    }

    results.push({
      highlightId: `HL-${hlSeq - 1}`,
      title: raw.title,
      sourceUrl: raw.sourceUrl || null,
      category,
      visibleContent,
      extractedClaims,
      entities,
      productsServices,
      evidenceIds: [evidenceId],
      capturedAt: new Date().toISOString(),
      status: "ACCESSIBLE",
    });
  }

  return results.length > 0
    ? results
    : [
        {
          highlightId: "HL-EMPTY-001",
          title: "Highlights",
          category: "General",
          visibleContent: [],
          extractedClaims: [],
          entities: [],
          productsServices: [],
          evidenceIds: ["EV-HIGHLIGHT-000"],
          capturedAt: new Date().toISOString(),
          status: "EMPTY",
        },
      ];
}
