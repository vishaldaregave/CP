import type {
  ProfileInvestigation,
  ProfileInvestigationConfig,
  ProfileEvidenceItem,
  ExternalProfileLink,
  BioClaim,
  BioClaimVerificationResult,
  ProfileHighlight,
  ProfilePostSample,
  ContentBioConsistency,
  MetaAdEvidence,
  WebsiteEvidence,
  AdvertisingIntelligence,
  SellerIdentityGraph,
  InstagramEvidence,
} from "./types.ts";
import { normalizeBioText, extractBioClaims, verifyBioClaims } from "./bioInvestigator.ts";
import { extractExternalLinks } from "./externalLinks.ts";
import { extractProfileHighlights } from "./highlightsInvestigator.ts";
import { sampleProfileContent, evaluateContentBioConsistency } from "./contentInvestigator.ts";
import { calculateProfileScore } from "./profileScoring.ts";

export interface InvestigateProfileParams {
  url?: string;
  username?: string | null;
  displayName?: string | null;
  rawBio?: string | null;
  profilePictureUrl?: string | null;
  followerCount?: number | null;
  followingCount?: number | null;
  postCount?: number | null;
  verifiedStatus?: "VERIFIED" | "UNVERIFIED" | "UNKNOWN";
  accountCategory?: string | null;
  externalLinks?: string[];
  contactInformation?: {
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  highlights?: Array<{ title: string; sourceUrl?: string; stories?: string[] }>;
  posts?: Array<{
    url?: string;
    caption?: string | null;
    timestamp?: string | null;
    mediaType?: "image" | "video" | "reel" | "carousel" | "unknown";
    likes?: number;
    comments?: number;
    views?: number;
  }>;
  metaAdEvidence?: MetaAdEvidence | null;
  websiteEvidence?: WebsiteEvidence | null;
  advertisingIntelligence?: AdvertisingIntelligence | null;
  sellerIdentityGraph?: SellerIdentityGraph | null;
  config?: ProfileInvestigationConfig;
}

/**
 * Investigates a public Instagram profile as a whole, with the BIO as the highest-priority evidence source.
 * Generically works for ANY public Instagram profile without hard-coding usernames.
 */
export function investigateInstagramProfile(params: InvestigateProfileParams): ProfileInvestigation {
  const profileUrl = params.url || `https://www.instagram.com/${params.username || ""}`;
  const username = params.username ? params.username.replace(/^@+/, "").trim() : null;
  const displayName = params.displayName?.trim() || null;
  const rawBio = params.rawBio ? normalizeBioText(params.rawBio) : null;
  const verifiedStatus = params.verifiedStatus || "UNKNOWN";
  const capturedAt = new Date().toISOString();

  const config: Required<ProfileInvestigationConfig> = {
    maxPostsToInspect: params.config?.maxPostsToInspect ?? 12,
    investigateHighlights: params.config?.investigateHighlights ?? true,
    investigateExternalLinks: params.config?.investigateExternalLinks ?? true,
    evidenceSamplingLimits: {
      maxBioClaims: params.config?.evidenceSamplingLimits?.maxBioClaims ?? 20,
      maxLinks: params.config?.evidenceSamplingLimits?.maxLinks ?? 15,
      maxHighlights: params.config?.evidenceSamplingLimits?.maxHighlights ?? 15,
    },
  };

  const evidenceLedger: ProfileEvidenceItem[] = [];

  // 1. Profile Level Evidence
  if (username) {
    evidenceLedger.push({
      id: "EV-PROFILE-001",
      source: "Instagram Public Profile",
      sourceUrl: profileUrl,
      sourceType: "instagram_profile",
      sourceLocation: "Account Metadata",
      observedText: `Public Instagram Account: @${username}`,
      observedValue: username,
      claim: "Public account existence",
      evidenceType: "ACCOUNT_IDENTITY",
      status: "OBSERVED",
      confidence: 95,
      capturedAt,
      trustImpact: 5,
      riskImpact: 0,
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
    });
  }

  // 2. External Links Extraction
  const rawLinkUrls = [...(params.externalLinks || [])];
  // Also extract URLs embedded directly in bio text
  if (rawBio) {
    const bioUrls = rawBio.match(/(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`]+|[a-zA-Z0-9.-]+\.(?:com|in|org|net|io|co|ai|me|dev|app|store|tech|online|link)\b/gi) || [];
    for (const bu of bioUrls) {
      if (!rawLinkUrls.includes(bu)) {
        rawLinkUrls.push(bu);
      }
    }
  }

  const externalLinks: ExternalProfileLink[] = config.investigateExternalLinks
    ? extractExternalLinks(rawLinkUrls, "Instagram Profile Bio & Links")
    : [];

  externalLinks.forEach((link) => {
    evidenceLedger.push({
      id: link.evidenceId,
      source: "Instagram External Link",
      sourceUrl: link.originalUrl,
      sourceType: "external_link",
      sourceLocation: "Bio Link Header",
      observedText: `External ${link.platform} link observed: ${link.domain} (${link.originalUrl})`,
      observedValue: link.domain,
      claim: `Associated with platform ${link.platform}`,
      evidenceType: "EXTERNAL_LINK",
      status: "OBSERVED",
      confidence: 90,
      capturedAt,
      trustImpact: 3,
      riskImpact: 0,
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
    });
  });

  // 3. Raw Bio & Structured Claim Extraction (Bio is Highest Priority)
  const profileClaims: BioClaim[] = rawBio
    ? extractBioClaims(rawBio, profileUrl, username)
    : [];

  profileClaims.forEach((claim) => {
    evidenceLedger.push({
      id: claim.evidenceId,
      source: "Instagram Profile Bio",
      sourceUrl: profileUrl,
      sourceType: "instagram_bio",
      sourceLocation: "Bio Text",
      observedText: `Observed bio claim: "${claim.claimText}"`,
      observedValue: claim.normalizedValue,
      claim: `Claims ${claim.claimType}: ${claim.normalizedValue}`,
      evidenceType: `BIO_CLAIM_${claim.claimType}`,
      status: "OBSERVED",
      confidence: claim.confidence,
      capturedAt,
      trustImpact: 3,
      riskImpact: 0,
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
    });
  });

  // 4. Sample Profile Content (Bounded Sampling, default 12)
  const posts: ProfilePostSample[] = sampleProfileContent(
    params.posts || [],
    config.maxPostsToInspect,
  );

  posts.forEach((post) => {
    evidenceLedger.push({
      id: post.evidenceIds[0],
      source: "Instagram Public Post",
      sourceUrl: post.postUrl,
      sourceType: "instagram_post",
      sourceLocation: "Feed Post / Reel",
      observedText: post.caption ? `Caption: "${post.caption.slice(0, 100)}..."` : `Public ${post.mediaType} item`,
      observedValue: post.topics.join(", "),
      claim: post.topics.length > 0 ? `Active topics: ${post.topics.join(", ")}` : null,
      evidenceType: "CONTENT_SAMPLE",
      status: "OBSERVED",
      confidence: 85,
      capturedAt,
      trustImpact: 2,
      riskImpact: 0,
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
    });
  });

  // 5. Highlights Investigation
  const highlights: ProfileHighlight[] = config.investigateHighlights
    ? extractProfileHighlights(params.highlights, Boolean(params.highlights && params.highlights.length > 0))
    : extractProfileHighlights(null, false);

  highlights.forEach((hl) => {
    if (hl.status === "ACCESSIBLE") {
      evidenceLedger.push({
        id: hl.evidenceIds[0],
        source: "Instagram Story Highlights",
        sourceUrl: hl.sourceUrl || profileUrl,
        sourceType: "instagram_highlight",
        sourceLocation: "Profile Highlight Reel",
        observedText: `Highlight Story: "${hl.title}" (${hl.category})`,
        observedValue: hl.category,
        claim: `Showcases ${hl.category} evidence`,
        evidenceType: "HIGHLIGHT_RECORD",
        status: "OBSERVED",
        confidence: 85,
        capturedAt,
        trustImpact: 2,
        riskImpact: 0,
        supportingEvidenceIds: [],
        contradictingEvidenceIds: [],
      });
    }
  });

  // 6. Bio Claim Verification across all independent sources
  const claimVerifications: BioClaimVerificationResult[] = verifyBioClaims(
    profileClaims,
    externalLinks,
    params.websiteEvidence,
    posts,
    highlights,
    params.metaAdEvidence,
    params.advertisingIntelligence,
  );

  // Update evidence items with verification status
  claimVerifications.forEach((cv) => {
    const item = evidenceLedger.find((e) => e.id === cv.claim.evidenceId);
    if (item) {
      item.status = cv.status;
      item.supportingEvidenceIds = cv.matchingEvidenceIds;
      if (cv.status === "SUPPORTED") {
        item.trustImpact += 4;
      }
    }
  });

  // 7. Content ↔ Bio Consistency
  const contentBioConsistency: ContentBioConsistency = evaluateContentBioConsistency(
    profileClaims,
    posts,
  );

  // 8. Identity Signals
  const identitySignals: string[] = [];
  if (username) identitySignals.push(`Username @${username} confirmed on Instagram`);
  if (displayName) identitySignals.push(`Display name "${displayName}"`);
  if (rawBio) identitySignals.push(`Raw bio present (${rawBio.length} chars)`);
  if (externalLinks.length > 0) {
    identitySignals.push(`Connected external platforms: ${externalLinks.map((l) => l.platform).join(", ")}`);
  }
  if (params.sellerIdentityGraph?.overallRating === "MATCH") {
    identitySignals.push("Cross-source identity match verified across Instagram and External Web");
  }

  // 9. Calculate 8-Dimension Trust Score and Side Panel Payload
  const { dimensions, overallScore, sidePanelData } = calculateProfileScore({
    username,
    displayName,
    rawBio,
    verifiedStatus,
    followerCount: params.followerCount ?? null,
    postCount: params.postCount ?? null,
    externalLinks,
    bioVerifications: claimVerifications,
    posts,
    highlights,
    contentConsistency: contentBioConsistency,
    sellerIdentityGraph: params.sellerIdentityGraph,
    advertisingIntelligence: params.advertisingIntelligence,
    evidenceLedger,
  });

  const contactInformation = {
    email: params.contactInformation?.email || null,
    phone: params.contactInformation?.phone || null,
    address: params.contactInformation?.address || null,
  };

  const investigationStatus = username || rawBio || posts.length > 0 ? "COMPLETED" : "PARTIAL";

  return {
    username,
    profileUrl,
    displayName,
    bio: rawBio,
    rawBio,
    profilePictureUrl: params.profilePictureUrl || null,
    followerCount: params.followerCount ?? null,
    followingCount: params.followingCount ?? null,
    postCount: params.postCount ?? null,
    verifiedStatus,
    accountCategory: params.accountCategory || null,
    externalLinks,
    contactInformation,
    profileClaims,
    claimVerifications,
    highlights,
    posts,
    identitySignals,
    contentBioConsistency,
    evidence: evidenceLedger,
    dimensions,
    overallScore,
    investigationStatus,
    capturedAt,
    sidePanelData,
  };
}

/**
 * Builds a ProfileInvestigation from an existing InstagramEvidence collector result.
 */
export function buildProfileInvestigationFromEvidence(
  evidence?: InstagramEvidence | null,
  metaAdEvidence?: MetaAdEvidence | null,
  websiteEvidence?: WebsiteEvidence | null,
  advertisingIntelligence?: AdvertisingIntelligence | null,
  sellerIdentityGraph?: SellerIdentityGraph | null,
): ProfileInvestigation {
  const username = evidence?.account?.username || evidence?.seller?.username || null;
  const displayName = evidence?.account?.display_name || evidence?.seller?.name || null;

  // Bio can come from seller website / caption / raw metadata if available
  const rawBio =
    (evidence?.raw_metadata?.bio as string) ||
    (evidence?.raw_metadata?.biography as string) ||
    evidence?.post?.caption ||
    null;

  const externalLinks = [...(evidence?.external_links || [])];
  if (evidence?.seller?.website && !externalLinks.includes(evidence.seller.website)) {
    externalLinks.push(evidence.seller.website);
  }

  // Construct bounded post samples from available caption and media
  const postSamples: Array<{ url?: string; caption?: string | null; mediaType?: "image" | "video" | "reel" | "carousel" | "unknown" }> = [];
  if (evidence?.post?.caption || (evidence?.media && evidence.media.length > 0)) {
    postSamples.push({
      url: evidence?.source?.url || "https://www.instagram.com/",
      caption: evidence?.post?.caption || null,
      mediaType: evidence?.post?.type === "reel" ? "reel" : evidence?.post?.type === "video" ? "video" : "image",
    });
  }

  return investigateInstagramProfile({
    url: evidence?.source?.canonical_url || evidence?.source?.url || "https://www.instagram.com/",
    username,
    displayName,
    rawBio,
    verifiedStatus: evidence?.seller?.verification_status === "VERIFIED" ? "VERIFIED" : "UNKNOWN",
    externalLinks,
    posts: postSamples,
    metaAdEvidence,
    websiteEvidence,
    advertisingIntelligence,
    sellerIdentityGraph,
  });
}
