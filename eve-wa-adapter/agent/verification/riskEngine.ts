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
  RiskFactor,
  SellerIdentityGraph,
  ProductConsistencyReport,
  PostPurchaseComparisonResult,
} from "./types.ts";

/**
 * Calculates evidence coverage (0-100%) based on availability of actual investigation sources.
 * Coverage reflects the breadth of available data sources, not confidence or legitimacy.
 */
export function calculateEvidenceCoverage(
  evidence: InstagramEvidence,
  website?: WebsiteEvidence | null,
  mediaEvidence?: MediaEvidence | null,
  metaAd?: MetaAdEvidence | null,
  sellerIdentity?: SellerIdentityGraph | null,
  productConsistency?: ProductConsistencyReport | null,
  postPurchase?: PostPurchaseComparisonResult | null,
): number {
  let availableWeight = 0;
  let totalWeight = 0;

  // 1. Instagram source (Base: 20 pts)
  totalWeight += 20;
  if (evidence.account?.username || evidence.post?.caption || evidence.media?.length > 0) {
    availableWeight += 20;
  }

  // 2. Media / Visual (15 pts)
  totalWeight += 15;
  if (evidence.media && evidence.media.length > 0) {
    availableWeight += 15;
  }

  // 3. OCR (15 pts)
  totalWeight += 15;
  if (mediaEvidence?.ocr && mediaEvidence.ocr.status !== "failed" && mediaEvidence.ocr.text.trim().length > 0) {
    availableWeight += 15;
  }

  // 4. Packaging / Regulatory (10 pts)
  totalWeight += 10;
  if (mediaEvidence?.packaging && (mediaEvidence.packaging.product?.mrp || mediaEvidence.packaging.regulatory?.license_numbers?.length)) {
    availableWeight += 10;
  }

  // 5. Website Investigation (15 pts)
  totalWeight += 15;
  if (website && website.status === "accessible") {
    availableWeight += 15;
  }

  // 6. Meta Ad Library (10 pts)
  totalWeight += 10;
  if (metaAd && metaAd.status === "found") {
    availableWeight += 10;
  }

  // 7. Seller Identity Cross-Check (10 pts)
  totalWeight += 10;
  if (sellerIdentity && sellerIdentity.overallRating !== "UNKNOWN") {
    availableWeight += 10;
  }

  // 8. Product Consistency Cross-Check (5 pts)
  totalWeight += 5;
  if (productConsistency && productConsistency.overallRating !== "UNKNOWN") {
    availableWeight += 5;
  }

  return Math.round((availableWeight / totalWeight) * 100);
}

/**
 * Evaluates risk and calculated confidence based on multi-source evidence,
 * normalized trust matrix, seller identity graph, and cross-source consistency checks.
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
  sellerIdentity?: SellerIdentityGraph | null,
  productConsistency?: ProductConsistencyReport | null,
  postPurchase?: PostPurchaseComparisonResult | null,
): RiskAnalysisResult {
  const hasCaption = Boolean(evidence.post?.caption);
  const hasUsername = Boolean(evidence.account?.username);

  // If evidence was not obtainable from Instagram, return UNKNOWN / Insufficient data
  if (!hasCaption && !hasUsername) {
    return {
      risk_level: "UNKNOWN",
      confidence: 0,
      score: 0,
      evidence_coverage: 0,
      positive_signals: [],
      risk_signals: [],
      risk_factors: [],
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
    ...(adClaims?.pressure_signals?.map((p) => `[Ad Pattern] ${p.text} (${p.type})`) || []),
  ];

  const risk_factors: RiskFactor[] = [];

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

  // ---------------------------------------------------------------------------
  // 1. SELLER IDENTITY RISK FACTORS
  // ---------------------------------------------------------------------------
  if (sellerIdentity) {
    if (sellerIdentity.overallRating === "MATCH") {
      risk_factors.push({
        severity: "positive",
        category: "SELLER_IDENTITY",
        title: "Consistent Seller Identity",
        explanation: "Seller identity is consistent across Instagram, Meta, and website records.",
        evidence: sellerIdentity.summary,
        sources: ["instagram", "seller", "website", "meta_ad"],
      });
    } else if (sellerIdentity.overallRating === "MISMATCH") {
      risk_factors.push({
        severity: "high",
        category: "SELLER_IDENTITY",
        title: "Seller Identity Mismatch",
        explanation: "Instagram and external business records point to conflicting entities.",
        evidence: sellerIdentity.summary,
        sources: ["instagram", "seller", "website"],
      });
      risk_signals.push(`Seller identity mismatch: ${sellerIdentity.summary}`);
    } else if (sellerIdentity.overallRating === "PARTIAL") {
      risk_factors.push({
        severity: "medium",
        category: "SELLER_IDENTITY",
        title: "Partial Identity Match",
        explanation: "Some seller identity details match, but others could not be independently corroborated.",
        evidence: sellerIdentity.summary,
        sources: ["instagram", "seller"],
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 2. ADVERTISING & PRESSURE RISK FACTORS
  // ---------------------------------------------------------------------------
  if (adClaims && adClaims.ad_pressure_signals && adClaims.ad_pressure_signals.length > 0) {
    for (const sig of adClaims.ad_pressure_signals) {
      const isUrgency = sig.type === "urgency" || sig.type === "scarcity";
      const isExtremeDiscount = sig.type === "price_anchoring" || sig.text.includes("90%") || sig.text.includes("80%");
      const severity = isExtremeDiscount ? "medium" : isUrgency ? "medium" : "low";

      risk_factors.push({
        severity,
        category: "ADVERTISING",
        title: isExtremeDiscount ? "Extreme Discount / Price Anchoring" : `${sig.type.toUpperCase()} Pressure Pattern`,
        explanation: sig.meaning || `Advertisement uses promotional pressure: "${sig.text}"`,
        evidence: sig.text,
        sources: [sig.source === "meta_ad" ? "meta_ad" : "instagram"],
      });
    }
  }

  if (metaAd && metaAd.status === "found" && metaAd.ads && metaAd.ads.length > 0) {
    risk_factors.push({
      severity: "positive",
      category: "ADVERTISING",
      title: "Active Meta Advertising History",
      explanation: `Advertiser has run ${metaAd.ads.length} campaign(s) in Meta Ad Library. Note: Ad existence indicates active marketing, not proof of authenticity.`,
      evidence: `Found ${metaAd.ads.length} public ads`,
      sources: ["meta_ad"],
    });
  }

  // ---------------------------------------------------------------------------
  // 3. PRODUCT & CROSS-SOURCE CONSISTENCY RISK FACTORS
  // ---------------------------------------------------------------------------
  if (productConsistency) {
    if (productConsistency.overallRating === "MISMATCH") {
      risk_factors.push({
        severity: "high",
        category: "CROSS_SOURCE",
        title: "Cross-Source Product Information Mismatch",
        explanation: "Product attributes (brand, price, size, or category) conflict across sources.",
        evidence: productConsistency.summary,
        sources: ["instagram", "website", "product_image"],
      });
      risk_signals.push(`Cross-source mismatch: ${productConsistency.summary}`);
    } else if (productConsistency.overallRating === "MATCH") {
      risk_factors.push({
        severity: "positive",
        category: "CROSS_SOURCE",
        title: "Consistent Product Information",
        explanation: "Product details are coherent across Instagram, media OCR, and web store.",
        evidence: productConsistency.summary,
        sources: ["instagram", "website", "product_image"],
      });
    }

    // Specific product-level checks
    const brandField = productConsistency.fields["brand"];
    if (brandField && brandField.rating === "MISMATCH") {
      risk_factors.push({
        severity: "high",
        category: "PRODUCT",
        title: "Brand Inconsistency",
        explanation: brandField.explanation,
        evidence: `Instagram: ${brandField.valuesBySource["instagram"] || "N/A"} vs Website: ${brandField.valuesBySource["website"] || "N/A"}`,
        sources: ["instagram", "website"],
      });
    }

    const priceField = productConsistency.fields["price"];
    if (priceField && priceField.rating === "MISMATCH") {
      risk_factors.push({
        severity: "medium",
        category: "PRICE",
        title: "Price Discrepancy",
        explanation: priceField.explanation,
        evidence: `Instagram: ${priceField.valuesBySource["instagram"] || "N/A"} vs Website: ${priceField.valuesBySource["website"] || "N/A"}`,
        sources: ["instagram", "website"],
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. WEBSITE & BUSINESS PRESENCE RISK FACTORS
  // ---------------------------------------------------------------------------
  if (website && website.status === "accessible") {
    risk_factors.push({
      severity: "positive",
      category: "WEBSITE",
      title: "Verified Web Storefront",
      explanation: `Independent web storefront is online at ${website.domain}.`,
      evidence: website.url,
      sources: ["website"],
    });

    if (website.company?.phone || website.company?.email) {
      risk_factors.push({
        severity: "positive",
        category: "WEBSITE",
        title: "Business Contact Details Present",
        explanation: "Official phone or email support channels are published on the website.",
        evidence: `Phone: ${website.company.phone || "Yes"}, Email: ${website.company.email || "Yes"}`,
        sources: ["website"],
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 5. PACKAGING & REGULATORY RISK FACTORS
  // ---------------------------------------------------------------------------
  if (mediaEvidence?.packaging?.regulatory?.license_numbers && mediaEvidence.packaging.regulatory.license_numbers.length > 0) {
    risk_factors.push({
      severity: "positive",
      category: "PACKAGING",
      title: "Regulatory / License Markings Found",
      explanation: "Packaging visual analysis extracted regulatory or license identifiers.",
      evidence: mediaEvidence.packaging.regulatory.license_numbers.join(", "),
      sources: ["product_image"],
    });
  }

  // ---------------------------------------------------------------------------
  // 6. POST-PURCHASE COMPARISON RISK FACTORS (If provided)
  // ---------------------------------------------------------------------------
  if (postPurchase) {
    if (postPurchase.overallRating === "MISMATCH") {
      risk_factors.push({
        severity: "high",
        category: "POST_PURCHASE",
        title: "Advertised vs Received Product Mismatch",
        explanation: "Delivered product differs materially from the advertised item.",
        evidence: postPurchase.mismatchesDetected.join("; "),
        sources: ["received_product", "instagram"],
      });
      risk_signals.push(`Delivered item mismatch: ${postPurchase.mismatchesDetected.join(", ")}`);
    } else if (postPurchase.overallRating === "MATCH") {
      risk_factors.push({
        severity: "positive",
        category: "POST_PURCHASE",
        title: "Delivered Product Matches Advertisement",
        explanation: "Physical item received matches advertised brand, specifications, and markings.",
        evidence: postPurchase.summary,
        sources: ["received_product", "instagram"],
      });
    }
  }

  // Evaluate Evidence Coverage & Independent Corroboration
  const hasWebsite = Boolean(website && website.status === "accessible");
  const hasMedia = evidence.media.length > 0;
  const hasOcr = Boolean(mediaEvidence?.ocr && mediaEvidence.ocr.status !== "failed" && mediaEvidence.ocr.text.length > 0);
  const hasPackagingLicense = Boolean(
    mediaEvidence?.packaging?.regulatory.license_numbers && mediaEvidence.packaging.regulatory.license_numbers.length > 0,
  );
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
    if (trustMatrix.fields.brand?.result === "MATCH") confidence += 5;
    if (trustMatrix.fields.product_name?.result === "MATCH") confidence += 5;
  }

  // Determine Risk Level & Score (0-100)
  let risk_level: RiskLevel = "UNKNOWN";
  let score = 30; // Base baseline score

  const hasHighRiskSignal = risk_signals.some(
    (s) =>
      s.toLowerCase().includes("mismatch") ||
      s.toLowerCase().includes("replica") ||
      s.toLowerCase().includes("counterfeit") ||
      s.toLowerCase().includes("unreachable"),
  );

  if (hasHighRiskSignal) {
    risk_level = "HIGH";
    score = 85;
    confidence = Math.max(confidence, 85);
  } else if (risk_signals.length >= 2) {
    risk_level = "HIGH";
    score = 75;
    confidence = Math.max(confidence, 80);
  } else if (risk_signals.length === 1) {
    risk_level = "MEDIUM";
    score = 55;
    confidence = Math.max(confidence, 60);
  } else if (positive_signals.length >= 2 && risk_signals.length === 0 && hasIndependentEvidence) {
    risk_level = "LOW";
    score = 15;
    confidence = Math.min(90, Math.max(70, confidence));
  } else if (positive_signals.length >= 1 && risk_signals.length === 0 && hasIndependentEvidence) {
    risk_level = "LOW";
    score = 22;
    confidence = Math.min(80, Math.max(65, confidence));
  } else if (!hasIndependentEvidence && hasMedia && hasOcr) {
    risk_level = "MEDIUM";
    score = 45;
    confidence = Math.min(50, Math.max(35, confidence));
  } else {
    risk_level = "UNKNOWN";
    score = 30;
    confidence = Math.min(30, confidence);
  }

  // Post-purchase override if severe mismatch
  if (postPurchase && postPurchase.overallRating === "MISMATCH") {
    risk_level = "HIGH";
    score = Math.max(score, 88);
    confidence = Math.max(confidence, 90);
  }

  // Cap confidence between 10 and 95
  confidence = Math.max(10, Math.min(95, confidence));
  score = Math.max(0, Math.min(100, score));

  // Calculate Evidence Coverage
  const evidence_coverage = calculateEvidenceCoverage(
    evidence,
    website,
    mediaEvidence,
    metaAd,
    sellerIdentity,
    productConsistency,
    postPurchase,
  );

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
    score,
    evidence_coverage,
    positive_signals: Array.from(new Set(positive_signals)),
    risk_signals: Array.from(new Set(risk_signals)),
    risk_factors,
    missing_information: Array.from(new Set(missing_information)),
    consistency_checks: Array.from(new Set(consistency_checks)),
    recommendation,
    explanation,
    evidence_check: trustMatrix?.evidence_check || {
      instagram: true,
      meta_ad: Boolean(metaAd && metaAd.status === "found"),
      website: Boolean(website?.status === "accessible"),
      product_image: evidence.media.length > 0,
      ocr: Boolean(mediaEvidence?.ocr?.text),
      received_product: Boolean(postPurchase),
    },
    trust_matrix: trustMatrix || undefined,
  };
}
