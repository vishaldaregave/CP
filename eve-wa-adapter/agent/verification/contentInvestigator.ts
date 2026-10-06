import type {
  ProfilePostSample,
  BioClaim,
  ContentBioConsistency,
} from "./types.ts";

/**
 * Extracts hashtags from caption.
 */
function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[a-zA-Z0-9_]+/g);
  return matches ? matches.map((t) => t.slice(1).toLowerCase()) : [];
}

/**
 * Extracts mentions from caption.
 */
function extractMentions(caption: string): string[] {
  const matches = caption.match(/@[a-zA-Z0-9._]+/g);
  return matches ? matches.map((m) => m.slice(1).toLowerCase()) : [];
}

/**
 * Infers core topics from text and hashtags.
 */
function inferTopics(caption: string, hashtags: string[]): string[] {
  const text = (caption + " " + hashtags.join(" ")).toLowerCase();
  const topics: string[] = [];

  const map: Record<string, string[]> = {
    "software_engineering": ["code", "coding", "software", "developer", "github", "programming", "python", "typescript", "javascript", "react", "backend", "frontend", "api"],
    "ai_machine_learning": ["ai", "machine learning", "deep learning", "llm", "gpt", "neural", "vision", "automation"],
    "ecommerce_retail": ["shop", "store", "buy", "discount", "price", "sale", "order", "product", "shipping", "cart", "catalog"],
    "design_creative": ["design", "ui", "ux", "graphic", "art", "creative", "illustration", "typography", "branding"],
    "fitness_health": ["fitness", "workout", "gym", "health", "nutrition", "diet", "training"],
    "education_tutorial": ["tutorial", "how to", "guide", "learn", "course", "tips", "tricks", "education"],
    "business_entrepreneurship": ["founder", "startup", "entrepreneur", "business", "growth", "revenue", "saas", "clients"],
  };

  for (const [topic, keywords] of Object.entries(map)) {
    if (keywords.some((k) => text.includes(k))) {
      topics.push(topic);
    }
  }

  return topics.length > 0 ? topics : ["general_lifestyle"];
}

/**
 * Samples and normalizes recent public posts for profile investigation (bounded sampling).
 */
export function sampleProfileContent(
  rawPosts: Array<{
    url?: string;
    caption?: string | null;
    timestamp?: string | null;
    mediaType?: "image" | "video" | "reel" | "carousel" | "unknown";
    likes?: number;
    comments?: number;
    views?: number;
  }> = [],
  maxPosts: number = 12,
): ProfilePostSample[] {
  const posts: ProfilePostSample[] = [];
  let postSeq = 1;

  const bounded = rawPosts.slice(0, maxPosts);

  for (const p of bounded) {
    const caption = p.caption || "";
    const hashtags = extractHashtags(caption);
    const mentions = extractMentions(caption);
    const topics = inferTopics(caption, hashtags);
    const evidenceId = `EV-POST-${String(postSeq++).padStart(3, "0")}`;

    const productServiceClaims: string[] = [];
    const businessClaims: string[] = [];
    const commercialSignals: string[] = [];

    const lowerCap = caption.toLowerCase();
    if (/\b(?:price|₹|\$|mrp|discount|sale|buy now|link in bio|dm to order)\b/.test(lowerCap)) {
      commercialSignals.push("Direct purchase or commercial CTA observed");
    }
    if (/\b(?:launching|feature|release|introducing|available now)\b/.test(lowerCap)) {
      productServiceClaims.push(caption.slice(0, 100));
    }
    if (/\b(?:team|company|startup|client|funded|milestone)\b/.test(lowerCap)) {
      businessClaims.push(caption.slice(0, 100));
    }

    posts.push({
      postId: `POST-${postSeq - 1}`,
      postUrl: p.url || `https://www.instagram.com/p/sample_${postSeq - 1}/`,
      timestamp: p.timestamp || null,
      mediaType: p.mediaType || "image",
      caption: p.caption || null,
      visibleEngagement: {
        likes: p.likes ?? null,
        comments: p.comments ?? null,
        views: p.views ?? null,
      },
      hashtags,
      mentions,
      productServiceClaims,
      businessClaims,
      topics,
      commercialSignals,
      evidenceIds: [evidenceId],
    });
  }

  return posts;
}

/**
 * Evaluates consistency between the Profile Bio claims and bounded Content sample.
 *
 * NOTE: Consistency is an alignment signal; it does NOT prove underlying real-world credentials.
 */
export function evaluateContentBioConsistency(
  bioClaims: BioClaim[],
  posts: ProfilePostSample[],
): ContentBioConsistency {
  if (posts.length === 0 || bioClaims.length === 0) {
    return {
      status: "UNKNOWN",
      matchingTopics: [],
      discrepancies: [],
      evidenceIds: [],
      explanation: "Insufficient post samples or bio claims to evaluate content-bio consistency.",
    };
  }

  const matchingTopics: string[] = [];
  const discrepancies: string[] = [];
  const evidenceIds: string[] = [];

  const allPostCaptions = posts.map((p) => (p.caption || "").toLowerCase()).join(" ");
  const allPostTopics = Array.from(new Set(posts.flatMap((p) => p.topics)));

  let matchedClaimsCount = 0;

  for (const claim of bioClaims) {
    const claimValLower = claim.normalizedValue.toLowerCase();
    const claimType = claim.claimType;

    let isMatched = false;

    if (claimType === "OCCUPATION" || claimType === "FOUNDER" || claimType === "PRODUCT" || claimType === "SERVICE") {
      // Check keywords and topics
      if (allPostCaptions.includes(claimValLower)) {
        isMatched = true;
      } else {
        // Check topic overlap
        const claimWords = claimValLower.split(/\s+/).filter((w) => w.length > 3);
        if (claimWords.some((w) => allPostCaptions.includes(w) || allPostTopics.some((t) => t.includes(w)))) {
          isMatched = true;
        }
      }

      if (isMatched) {
        matchedClaimsCount++;
        matchingTopics.push(`${claim.claimType}: ${claim.claimText}`);
        evidenceIds.push(claim.evidenceId);
        // Add matching post evidence IDs
        posts.forEach((p) => {
          if ((p.caption || "").toLowerCase().includes(claimValLower)) {
            evidenceIds.push(...p.evidenceIds);
          }
        });
      }
    }
  }

  const uniqueEvidenceIds = Array.from(new Set(evidenceIds));

  if (matchedClaimsCount > 0) {
    return {
      status: "SUPPORTED",
      matchingTopics,
      discrepancies,
      evidenceIds: uniqueEvidenceIds,
      explanation: `Profile content aligns consistently with ${matchedClaimsCount} bio claim(s) across recent sampled posts.`,
    };
  }

  // If no direct keyword matches were found, mark PARTIAL or UNKNOWN (never automatically CONTRADICTED unless complete opposite observed)
  return {
    status: "PARTIAL",
    matchingTopics: [],
    discrepancies: [],
    evidenceIds: uniqueEvidenceIds,
    explanation: `General activity observed in sampled posts; no specific contradiction with bio claims found.`,
  };
}
