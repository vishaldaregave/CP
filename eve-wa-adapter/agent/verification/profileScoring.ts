import type {
  ProfileInvestigation,
  ProfileScoreDimension,
  BioClaimVerificationResult,
  ExternalProfileLink,
  ProfilePostSample,
  ProfileHighlight,
  ContentBioConsistency,
  SellerIdentityGraph,
  AdvertisingIntelligence,
  ProfileEvidenceItem,
  SidePanelPayload,
  RiskLevel,
} from "./types.ts";

export interface ProfileScoringInput {
  username: string | null;
  displayName: string | null;
  rawBio: string | null;
  verifiedStatus: "VERIFIED" | "UNVERIFIED" | "UNKNOWN";
  followerCount: number | null;
  postCount: number | null;
  externalLinks: ExternalProfileLink[];
  bioVerifications: BioClaimVerificationResult[];
  posts: ProfilePostSample[];
  highlights: ProfileHighlight[];
  contentConsistency: ContentBioConsistency;
  sellerIdentityGraph?: SellerIdentityGraph | null;
  advertisingIntelligence?: AdvertisingIntelligence | null;
  evidenceLedger: ProfileEvidenceItem[];
}

/**
 * Computes explainable, evidence-backed 8-dimension profile investigation score.
 *
 * Missing or unavailable data yields NEUTRAL (0 penalty).
 */
export function calculateProfileScore(input: ProfileScoringInput): {
  dimensions: ProfileScoreDimension[];
  overallScore: number;
  confidence: number;
  evidenceCoverage: number;
  riskLevel: RiskLevel;
  sidePanelData: SidePanelPayload;
} {
  const dimensions: ProfileScoreDimension[] = [];

  // Helper to collect evidence IDs safely
  const findEvidence = (prefix: string) =>
    input.evidenceLedger.filter((e) => e.id.startsWith(prefix)).map((e) => e.id);

  // 1. Identity Consistency (Max 20)
  let identityScore = 0;
  const identityEvidence: string[] = [];
  if (input.username) {
    identityScore += 10;
    identityEvidence.push(...findEvidence("EV-PROFILE"));
  }
  if (input.displayName) {
    identityScore += 5;
  }
  if (input.sellerIdentityGraph?.overallRating === "MATCH") {
    identityScore += 5;
  } else if (input.sellerIdentityGraph?.overallRating === "PARTIAL") {
    identityScore += 3;
  }
  dimensions.push({
    name: "Identity Consistency",
    category: "Identity Consistency",
    maxScore: 20,
    earnedScore: Math.min(20, identityScore),
    evidenceIds: Array.from(new Set(identityEvidence)),
    explanation: `Profile identity and handle consistency evaluated across available sources.`,
    isNeutral: false,
  });

  // 2. Profile Completeness (Max 10)
  let completenessScore = 0;
  const completenessEvidence: string[] = [];
  if (input.rawBio && input.rawBio.trim().length > 0) {
    completenessScore += 4;
    completenessEvidence.push(...findEvidence("EV-BIO"));
  }
  if (input.externalLinks.length > 0) {
    completenessScore += 3;
    completenessEvidence.push(...findEvidence("EV-LINK"));
  }
  if (input.posts.length > 0) {
    completenessScore += 3;
    completenessEvidence.push(...findEvidence("EV-POST"));
  }
  dimensions.push({
    name: "Profile Completeness",
    category: "Profile Completeness",
    maxScore: 10,
    earnedScore: Math.min(10, completenessScore),
    evidenceIds: Array.from(new Set(completenessEvidence)),
    explanation: `Assesses presence of standard public profile assets (bio, external links, sample posts).`,
    isNeutral: false,
  });

  // 3. Bio Evidence (Max 15)
  let bioScore = 0;
  const bioEvidence: string[] = [];
  const supportedClaims = input.bioVerifications.filter((v) => v.status === "SUPPORTED");
  const observedClaims = input.bioVerifications.filter((v) => v.status === "OBSERVED" || v.status === "UNVERIFIED");

  if (supportedClaims.length > 0) {
    bioScore += Math.min(15, 8 + supportedClaims.length * 3);
    supportedClaims.forEach((c) => bioEvidence.push(c.claim.evidenceId));
  } else if (observedClaims.length > 0) {
    bioScore += 6; // observed claims earn baseline without assuming malice
    observedClaims.forEach((c) => bioEvidence.push(c.claim.evidenceId));
  }
  dimensions.push({
    name: "Bio Evidence",
    category: "Bio Evidence",
    maxScore: 15,
    earnedScore: Math.min(15, bioScore),
    evidenceIds: Array.from(new Set(bioEvidence)),
    explanation: `Evaluates structured claims extracted directly from the profile bio against corroborated data.`,
    isNeutral: false,
  });

  // 4. External Identity (Max 15)
  let externalIdentityScore = 0;
  const externalEvidence: string[] = [];
  if (input.externalLinks.length > 0) {
    const recognizedPlatforms = input.externalLinks.filter((l) => l.platform !== "other");
    externalIdentityScore += Math.min(15, 6 + recognizedPlatforms.length * 4);
    input.externalLinks.forEach((l) => externalEvidence.push(l.evidenceId));
  }
  dimensions.push({
    name: "External Identity",
    category: "External Identity",
    maxScore: 15,
    earnedScore: Math.min(15, externalIdentityScore),
    evidenceIds: Array.from(new Set(externalEvidence)),
    explanation: `Presence of verifiable multi-platform links (GitHub, LinkedIn, websites, portfolios).`,
    isNeutral: input.externalLinks.length === 0,
  });

  // 5. Content Consistency (Max 15)
  let contentScore = 0;
  const contentEvidence: string[] = [];
  if (input.contentConsistency.status === "SUPPORTED") {
    contentScore = 15;
    contentEvidence.push(...input.contentConsistency.evidenceIds);
  } else if (input.contentConsistency.status === "PARTIAL") {
    contentScore = 10;
    contentEvidence.push(...findEvidence("EV-POST"));
  } else if (input.posts.length > 0) {
    contentScore = 8;
    contentEvidence.push(...findEvidence("EV-POST"));
  }
  dimensions.push({
    name: "Content Consistency",
    category: "Content Consistency",
    maxScore: 15,
    earnedScore: Math.min(15, contentScore),
    evidenceIds: Array.from(new Set(contentEvidence)),
    explanation: `Checks if sampled posts and topics align with bio claims and declared activities.`,
    isNeutral: input.posts.length === 0,
  });

  // 6. Highlights (Max 10)
  let highlightsScore = 0;
  const highlightsEvidence: string[] = [];
  const accessibleHighlights = input.highlights.filter((h) => h.status === "ACCESSIBLE");
  if (accessibleHighlights.length > 0) {
    highlightsScore = Math.min(10, 5 + accessibleHighlights.length * 2);
    accessibleHighlights.forEach((h) => highlightsEvidence.push(...h.evidenceIds));
  }
  dimensions.push({
    name: "Highlights",
    category: "Highlights",
    maxScore: 10,
    earnedScore: Math.min(10, highlightsScore),
    evidenceIds: Array.from(new Set(highlightsEvidence)),
    explanation: `Inspection of public story highlights (Portfolio, Reviews, Work, Products).`,
    isNeutral: accessibleHighlights.length === 0,
  });

  // 7. Advertising (Max 10)
  let adScore = 0;
  const adEvidence: string[] = [];
  if (input.advertisingIntelligence && input.advertisingIntelligence.status === "FOUND") {
    if (input.advertisingIntelligence.advertiserMatch?.rating === "MATCH") {
      adScore = 10;
    } else if (input.advertisingIntelligence.advertiserMatch?.rating === "PARTIAL_MATCH") {
      adScore = 7;
    } else {
      adScore = 5;
    }
    input.advertisingIntelligence.evidenceLedger?.forEach((e) => adEvidence.push(e.id));
  }
  dimensions.push({
    name: "Advertising",
    category: "Advertising",
    maxScore: 10,
    earnedScore: Math.min(10, adScore),
    evidenceIds: Array.from(new Set(adEvidence)),
    explanation: `Cross-source correlation with Meta Ad Library and commercial transparency records.`,
    isNeutral: !input.advertisingIntelligence || input.advertisingIntelligence.status !== "FOUND",
  });

  // 8. Behavioural Signals (Max 5)
  let behaviouralScore = 0;
  const behaviouralEvidence: string[] = [];
  if (input.verifiedStatus === "VERIFIED") {
    behaviouralScore += 3;
    behaviouralEvidence.push(...findEvidence("EV-PROFILE"));
  }
  if (input.followerCount && input.followerCount > 100) {
    behaviouralScore += 2;
    behaviouralEvidence.push(...findEvidence("EV-PROFILE"));
  } else if (input.username) {
    behaviouralScore += 2; // neutral normal score
    behaviouralEvidence.push(...findEvidence("EV-PROFILE"));
  }
  dimensions.push({
    name: "Behavioural Signals",
    category: "Behavioural Signals",
    maxScore: 5,
    earnedScore: Math.min(5, behaviouralScore),
    evidenceIds: Array.from(new Set(behaviouralEvidence)),
    explanation: `Baseline platform engagement and public account signals.`,
    isNeutral: false,
  });

  // Calculate Total Score (0-100)
  const overallScore = Math.min(
    100,
    dimensions.reduce((acc, dim) => acc + dim.earnedScore, 0),
  );

  // Calculate Evidence Coverage
  let availableDimensionsCount = dimensions.filter((d) => !d.isNeutral && d.earnedScore > 0).length;
  const evidenceCoverage = Math.min(100, Math.round((availableDimensionsCount / 8) * 100));

  // Determine Confidence
  const totalEvidenceItems = input.evidenceLedger.length;
  const confidence = Math.min(95, Math.max(30, 40 + totalEvidenceItems * 5 + (supportedClaims.length * 5)));

  // Determine Risk Level
  let riskLevel: RiskLevel = "LOW";
  if (overallScore < 30) {
    riskLevel = "UNKNOWN";
  } else if (overallScore < 50) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "LOW";
  }

  // Construct Side Panel Data Structure
  const getDimensionSummary = (cat: string) => {
    const d = dimensions.find((dim) => dim.category === cat) || { earnedScore: 0, maxScore: 10, evidenceIds: [] };
    const percentage = Math.round((d.earnedScore / d.maxScore) * 100);
    return {
      score: d.earnedScore,
      maxScore: d.maxScore,
      percentage,
      evidence: d.evidenceIds,
    };
  };

  const sidePanelData: SidePanelPayload = {
    profile: {
      username: input.username ? `@${input.username.replace(/^@+/, "")}` : "@unknown",
      displayName: input.displayName || null,
      bio: input.rawBio || null,
      profileUrl: `https://www.instagram.com/${input.username || ""}`,
      verifiedStatus: input.verifiedStatus,
    },
    score: overallScore,
    riskLevel,
    confidence,
    evidenceCoverage,
    dimensions: {
      identity: getDimensionSummary("Identity Consistency"),
      bio: getDimensionSummary("Bio Evidence"),
      content: getDimensionSummary("Content Consistency"),
      externalIdentity: getDimensionSummary("External Identity"),
      advertising: getDimensionSummary("Advertising"),
    },
    evidence: input.evidenceLedger,
    unknowns: dimensions
      .filter((d) => d.isNeutral)
      .map((d) => `No independent data available for ${d.name}`),
    warnings: [],
  };

  return {
    dimensions,
    overallScore,
    confidence,
    evidenceCoverage,
    riskLevel,
    sidePanelData,
  };
}
