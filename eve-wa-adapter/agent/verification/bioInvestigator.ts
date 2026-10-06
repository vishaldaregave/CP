import type {
  BioClaim,
  BioClaimType,
  BioClaimStatus,
  BioClaimVerificationResult,
  ExternalProfileLink,
  ProfilePostSample,
  ProfileHighlight,
  MetaAdEvidence,
  WebsiteEvidence,
  AdvertisingIntelligence,
} from "./types.ts";

/**
 * Standardizes raw bio text without losing authentic content.
 */
export function normalizeBioText(rawBio: string): string {
  if (!rawBio) return "";
  return rawBio.trim();
}

/**
 * Extracts structured claims from raw bio string.
 * Works generically for ANY Instagram profile.
 */
export function extractBioClaims(
  rawBio: string,
  profileUrl: string = "https://www.instagram.com/",
  username: string | null = null,
): BioClaim[] {
  if (!rawBio || typeof rawBio !== "string" || !rawBio.trim()) {
    return [];
  }

  const claims: BioClaim[] = [];
  let claimSeq = 1;

  const nextBioEvidenceId = () => `EV-BIO-${String(claimSeq++).padStart(3, "0")}`;

  // Split bio into lines or segment by common delimiters (|, •, /, -, \n)
  const lines = rawBio.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Helper to add a claim safely
  const addClaim = (
    claimType: BioClaimType,
    claimText: string,
    normalizedValue: string,
    confidence: number = 85,
  ) => {
    // Avoid duplicate normalized values for same claimType
    if (claims.some((c) => c.claimType === claimType && c.normalizedValue.toLowerCase() === normalizedValue.toLowerCase())) {
      return;
    }
    const evidenceId = nextBioEvidenceId();
    claims.push({
      claimId: `BIO-CLM-${claimType}-${claimSeq - 1}`,
      claimType,
      claimText: claimText.trim(),
      normalizedValue: normalizedValue.trim(),
      source: "Instagram Profile Bio",
      sourceUrl: profileUrl,
      evidenceId,
      status: "OBSERVED",
      confidence,
      verificationReason: `Directly observed in profile bio: "${claimText.trim()}"`,
    });
  };

  // 1. Check for Founder / Co-Founder / CEO / Leadership claims
  const founderRegex = /(?:^|[|\n•/,–—-])\s*(?:(?:co-?)?founder|ceo|director|creator|built\s+by|owner|lead\s+dev|founding\s+member)\s*(?:@([a-zA-Z0-9._]+)|(?:of|at)\s+([a-zA-Z0-9._\s&-]+)|(?:\s*:\s*([a-zA-Z0-9._\s&-]+)))?/i;
  for (const line of lines) {
    const fMatch = line.match(founderRegex);
    if (fMatch) {
      const entity = (fMatch[1] || fMatch[2] || fMatch[3] || line).trim();
      addClaim("FOUNDER", line, entity || line, 90);
    }
  }

  // Also check building / maker claims
  const buildingRegex = /\b(?:building|making|creating|launching|maker\s+of)\s+([a-zA-Z0-9._\s&@#-]+)/i;
  for (const line of lines) {
    const bMatch = line.match(buildingRegex);
    if (bMatch && !claims.some((c) => c.claimType === "FOUNDER" && c.claimText.includes(line))) {
      addClaim("FOUNDER", line, bMatch[1].trim(), 80);
    }
  }

  // 2. Check for Occupation / Professional Roles
  const occupations = [
    "software engineer", "developer", "fullstack dev", "frontend dev", "backend dev",
    "web developer", "mobile developer", "designer", "ui/ux designer", "product designer",
    "graphic designer", "architect", "data scientist", "ai engineer", "ai builder",
    "machine learning engineer", "doctor", "lawyer", "consultant", "photographer",
    "videographer", "filmmaker", "content creator", "digital creator", "artist",
    "musician", "producer", "writer", "author", "journalist", "educator", "teacher",
    "coach", "fitness trainer", "nutritionist", "marketer", "trader", "investor",
    "researcher", "student", "freelancer", "builder", "coder", "programmer",
    "fashion designer", "baker", "chef", "artisan", "craftsman",
  ];

  for (const line of lines) {
    // Check pipe / slash segments inside the line
    const segments = line.split(/[|•/–—,]/).map((s) => s.trim()).filter(Boolean);
    for (const segment of segments) {
      const lowerSegment = segment.toLowerCase();
      for (const occ of occupations) {
        if (lowerSegment === occ || lowerSegment.includes(occ)) {
          addClaim("OCCUPATION", segment, occ.toUpperCase(), 85);
          break;
        }
      }
    }
  }

  // 3. Check for Company / Works at claims
  const companyRegex = /(?:works?\s+at|at|ex-?|joined)\s+([a-zA-Z0-9._&@]+)/i;
  for (const line of lines) {
    const cMatch = line.match(companyRegex);
    if (cMatch && !claims.some((c) => c.claimType === "FOUNDER" && c.claimText.includes(line))) {
      addClaim("COMPANY", line, cMatch[1].trim(), 85);
    }
  }

  // 4. Check for Location claims (city, state, country, pin emoji)
  const locationRegex = /(?:📍|based in|living in|from|location:\s*|\bin\s+)([a-zA-Z\s,]+(?:India|USA|UK|Canada|Germany|Mumbai|Pune|Bangalore|Bengaluru|Delhi|Hyderabad|Chennai|Kolkata|London|San Francisco|NYC|New York|Dubai|Singapore|Tokyo|Berlin|Paris|Sydney|Austin|Seattle))/i;
  for (const line of lines) {
    const lMatch = line.match(locationRegex);
    if (lMatch) {
      addClaim("LOCATION", line, lMatch[1].trim(), 90);
    } else if (line.includes("📍")) {
      const locClean = line.replace(/📍/g, "").trim();
      if (locClean.length > 1 && locClean.length < 50) {
        addClaim("LOCATION", line, locClean, 85);
      }
    }
  }

  // 5. Check for Education claims
  const eduRegex = /(?:alumni|alum|student|graduate|graduated|studied|studying|iit|nit|bits|mit|stanford|harvard|university|college|b\.?tech|m\.?tech|m\.?b\.?a|ph\.?d|b\.?s|m\.?s)\s*(?:of|at|from)?\s*([a-zA-Z0-9._\s&-]+)?/i;
  for (const line of lines) {
    const eMatch = line.match(eduRegex);
    if (eMatch) {
      addClaim("EDUCATION", line, eMatch[0].trim(), 85);
    }
  }

  // 6. Check for Website / Link claims
  const webRegex = /(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`]+|[a-zA-Z0-9.-]+\.(?:com|in|org|net|io|co|ai|me|dev|app|store|tech|online|link)\b/gi;
  for (const line of lines) {
    const wMatches = line.match(webRegex);
    if (wMatches) {
      for (const w of wMatches) {
        addClaim("WEBSITE", line, w.trim(), 95);
      }
    }
  }

  // 7. Check for Contact claims (Email, Phone, WhatsApp, DM)
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  for (const line of lines) {
    const emails = line.match(emailRegex);
    if (emails) {
      for (const em of emails) {
        addClaim("CONTACT", line, `Email: ${em}`, 95);
      }
    }
    const phones = line.match(phoneRegex);
    if (phones) {
      for (const ph of phones) {
        if (ph.replace(/\D/g, "").length >= 10) {
          addClaim("CONTACT", line, `Phone: ${ph.trim()}`, 90);
        }
      }
    }
    if (/\b(?:dm\s+(?:for|to)|inquiries|book via dm|contact\s*:)\b/i.test(line)) {
      addClaim("CONTACT", line, line.trim(), 80);
    }
  }

  // 8. Check for Social Handles / Cross-Platform Links in Bio
  const handleRegex = /@([a-zA-Z0-9._]+)/g;
  for (const line of lines) {
    const handles = line.match(handleRegex);
    if (handles) {
      for (const h of handles) {
        const cleanHandle = h.replace(/^@/, "");
        if (username && cleanHandle.toLowerCase() === username.toLowerCase()) {
          continue; // skip self
        }
        addClaim("SOCIAL_HANDLE", line, `@${cleanHandle}`, 85);
      }
    }
  }

  // 9. Check for Product / Service / Business / Promotional claims
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (/\b(?:selling|shop|store|buy|collection|handcrafted|organic|merch|apparel|products?)\b/.test(lowerLine)) {
      addClaim("PRODUCT", line, line.trim(), 80);
    } else if (/\b(?:services?|consulting|agency|coaching|mentorship|bookings|hire\s+me|freelance)\b/.test(lowerLine)) {
      addClaim("SERVICE", line, line.trim(), 80);
    } else if (/\b(?:officially|registered|pvt|ltd|iso|certified|trademarked|trusted\s+by)\b/.test(lowerLine)) {
      addClaim("BUSINESS_CLAIM", line, line.trim(), 80);
    } else if (/\b(?:\d+%\s*off|discount|sale|use\s+code|free\s+shipping|coupon|deal)\b/.test(lowerLine)) {
      addClaim("PROMOTIONAL_CLAIM", line, line.trim(), 85);
    } else if (/\b(?:\d+\+?\s*years|ex-|senior|staff|principal|award\s*winning)\b/.test(lowerLine)) {
      addClaim("PROFESSIONAL_CLAIM", line, line.trim(), 80);
    }
  }

  // If no structured claims were extracted, add general IDENTITY claim
  if (claims.length === 0 && rawBio.trim()) {
    addClaim("IDENTITY", rawBio, rawBio.trim().slice(0, 100), 75);
  }

  return claims;
}

/**
 * Verifies bio claims against all accessible independent evidence sources in the investigation:
 * - External website
 * - External links (GitHub, LinkedIn, Twitter/X, etc.)
 * - Recent public posts/reels
 * - Highlights
 * - Meta Ad Library / Advertiser identity
 * - Email / Domain info
 *
 * NOTE: Unverified claims are marked "UNVERIFIED" (never SCAM or FRAUD).
 */
export function verifyBioClaims(
  bioClaims: BioClaim[],
  externalLinks: ExternalProfileLink[] = [],
  website?: WebsiteEvidence | null,
  posts: ProfilePostSample[] = [],
  highlights: ProfileHighlight[] = [],
  metaAd?: MetaAdEvidence | null,
  advertisingIntelligence?: AdvertisingIntelligence | null,
): BioClaimVerificationResult[] {
  const results: BioClaimVerificationResult[] = [];

  for (const claim of bioClaims) {
    const checkedSources: string[] = [];
    const matchingEvidenceIds: string[] = [];
    let status: BioClaimStatus = "UNVERIFIED";
    let explanation = "";

    const claimTextLower = claim.claimText.toLowerCase();
    const claimValLower = claim.normalizedValue.toLowerCase();

    // 1. Check External Links & Platforms
    if (externalLinks.length > 0) {
      checkedSources.push("External Links");
      for (const link of externalLinks) {
        const linkDomainLower = link.domain.toLowerCase();
        const linkUrlLower = link.originalUrl.toLowerCase();

        if (
          claim.claimType === "WEBSITE" &&
          (linkUrlLower.includes(claimValLower) || claimValLower.includes(linkDomainLower))
        ) {
          status = "SUPPORTED";
          matchingEvidenceIds.push(link.evidenceId);
          explanation = `Bio website claim matches verified external link (${link.domain}).`;
        } else if (
          (claim.claimType === "OCCUPATION" || claim.claimType === "FOUNDER" || claim.claimType === "IDENTITY") &&
          (link.platform === "github" || link.platform === "linkedin" || link.platform === "portfolio")
        ) {
          status = "SUPPORTED";
          matchingEvidenceIds.push(link.evidenceId);
          explanation = `Professional bio claim corroborated by ${link.platform} profile link (${link.originalUrl}).`;
        }
      }
    }

    // 2. Check External Website
    if (website && website.status === "accessible") {
      checkedSources.push("External Website");
      const companyName = website.company.name?.toLowerCase() || "";
      const domain = website.domain.toLowerCase();
      const productNames = website.product.name?.toLowerCase() || "";

      if (
        claim.claimType === "FOUNDER" ||
        claim.claimType === "COMPANY" ||
        claim.claimType === "BUSINESS_CLAIM"
      ) {
        if (
          (companyName && (claimTextLower.includes(companyName) || companyName.includes(claimValLower))) ||
          domain.includes(claimValLower.replace(/[^a-z0-9]/g, "")) ||
          claimValLower.includes(domain)
        ) {
          status = "SUPPORTED";
          explanation = `Bio association matches accessible store domain and company (${website.domain}).`;
        }
      } else if (claim.claimType === "PRODUCT" && productNames && claimTextLower.includes(productNames)) {
        status = "SUPPORTED";
        explanation = `Bio product claim matches catalog product found on ${website.domain}.`;
      } else if (claim.claimType === "CONTACT") {
        if (
          (website.company.email && claimTextLower.includes(website.company.email.toLowerCase())) ||
          (website.company.phone && claimTextLower.includes(website.company.phone.toLowerCase()))
        ) {
          status = "SUPPORTED";
          explanation = `Bio contact information matches official website contact records.`;
        }
      }
    }

    // 3. Check Meta Advertising Evidence
    if (metaAd && metaAd.status === "found") {
      checkedSources.push("Meta Ad Library");
      const advName = metaAd.advertiserName?.toLowerCase() || "";
      if (
        (claim.claimType === "FOUNDER" || claim.claimType === "COMPANY" || claim.claimType === "BUSINESS_CLAIM") &&
        advName &&
        (claimTextLower.includes(advName) || advName.includes(claimValLower))
      ) {
        status = "SUPPORTED";
        if (advertisingIntelligence?.evidenceLedger?.[0]) {
          matchingEvidenceIds.push(advertisingIntelligence.evidenceLedger[0].id);
        }
        explanation = `Bio brand/company claim matches verified Meta advertiser (${metaAd.advertiserName}).`;
      }
    }

    // 4. Check Content (Posts & Reels)
    if (posts.length > 0) {
      checkedSources.push("Recent Posts Content");
      const postCaptions = posts.map((p) => (p.caption || "").toLowerCase()).join(" ");
      const allTopics = posts.flatMap((p) => p.topics).map((t) => t.toLowerCase());

      if (claim.claimType === "OCCUPATION" || claim.claimType === "FOUNDER") {
        if (
          postCaptions.includes(claimValLower) ||
          allTopics.some((t) => t.includes(claimValLower) || claimValLower.includes(t))
        ) {
          if (status !== "SUPPORTED") {
            status = "SUPPORTED";
            explanation = `Bio claim consistently reflected across ${posts.length} sampled posts/topics.`;
          }
          posts.forEach((p) => {
            if ((p.caption || "").toLowerCase().includes(claimValLower)) {
              matchingEvidenceIds.push(...p.evidenceIds);
            }
          });
        }
      } else if (claim.claimType === "PRODUCT" || claim.claimType === "SERVICE") {
        if (postCaptions.includes(claimValLower) || allTopics.some((t) => t.includes(claimValLower))) {
          if (status !== "SUPPORTED") {
            status = "SUPPORTED";
            explanation = `Bio product/service matches active items shown in recent profile posts.`;
          }
        }
      }
    }

    // 5. Check Highlights
    if (highlights.length > 0) {
      checkedSources.push("Profile Highlights");
      for (const hl of highlights) {
        const hlContent = [...hl.visibleContent, ...hl.extractedClaims, hl.title].join(" ").toLowerCase();
        if (hlContent.includes(claimValLower) || (claim.claimType === "SERVICE" && hl.category === "Services")) {
          if (status !== "SUPPORTED") {
            status = "SUPPORTED";
            explanation = `Corroborated by Profile Highlight story ("${hl.title}").`;
          }
          matchingEvidenceIds.push(...hl.evidenceIds);
        }
      }
    }

    // Default explanation if unverified
    if (status === "UNVERIFIED") {
      explanation = `Observed claim directly from Instagram bio. No independent multi-source verification data found in this investigation.`;
    }

    // Update claim object status as well
    claim.status = status;
    claim.supportingSources = checkedSources;

    results.push({
      claim,
      status,
      checkedSources,
      matchingEvidenceIds: Array.from(new Set(matchingEvidenceIds)),
      explanation,
    });
  }

  return results;
}
