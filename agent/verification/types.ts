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
  evidenceSource: "meta_ad_library";
}

export interface MetaAdEvidence {
  status: "found" | "not_found" | "unavailable" | "error";
  queryTerms: string[];
  country: string;
  ads: MetaAdRecord[];
  totalFound: number;
  source: "meta_ad_library";
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
