export interface InstagramSource {
  platform: "instagram";
  url: string;
  canonical_url?: string;
  shortcode?: string;
}

export interface InstagramAccount {
  username: string | null;
  display_name: string | null;
}

export interface InstagramPost {
  type: "reel" | "post" | "video" | "unknown" | null;
  caption: string | null;
  timestamp: string | null;
}

export interface ProductInfo {
  name: string | null;
  brand: string | null;
  price: string | null;
  category: string | null;
}

export interface SellerInfo {
  name: string | null;
  username: string | null;
  website: string | null;
  contact: string | null;
  verification_status?: "VERIFIED" | "PARTIALLY VERIFIED" | "UNVERIFIED";
}

export interface Claim {
  claim: string;
  source: string;
}

export interface MediaItem {
  type: "image" | "video";
  url: string;
  source: "instagram";
}

export interface InstagramEvidence {
  source: InstagramSource;
  account: InstagramAccount;
  post: InstagramPost;
  product: ProductInfo;
  seller: SellerInfo;
  claims: Claim[];
  media: MediaItem[];
  video_analysis?: "not_available" | "processed" | null;
  external_links: string[];
  evidence: string[];
  missing_information: string[];
  errors: string[];
  raw_metadata?: Record<string, unknown>;
}

export interface CompanyInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface WebsiteProductInfo {
  name: string | null;
  brand: string | null;
  price: string | null;
  description: string | null;
}

export interface WebsitePolicies {
  refund: boolean;
  return: boolean;
  shipping: boolean;
  privacy: boolean;
  terms: boolean;
}

export interface WebsiteEvidence {
  url: string;
  domain: string;
  status: "accessible" | "inaccessible" | "blocked" | "not_found";
  company: CompanyInfo;
  product: WebsiteProductInfo;
  policies: WebsitePolicies;
  evidence: string[];
  missing_information: string[];
  errors: string[];
}

export interface ExtractedFact {
  fact: string;
  source: string;
  method: string;
}

export interface PackagingProduct {
  name: string | null;
  brand: string | null;
  category: string | null;
  price: string | null;
  mrp: string | null;
}

export interface PackagingManufacturer {
  name: string | null;
  address: string | null;
  contact: string | null;
}

export interface PackagingRegulatory {
  license_numbers: string[];
  certifications: string[];
}

export interface PackagingDates {
  manufactured: string | null;
  expiry: string | null;
  best_before: string | null;
}

export interface PackagingInfo {
  product: PackagingProduct;
  manufacturer: PackagingManufacturer;
  regulatory: PackagingRegulatory;
  dates: PackagingDates;
  claims: string[];
  websites: string[];
  contact_information: string[];
  facts: ExtractedFact[];
}

export interface OcrResult {
  text: string;
  confidence: number;
  status: "success" | "partial" | "failed";
}

export interface MediaEvidence {
  media: MediaItem[];
  ocr: OcrResult | null;
  packaging: PackagingInfo | null;
  video_analysis: "not_available" | "processed" | null;
  status: "analyzed" | "not_available" | "failed";
  evidence: string[];
  errors: string[];
}

export interface MetaAdRecord {
  libraryId: string;
  adId?: string;
  advertiserName: string | null;
  advertiserPageId: string | null;
  publisherPlatforms: string[];
  deliveryStart: string | null;
  deliveryEnd: string | null;
  adText: string | null;
  linkTitle: string | null;
  linkDescription: string | null;
  adSnapshotUrl: string | null;
  destinationUrl: string | null;
  destinationDomain?: string | null;
  adStatus?: "ACTIVE" | "INACTIVE" | "PAUSED" | "UNKNOWN";
  firstObservedDate?: string | null;
  lastObservedDate?: string | null;
  claims?: string[];
  evidenceSource: "meta_ad_library" | "apify" | "meta_ad_library_apify";
}

export interface MetaAdEvidence {
  status: "found" | "not_found" | "unavailable" | "error";
  queryTerms: string[];
  country: string;
  ads: MetaAdRecord[];
  totalFound: number;
  source: "meta_ad_library" | "apify" | "meta_ad_library_apify";
  collectedAt: string;
  error?: string;
  limitation?: string;

  // Convenience / backwards compatibility fields
  libraryId?: string;
  advertiserName?: string;
  advertiserPageId?: string;
  publisherPlatforms?: string[];
  deliveryStart?: string;
  deliveryEnd?: string;
  adText?: string;
  linkTitle?: string;
  linkDescription?: string;
  adSnapshotUrl?: string;
  destinationUrl?: string;
  evidenceSource?: string;
}

export interface MetaAdCollectionInput {
  instagramUrl: string;
  instagramHandle?: string | null;
  sellerName?: string | null;
  brand?: string | null;
  product?: string | null;
  pageId?: string | null;
}

// ---------------------------------------------------------------------------
// ADVERTISING INTELLIGENCE TYPES
// ---------------------------------------------------------------------------

export interface AdEvidenceItem {
  id: string; // e.g. "EV-AD-001"
  source: string; // "Meta Ad Library / Apify" | "Meta Ad Library" | "Apify"
  advertiser: string;
  adId: string;
  status: "ACTIVE" | "INACTIVE" | "PAUSED" | "UNKNOWN";
  observed: string; // date or "HISTORY_UNAVAILABLE"
  firstObserved?: string | null;
  lastObserved?: string | null;
  sourceUrl?: string | null;
  captured: string;
  evidenceType: "META_AD";
  confidence: number;
  destinationUrl?: string | null;
  destinationDomain?: string | null;
  platforms?: string[];
  adTextSnippet?: string | null;
  productClaims?: string[];
  details?: string;
}

export interface DomainCountItem {
  domain: string;
  count: number;
  percentage: number;
}

export interface DestinationDomainAnalysis {
  primaryDomain: string | null;
  domainCount: number;
  domains: DomainCountItem[];
  domainConsistency: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  hasDomainAnomaly: boolean;
  anomalyDetails?: string | null;
}

export interface CreativeVariation {
  creativeId?: string;
  headline?: string | null;
  bodySnippet?: string | null;
  destinationUrl?: string | null;
  deliveryDate?: string | null;
}

export interface CreativeHistoryAnalysis {
  brandConsistency: "CONSISTENT" | "INCONSISTENT" | "UNKNOWN";
  productConsistency: "CONSISTENT" | "INCONSISTENT" | "UNKNOWN";
  messagingConsistency: "CONSISTENT" | "INCONSISTENT" | "UNKNOWN";
  visualIdentityConsistency: "CONSISTENT" | "INCONSISTENT" | "UNKNOWN";
  repeatedCreativePatterns: string[];
  changesOverTime: string[];
  creativeConsistencyScore: number | null;
  creativeConsistency: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  variations: CreativeVariation[];
}

export type AdvertiserIdentityMatchRating = "MATCH" | "PARTIAL_MATCH" | "MISMATCH" | "UNKNOWN";

export interface AdvertiserIdentityMatchResult {
  instagramUsername: string | null;
  instagramDisplayName: string | null;
  instagramBio: string | null;
  instagramExternalLinks: string[];
  metaAdvertiserIdentity: string | null;
  metaPageIdentity: string | null;
  destinationDomain: string | null;
  rating: AdvertiserIdentityMatchRating;
  verdict: string;
  confidence: number;
  evidenceItemId?: string;
}

export interface AdInstagramCorrelation {
  instagramContent: string;
  metaAdContent: string;
  result: "CONTENT_AD_MATCH" | "PROFILE_AD_MISMATCH" | "PARTIAL_MATCH" | "UNKNOWN";
  isAnomaly: boolean;
  explanation: string;
  instagramEvidenceId?: string;
  adEvidenceId?: string;
}

export interface AdWebsiteCorrelation {
  instagramBioDomain: string | null;
  instagramLinks: string[];
  metaDestinationDomains: string[];
  websiteIdentity: string | null;
  result: "CROSS_SOURCE_IDENTITY_MATCH" | "DOMAIN_MISMATCH" | "DOMAIN_ANOMALY" | "UNKNOWN";
  explanation: string;
}

export interface AdTimelineEntry {
  adId: string;
  date: string;
  year: number | string;
  status: "ACTIVE" | "INACTIVE" | "PAUSED" | "UNKNOWN";
  label: string;
  evidenceId: string;
  advertiserName?: string | null;
  destinationDomain?: string | null;
  snippet?: string | null;
}

export interface AdTimelineYearGroup {
  year: number | string;
  entries: AdTimelineEntry[];
}

export interface AdvertisingTimeline {
  advertisingSpan: string;
  firstObserved: string | "HISTORY_UNAVAILABLE";
  lastObserved: string | "HISTORY_UNAVAILABLE";
  activeAdCount: number;
  historicalAdCount: number;
  uniqueCreativeCount: number;
  uniqueDestinationDomainCount: number;
  timelineTree: AdTimelineYearGroup[];
  allEntries: AdTimelineEntry[];
}

export interface AdvertisingIntelligence {
  status: "FOUND" | "NOT_FOUND" | "UNAVAILABLE" | "ERROR";
  source: "Meta Ad Library / Apify" | "Meta Ad Library" | "Apify";
  advertiserIdentity: string | null;
  pageId: string | null;
  totalAdsDiscovered: number;
  activeAdCount: number;
  historicalAdCount: number;
  firstObserved: string | "HISTORY_UNAVAILABLE";
  lastObserved: string | "HISTORY_UNAVAILABLE";
  advertisingSpan: string;
  platforms: string[];
  uniqueCreativeCount: number;
  destinationDomains: string[];

  timeline: AdvertisingTimeline;
  advertiserMatch: AdvertiserIdentityMatchResult;
  destinationAnalysis: DestinationDomainAnalysis;
  creativeHistory: CreativeHistoryAnalysis;
  instagramCorrelation: AdInstagramCorrelation;
  websiteCorrelation: AdWebsiteCorrelation;
  evidenceLedger: AdEvidenceItem[];

  trustSignals: TrustSignal[];
  riskSignals: TrustSignal[];
  riskFactors: RiskFactor[];
  summary: string;
}

export interface AdvertiserIdentityCheck {
  instagramSeller: string | null;
  metaAdvertiser: string | null;
  websiteSeller: string | null;
  result: ConsistencyRating;
  details: string;
}

export type AdPressureType =
  | "extreme_discount"
  | "urgency"
  | "scarcity"
  | "authenticity_claim"
  | "authority_certification"
  | "performance_guarantee"
  | "social_proof"
  | "price_anchoring";

export interface AdPressureSignal {
  type: AdPressureType;
  text: string;
  source: "meta_ad" | "instagram_caption" | "instagram";
  meaning: string;
}

export interface AdClaimAnalysis {
  claims_detected: string[];
  ad_pressure_signals: AdPressureSignal[];
  price_claims: string[];
  authenticity_claims: string[];
  urgency_claims: string[];
  scarcity_claims: string[];
  authority_claims: string[];
  performance_claims: string[];
  social_proof_claims: string[];
  price_anchoring_claims: string[];
  pressure_signals: AdPressureSignal[];
}

export type SourceType = "instagram" | "website" | "product_image" | "seller" | "meta_ad" | "received_product";

export interface SourceValue {
  source: SourceType;
  value: string;
  method?: string;
  confidence?: number;
}

export interface NormalizedEvidence {
  product_name: SourceValue[];
  brand: SourceValue[];
  seller: SourceValue[];
  price: SourceValue[];
  manufacturer: SourceValue[];
  website: SourceValue[];
  contact: SourceValue[];
  claims: SourceValue[];
  license_certification: SourceValue[];
  product_category: SourceValue[];
}

export type ConsistencyRating = "MATCH" | "PARTIAL" | "MISMATCH" | "UNKNOWN";
export type PriceConsistencyRating = "MATCH" | "DIFFERENT" | "UNKNOWN";
export type ClaimsConsistencyRating = "CONSISTENT" | "INCONSISTENT" | "UNKNOWN";

export interface TrustSignal {
  signal: string;
  severity: "positive" | "high" | "medium" | "low";
  sources: SourceType[];
  meaning?: string;
}

export interface MatrixFieldResult {
  field: string;
  valuesBySource: Record<string, string | null>;
  result: ConsistencyRating;
  explanation: string;
}

export interface EvidenceCheckStatus {
  instagram: boolean;
  meta_ad?: boolean;
  website: boolean;
  product_image: boolean;
  ocr: boolean;
  received_product?: boolean;
}

export interface TrustMatrix {
  fields: Record<string, MatrixFieldResult>;
  available_sources: SourceType[];
  evidence_check: EvidenceCheckStatus;
  trust_signals: TrustSignal[];
  risk_signals: TrustSignal[];
  missing_information: string[];
  traceable_conclusions: Array<{ conclusion: string; evidence: SourceValue[] }>;
  summary_explanation: string;
}

export interface ImageCrossCheckResult {
  image_vs_instagram: {
    brand: ConsistencyRating;
    product: ConsistencyRating;
    price: PriceConsistencyRating;
    claims: ClaimsConsistencyRating;
  };
  image_vs_website: {
    brand: ConsistencyRating;
    product: ConsistencyRating;
    price: PriceConsistencyRating;
    manufacturer: ConsistencyRating;
    contact: ConsistencyRating;
  };
  details: string[];
}

export interface ConsistencyResult {
  seller_consistency: ConsistencyRating;
  product_consistency: ConsistencyRating;
  brand_consistency: ConsistencyRating;
  price_consistency: PriceConsistencyRating;
  advertiser_identity?: AdvertiserIdentityCheck;
  details: string[];
}

// ---------------------------------------------------------------------------
// FEATURE 1: Seller Identity Graph
// ---------------------------------------------------------------------------

export interface IdentityRelationship {
  source: SourceType;
  targetSource: SourceType;
  type: string;
  sourceValue: string;
  targetValue: string;
  rating: ConsistencyRating;
  confidence: number;
  explanation: string;
}

export interface SellerIdentityNode {
  type: SourceType;
  label: string;
  value: string;
  verified: boolean;
}

export interface SellerIdentityGraph {
  overallRating: ConsistencyRating;
  confidence: number;
  nodes: SellerIdentityNode[];
  relationships: IdentityRelationship[];
  summary: string;
  trust_signals: TrustSignal[];
  risk_signals: TrustSignal[];
}

// ---------------------------------------------------------------------------
// FEATURE 2: Cross-Source Product Consistency
// ---------------------------------------------------------------------------

export interface ProductConsistencyField {
  field: string;
  rating: ConsistencyRating;
  valuesBySource: Record<string, string | null>;
  explanation: string;
  discrepancyNote?: string;
}

export interface ProductConsistencyReport {
  overallRating: ConsistencyRating;
  fields: Record<string, ProductConsistencyField>;
  trust_signals: TrustSignal[];
  risk_signals: TrustSignal[];
  summary: string;
}

// ---------------------------------------------------------------------------
// FEATURE 3: Post-Purchase Received Product Verification
// ---------------------------------------------------------------------------

export interface ReceivedProductEvidence {
  brand: string | null;
  product: string | null;
  category: string | null;
  price: string | null;
  mrp: string | null;
  net_quantity: string | null;
  pack_size: string | null;
  manufacturer: string | null;
  country_of_origin: string | null;
  claims: string[];
  ocr_text: string;
  confidence: number;
  extractedFacts: ExtractedFact[];
}

export interface PostPurchaseFieldComparison {
  field: string;
  advertised: string | null;
  received: string | null;
  rating: ConsistencyRating;
  explanation: string;
}

export interface PostPurchaseComparisonResult {
  status: "MATCH" | "PARTIAL" | "MISMATCH" | "UNKNOWN";
  overallRating: ConsistencyRating;
  investigationId: string;
  comparisonTimestamp: string;
  fields: Record<string, PostPurchaseFieldComparison>;
  mismatchesDetected: string[];
  receivedProduct: ReceivedProductEvidence;
  summary: string;
  updatedRiskLevel: RiskLevel;
  updatedConfidence: number;
  updatedRiskExplanation: string;
}

export interface PostPurchaseSession {
  investigationId: string;
  originalResult: VerificationResult;
  timestamp: string;
  expiresAt: number;
  jid: string;
}

// ---------------------------------------------------------------------------
// FEATURE 4: Evidence Timeline
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  timestamp: string;
  source: SourceType | "ocr" | "packaging" | "received_product" | "risk_engine" | "user_submission";
  event: string;
  description: string;
  confidence: number;
}

export interface EvidenceTimeline {
  events: TimelineEvent[];
  startedAt: string;
  lastUpdatedAt: string;
}

// ---------------------------------------------------------------------------
// FEATURE 5 & 6: Explainable Risk Factors & Evidence Score
// ---------------------------------------------------------------------------

export type RiskFactorCategory =
  | "SELLER_IDENTITY"
  | "ADVERTISING"
  | "PRODUCT"
  | "PRICE"
  | "WEBSITE"
  | "PACKAGING"
  | "AUTHENTICITY"
  | "CROSS_SOURCE"
  | "POST_PURCHASE";

export interface RiskFactor {
  severity: "low" | "medium" | "high" | "positive";
  category: RiskFactorCategory;
  title: string;
  explanation: string;
  evidence: string;
  sources: SourceType[];
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | "INSUFFICIENT_EVIDENCE";

export interface RiskAnalysisResult {
  risk_level: RiskLevel;
  confidence: number; // 0 to 100
  score?: number; // 0 to 100
  evidence_coverage?: number; // 0 to 100
  positive_signals: string[];
  risk_signals: string[];
  risk_factors?: RiskFactor[];
  missing_information: string[];
  consistency_checks: string[];
  recommendation: string;
  explanation?: string;
  evidence_check?: EvidenceCheckStatus;
  trust_matrix?: TrustMatrix;
}

export interface VerificationResult {
  evidence: InstagramEvidence;
  meta_ad_evidence?: MetaAdEvidence | null;
  advertising_intelligence?: AdvertisingIntelligence | null;
  profile_investigation?: ProfileInvestigation | null;
  ad_claim_analysis?: AdClaimAnalysis | null;
  website_evidence?: WebsiteEvidence | null;
  media_evidence?: MediaEvidence | null;
  image_cross_check?: ImageCrossCheckResult | null;
  consistency?: ConsistencyResult | null;
  seller_identity_graph?: SellerIdentityGraph | null;
  product_consistency?: ProductConsistencyReport | null;
  evidence_timeline?: EvidenceTimeline | null;
  post_purchase_comparison?: PostPurchaseComparisonResult | null;
  trust_matrix?: TrustMatrix | null;
  product: ProductInfo;
  seller: SellerInfo;
  risk: RiskAnalysisResult;
  status: "EVIDENCE_COLLECTED" | "INSUFFICIENT_EVIDENCE";
  failure_reason?: string;
}

// ---------------------------------------------------------------------------
// PHASE 2: DEEP INSTAGRAM PROFILE INVESTIGATION TYPES
// ---------------------------------------------------------------------------

export type BioClaimType =
  | "IDENTITY"
  | "OCCUPATION"
  | "COMPANY"
  | "FOUNDER"
  | "LOCATION"
  | "EDUCATION"
  | "PRODUCT"
  | "SERVICE"
  | "WEBSITE"
  | "CONTACT"
  | "SOCIAL_HANDLE"
  | "PROFESSIONAL_CLAIM"
  | "BUSINESS_CLAIM"
  | "PROMOTIONAL_CLAIM";

export type BioClaimStatus =
  | "OBSERVED"
  | "SUPPORTED"
  | "INFERRED"
  | "UNVERIFIED"
  | "CONTRADICTED"
  | "UNKNOWN"
  | "UNAVAILABLE";

export interface BioClaim {
  claimId: string;
  claimType: BioClaimType;
  claimText: string;
  normalizedValue: string;
  source: string; // e.g. "Instagram Profile"
  sourceUrl?: string | null;
  evidenceId: string; // e.g. "EV-BIO-001"
  status: BioClaimStatus;
  confidence: number;
  verificationReason?: string;
  supportingSources?: string[];
}

export interface BioClaimVerificationResult {
  claim: BioClaim;
  status: BioClaimStatus;
  checkedSources: string[];
  matchingEvidenceIds: string[];
  explanation: string;
}

export type ProfileLinkPlatform =
  | "github"
  | "linkedin"
  | "youtube"
  | "twitter_x"
  | "personal_website"
  | "company_website"
  | "portfolio"
  | "linktree"
  | "contact_email"
  | "contact_phone"
  | "other";

export interface ExternalProfileLink {
  originalUrl: string;
  normalizedUrl: string;
  domain: string;
  platform: ProfileLinkPlatform;
  source: string;
  evidenceId: string; // e.g. "EV-LINK-001"
  accessible?: boolean;
  title?: string | null;
}

export type HighlightCategory =
  | "About"
  | "Work"
  | "Projects"
  | "Clients"
  | "Reviews"
  | "Products"
  | "Services"
  | "Testimonials"
  | "Contact"
  | "Business"
  | "Portfolio"
  | "General";

export interface ProfileHighlight {
  highlightId: string;
  title: string;
  sourceUrl?: string | null;
  category: HighlightCategory;
  visibleContent: string[];
  extractedClaims: string[];
  entities: string[];
  productsServices: string[];
  evidenceIds: string[]; // e.g. ["EV-HIGHLIGHT-001"]
  capturedAt: string;
  status: "ACCESSIBLE" | "HIGHLIGHTS_UNAVAILABLE" | "EMPTY";
}

export interface ProfilePostSample {
  postId: string;
  postUrl: string;
  timestamp?: string | null;
  mediaType: "image" | "video" | "reel" | "carousel" | "unknown";
  caption: string | null;
  visibleEngagement?: {
    likes?: number | null;
    comments?: number | null;
    views?: number | null;
  };
  hashtags: string[];
  mentions: string[];
  productServiceClaims: string[];
  businessClaims: string[];
  topics: string[];
  commercialSignals: string[];
  evidenceIds: string[]; // e.g. ["EV-POST-001"]
}

export interface ContentBioConsistency {
  status: "SUPPORTED" | "PARTIAL" | "UNKNOWN" | "CONTRADICTED";
  matchingTopics: string[];
  discrepancies: string[];
  evidenceIds: string[];
  explanation: string;
}

export interface ProfileScoreDimension {
  name: string;
  category:
    | "Identity Consistency"
    | "Profile Completeness"
    | "Bio Evidence"
    | "External Identity"
    | "Content Consistency"
    | "Highlights"
    | "Advertising"
    | "Behavioural Signals";
  maxScore: number;
  earnedScore: number;
  evidenceIds: string[];
  explanation: string;
  isNeutral: boolean;
}

export interface ProfileInvestigationConfig {
  maxPostsToInspect?: number; // default: 12
  investigateHighlights?: boolean; // default: true
  investigateExternalLinks?: boolean; // default: true
  evidenceSamplingLimits?: {
    maxBioClaims?: number;
    maxLinks?: number;
    maxHighlights?: number;
  };
}

export interface ProfileEvidenceItem {
  id: string; // e.g. "EV-PROFILE-001", "EV-BIO-001", "EV-LINK-001", "EV-POST-001", "EV-HIGHLIGHT-001"
  source: string;
  sourceUrl?: string | null;
  sourceType: string;
  sourceLocation: string;
  observedText: string;
  observedValue?: string | null;
  claim?: string | null;
  evidenceType: string;
  status: "OBSERVED" | "SUPPORTED" | "INFERRED" | "UNVERIFIED" | "CONTRADICTED" | "UNKNOWN" | "UNAVAILABLE";
  confidence: number;
  capturedAt: string;
  trustImpact: number;
  riskImpact: number;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
}

export interface SidePanelDimensionSummary {
  score: number;
  maxScore: number;
  percentage: number;
  evidence: string[];
}

export interface SidePanelPayload {
  profile: {
    username: string;
    displayName?: string | null;
    bio?: string | null;
    profileUrl: string;
    verifiedStatus: "VERIFIED" | "UNVERIFIED" | "UNKNOWN";
  };
  score: number;
  riskLevel: RiskLevel;
  confidence: number;
  evidenceCoverage: number;
  dimensions: {
    identity: SidePanelDimensionSummary;
    bio: SidePanelDimensionSummary;
    content: SidePanelDimensionSummary;
    externalIdentity: SidePanelDimensionSummary;
    advertising: SidePanelDimensionSummary;
  };
  evidence: ProfileEvidenceItem[];
  unknowns: string[];
  warnings: string[];
}

export interface ProfileInvestigation {
  username: string | null;
  profileUrl: string;
  displayName: string | null;
  bio: string | null;
  rawBio: string | null;
  profilePictureUrl: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  verifiedStatus: "VERIFIED" | "UNVERIFIED" | "UNKNOWN";
  accountCategory: string | null;
  externalLinks: ExternalProfileLink[];
  contactInformation: {
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  profileClaims: BioClaim[];
  claimVerifications: BioClaimVerificationResult[];
  highlights: ProfileHighlight[];
  posts: ProfilePostSample[];
  identitySignals: string[];
  contentBioConsistency: ContentBioConsistency;
  evidence: ProfileEvidenceItem[];
  dimensions: ProfileScoreDimension[];
  overallScore: number;
  investigationStatus: "COMPLETED" | "PARTIAL" | "UNAVAILABLE" | "ERROR";
  capturedAt: string;
  sidePanelData: SidePanelPayload;
}
