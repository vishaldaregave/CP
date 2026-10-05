import type {
  InstagramEvidence,
  ProductInfo,
  SellerInfo,
  Claim,
  WebsiteEvidence,
  ConsistencyResult,
  MediaEvidence,
  ImageCrossCheckResult,
  MetaAdEvidence,
  AdClaimAnalysis,
  TrustMatrix,
  RiskAnalysisResult,
  RiskLevel,
} from "./types.ts";

/**
 * Evaluates risk and calculated confidence based on multi-source evidence,
 * normalized trust matrix, and cross-source consistency checks.
 */
export function evaluateRisk(
  evidence: InstagramEvidence,
  product: ProductInfo,
  seller: SellerInfo,
  claims: Claim[],
  website?: WebsiteEvidence | null,
  consistency?: ConsistencyResult | null,
  mediaEvidence?: MediaEvidence | null,
  imageCrossCheck?: ImageCrossCheckResult | null,
  trustMatrix?: TrustMatrix | null,
  metaAd?: MetaAdEvidence | null,
  adClaims?: AdClaimAnalysis | null,
): RiskAnalysisResult {
  const hasCaption = Boolean(evidence.post.caption);
  const hasUsername = Boolean(evidence.account.username);

  // If evidence was not obtainable from Instagram, return UNKNOWN / Insufficient data
  if (!hasCaption && !hasUsername) {
    return {
      risk_level: "UNKNOWN",
      confidence: 0,
      positive_signals: [],
      risk_signals: [],
      missing_information: [
        "Instagram metadata could not be fetched (private post, login wall, or network limitation).",
      ],
      consistency_checks: [],
      recommendation:
        "Do not treat this result as proof that the product is fake. Verify the seller independently before purchasing.",
      explanation: "No meaningful Instagram evidence could be retrieved.",
      evidence_check: {
        instagram: false,
        meta_ad: false,
        website: false,
        product_image: false,
        ocr: false,
      },
    };
  }

  const positive_signals: string[] = [];
  const risk_signals: string[] = [];
  const missing_information: string[] = [
    ...(evidence.missing_information || []),
    ...(trustMatrix?.missing_information || []),
  ];
  const consistency_checks: string[] = [
    ...(consistency?.details || []),
    ...(imageCrossCheck?.details || []),
    ...(adClaims?.pressure_signals.map((p) => `[Ad Pattern] ${p.text} (${p.type})`) || []),
  ];

  // Populate signals from Trust Matrix if available
  if (trustMatrix) {
    for (const ts of trustMatrix.trust_signals) {
      positive_signals.push(ts.signal);
    }
    for (const rs of trustMatrix.risk_signals) {
      risk_signals.push(rs.signal);
    }
  }

  // Fallback / direct signals if trust matrix is not provided
  if (positive_signals.length === 0) {
    if (seller.username) positive_signals.push(`Seller account identified: @${seller.username}`);
    if (product.name) positive_signals.push("Product information found in listing");
    if (website?.status === "accessible") positive_signals.push(`Website accessible (${website.domain})`);
  }

  // Evaluate Evidence Coverage & Independent Corroboration
  const hasWebsite = Boolean(website && website.status === "accessible");
  const hasMedia = evidence.media.length > 0;
  const hasOcr = Boolean(mediaEvidence?.ocr && mediaEvidence.ocr.status !== "failed" && mediaEvidence.ocr.text.length > 0);
  const hasPackagingLicense = Boolean(mediaEvidence?.packaging?.regulatory.license_numbers && mediaEvidence.packaging.regulatory.license_numbers.length > 0);
  const hasIndependentEvidence = hasWebsite || hasPackagingLicense;

  // Calculated Confidence Model based on genuine multi-source coverage
  let confidence = 25; // Base confidence for single Instagram source
  if (hasMedia && hasOcr && !hasWebsite) {
    confidence = 45; // Instagram + Media OCR (sparse, same publisher)
  } else if (hasWebsite && !hasMedia) {
    confidence = 65; // Instagram + Independent Website
  } else if (hasWebsite && (hasMedia || hasOcr)) {
    confidence = 80; // Full multi-source (Social + Independent Store + Packaging)
  }

  // Agreement adjustments
  if (trustMatrix && hasWebsite) {
    if (trustMatrix.fields.brand.result === "MATCH") confidence += 5;
    if (trustMatrix.fields.product_name.result === "MATCH") confidence += 5;
  }

  // Determine Risk Level
  let risk_level: RiskLevel = "UNKNOWN";

  const hasHighRiskSignal = risk_signals.some(
    (s) =>
      s.toLowerCase().includes("mismatch") ||
      s.toLowerCase().includes("replica") ||
      s.toLowerCase().includes("counterfeit") ||
      s.toLowerCase().includes("unreachable"),
  );

  if (hasHighRiskSignal) {
    risk_level = "HIGH";
    confidence = Math.max(confidence, 85); // High confidence in the high-risk verdict
  } else if (risk_signals.length >= 2) {
    risk_level = "HIGH";
    confidence = Math.max(confidence, 80);
  } else if (risk_signals.length === 1) {
    risk_level = "MEDIUM";
    confidence = Math.max(confidence, 60);
  } else if (positive_signals.length >= 2 && risk_signals.length === 0 && hasIndependentEvidence) {
    // LOW risk requires independent website or regulatory evidence
    risk_level = "LOW";
    confidence = Math.min(90, Math.max(70, confidence));
  } else if (positive_signals.length >= 1 && risk_signals.length === 0 && hasIndependentEvidence) {
    risk_level = "LOW";
    confidence = Math.min(80, Math.max(65, confidence));
  } else if (!hasIndependentEvidence && hasMedia && hasOcr) {
    // Instagram + Media/OCR alone without independent external store -> CAUTION / MEDIUM
    risk_level = "MEDIUM";
    confidence = Math.min(50, Math.max(35, confidence));
  } else {
    // Single source (Instagram only, no corroborating independent or OCR evidence)
    risk_level = "UNKNOWN";
    confidence = Math.min(30, confidence);
  }

  // Cap confidence between 10 and 95
  confidence = Math.max(10, Math.min(95, confidence));

  // Recommendation construction
  let recommendation = "";
  if (risk_level === "HIGH") {
    recommendation =
      "High risk detected. Conflicting product/brand evidence or replica indicators were found. Avoid direct wire or advance non-refundable payments.";
  } else if (risk_level === "MEDIUM") {
    if (!hasIndependentEvidence) {
      recommendation =
        "Proceed with caution. Brand/product text matches post media, but no independent web store or registered entity was found. Verify the seller and return policies before making advance payments.";
    } else {
      recommendation =
        "Proceed with caution. Check seller reviews and verify business details independently before purchasing.";
    }
  } else if (risk_level === "LOW") {
    recommendation =
      "Proceed with normal purchasing precautions. Multi-source evidence is consistent across independent platforms.";
  } else {
    recommendation =
      "Only limited single-source evidence was available. Verify the seller and product details independently.";
  }

  const explanation =
    trustMatrix?.summary_explanation ||
    (risk_level === "LOW"
      ? "Multi-source evidence across Instagram and independent web store is broadly consistent."
      : "Multi-source evidence check completed.");

  return {
    risk_level,
    confidence,
    positive_signals: Array.from(new Set(positive_signals)),
    risk_signals: Array.from(new Set(risk_signals)),
    missing_information: Array.from(new Set(missing_information)),
    consistency_checks: Array.from(new Set(consistency_checks)),
    recommendation,
    explanation,
    evidence_check: trustMatrix?.evidence_check || {
      instagram: true,
      website: Boolean(website?.status === "accessible"),
      product_image: evidence.media.length > 0,
      ocr: Boolean(mediaEvidence?.ocr?.text),
    },
    trust_matrix: trustMatrix || undefined,
  };
}
