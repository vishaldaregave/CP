import type { VerificationResult, RiskLevel } from "./types.ts";

function getRiskBadge(level: RiskLevel): string {
  switch (level) {
    case "LOW":
      return "🟢 RISK: LOW";
    case "MEDIUM":
      return "🟠 RISK: MEDIUM";
    case "HIGH":
      return "🔴 RISK: HIGH";
    case "INSUFFICIENT_EVIDENCE":
    case "UNKNOWN":
    default:
      return "⚪ RISK: UNKNOWN";
  }
}

/**
 * Formats the VerificationResult into the complete Veriqoo multi-source trust check layout.
 */
export function formatVerificationResult(result: VerificationResult, reportId?: string): string {
  if (result.status === "INSUFFICIENT_EVIDENCE") {
    const reason =
      result.failure_reason ||
      result.evidence.errors[0] ||
      result.evidence.missing_information[0] ||
      "Post is private, deleted, or requires login to access.";

    return [
      "🔍 PRODUCT VERIFICATION",
      "",
      "Status: ⚪ INSUFFICIENT EVIDENCE",
      "",
      "I could not collect enough Instagram evidence to verify this product.",
      "",
      "Reason:",
      reason,
      "",
      "━━━━━━━━━━━━━━━━━━",
      "",
      "Recommendation:",
      "Do not treat this result as proof that the product is fake. Verify the seller independently before purchasing.",
    ].join("\n");
  }

  const {
    product,
    seller,
    risk,
    evidence,
    meta_ad_evidence,
    website_evidence,
    media_evidence,
    seller_identity_graph,
    product_consistency,
    ad_claim_analysis,
  } = result;

  const productName = product.name || media_evidence?.packaging?.product.name || "Instagram Product / Item";
  const brandName =
    product.brand ||
    media_evidence?.packaging?.product.brand ||
    (evidence.account?.username ? `@${evidence.account.username}` : "Unspecified");

  const evidenceCheck = risk.evidence_check || {
    instagram: true,
    meta_ad: Boolean(meta_ad_evidence?.status === "found"),
    website: Boolean(website_evidence?.status === "accessible"),
    product_image: evidence.media.length > 0,
    ocr: Boolean(media_evidence?.ocr?.status === "success" || media_evidence?.ocr?.status === "partial"),
  };

  const lines: string[] = [
    "🔍 PRODUCT VERIFICATION",
    "🔍 VERIQOO TRUST CHECK",
    "",
    "Product:",
    productName,
    "",
    "Brand:",
    brandName,
    "",
    "Seller:",
    seller.username ? `@${seller.username}` : seller.name || "Unspecified",
    "",
    "━━━━━━━━━━━━━━━━━━",
    "",
    getRiskBadge(risk.risk_level),
    "",
    "Confidence:",
    `${risk.confidence}%`,
    "",
    `Evidence Coverage: ${risk.evidence_coverage ?? 75}%`,
    "",
    "━━━━━━━━━━━━━━━━━━",
    "",
    "🔎 EVIDENCE CHECK",
    "",
    `Instagram      ${evidenceCheck.instagram ? "✅" : "⚪"}`,
    `Meta Ad        ${evidenceCheck.meta_ad ? "✅" : "⚪"}`,
    `Website        ${evidenceCheck.website ? "✅" : "⚪"}`,
    `Product Image  ${evidenceCheck.product_image ? "✅" : "⚪"}`,
    `OCR            ${evidenceCheck.ocr ? "✅" : "⚪"}`,
  ];

  // 1. SELLER IDENTITY
  if (seller_identity_graph) {
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("👤 SELLER IDENTITY");
    if (seller_identity_graph.overallRating === "MATCH") {
      lines.push("✓ MATCH");
    } else if (seller_identity_graph.overallRating === "PARTIAL") {
      lines.push("⚠️ PARTIAL MATCH");
    } else if (seller_identity_graph.overallRating === "MISMATCH") {
      lines.push("🔴 MISMATCH");
    } else {
      lines.push("⚪ UNVERIFIED");
    }
  }

  // 2. META AD LIBRARY & ADVERTISING INTELLIGENCE
  const adIntel = result.advertising_intelligence;
  if (adIntel || meta_ad_evidence) {
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("📢 META ADVERTISING");
    lines.push("📢 META AD LIBRARY");

    if (adIntel && adIntel.status === "FOUND") {
      lines.push("Status: FOUND");
      lines.push("✓ Ad evidence found");
      if (adIntel.advertiserIdentity) {
        lines.push(`Advertiser: ${adIntel.advertiserIdentity}`);
      }
      lines.push(`Ads found: ${adIntel.totalAdsDiscovered}`);
      if (adIntel.activeAdCount > 0 || adIntel.historicalAdCount > 0) {
        lines.push(`Campaigns: ${adIntel.activeAdCount} active, ${adIntel.historicalAdCount} historical`);
      }
      if (adIntel.advertisingSpan && adIntel.advertisingSpan !== "HISTORY_UNAVAILABLE") {
        lines.push(`Ad Span: ${adIntel.advertisingSpan}`);
      }
      if (adIntel.advertiserMatch?.rating) {
        lines.push(`Advertiser Match: ${adIntel.advertiserMatch.rating}`);
      }
      if (adIntel.destinationAnalysis?.hasDomainAnomaly) {
        lines.push("⚠️ DOMAIN ANOMALY detected in destination URLs");
      }
      if (adIntel.instagramCorrelation?.isAnomaly) {
        lines.push(`⚠️ ${adIntel.instagramCorrelation.result}`);
      }

      if (ad_claim_analysis?.price_anchoring_claims?.length) {
        for (const claim of ad_claim_analysis.price_anchoring_claims.slice(0, 2)) {
          lines.push(`⚠️ ${claim}`);
        }
      }
      if (ad_claim_analysis?.authenticity_claims?.length) {
        for (const claim of ad_claim_analysis.authenticity_claims.slice(0, 2)) {
          lines.push(`⚠️ "${claim}"`);
        }
      }
      if (ad_claim_analysis?.urgency_claims?.length) {
        lines.push("⚠️ Urgency language detected");
      }
    } else if (meta_ad_evidence && meta_ad_evidence.status === "found") {
      lines.push("Status: FOUND");
      lines.push("✓ Ad evidence found");
      if (meta_ad_evidence.advertiserName) {
        lines.push(`Advertiser: ${meta_ad_evidence.advertiserName}`);
      }
      lines.push(`Ads found: ${meta_ad_evidence.totalFound || meta_ad_evidence.ads?.length || 1}`);

      if (ad_claim_analysis?.price_anchoring_claims?.length) {
        for (const claim of ad_claim_analysis.price_anchoring_claims.slice(0, 2)) {
          lines.push(`⚠️ ${claim}`);
        }
      }
      if (ad_claim_analysis?.authenticity_claims?.length) {
        for (const claim of ad_claim_analysis.authenticity_claims.slice(0, 2)) {
          lines.push(`⚠️ "${claim}"`);
        }
      }
      if (ad_claim_analysis?.urgency_claims?.length) {
        lines.push("⚠️ Urgency language detected");
      }
    } else if (meta_ad_evidence?.status === "unavailable" || meta_ad_evidence?.status === "error" || adIntel?.status === "UNAVAILABLE" || adIntel?.status === "ERROR") {
      lines.push("Status: UNAVAILABLE");
      lines.push("⚪ Library search unavailable (no risk penalty)");
    } else {
      lines.push("Status: NOT FOUND");
      lines.push("⚪ No active public ads found (no risk penalty)");
    }
  }

  // 3. WEBSITE
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("🌐 WEBSITE");
  if (website_evidence?.status === "accessible") {
    lines.push(`✓ Found (${website_evidence.domain || "Storefront"})`);
    if (website_evidence.company?.phone || website_evidence.company?.email) {
      lines.push("✓ Contact details present");
    }
  } else {
    lines.push("⚪ No independent storefront found");
  }

  // 4. PRODUCT CONSISTENCY
  if (product_consistency) {
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("📦 PRODUCT");
    if (product_consistency.overallRating === "MATCH") {
      lines.push("✓ Product information consistent across sources");
    } else if (product_consistency.overallRating === "PARTIAL") {
      lines.push("⚠️ Partial consistency across sources");
    } else if (product_consistency.overallRating === "MISMATCH") {
      lines.push("⚠️ Product information inconsistent");
    } else {
      lines.push("⚪ Single-source product details");
    }
  }

  // 5. TRUST SIGNALS
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("✅ TRUST SIGNALS");
  lines.push("");
  if (risk.positive_signals && risk.positive_signals.length > 0) {
    for (const sig of risk.positive_signals.slice(0, 5)) {
      lines.push(`• ${sig}`);
    }
  } else {
    lines.push("• Single-source listing (no multi-platform corroboration)");
  }

  // 6. RISK SIGNALS
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("⚠️ RISK SIGNALS");
  lines.push("");
  if (risk.risk_signals && risk.risk_signals.length > 0) {
    for (const rs of risk.risk_signals) {
      lines.push(`• ${rs}`);
    }
  } else {
    lines.push("• None detected");
  }

  // 7. MISSING INFORMATION
  if (risk.missing_information && risk.missing_information.length > 0) {
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("❓ MISSING INFORMATION");
    lines.push("");
    for (const m of risk.missing_information.slice(0, 3)) {
      lines.push(`• ${m}`);
    }
  }

  // 8. WHY? / EXPLANATION
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("💡 WHY?");
  lines.push("");
  lines.push(risk.explanation || "Evidence-based multi-source verification completed.");

  // 9. RECOMMENDATION
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("RECOMMENDATION");
  lines.push("");
  lines.push(risk.recommendation);

  // 10. POST-PURCHASE HOOK
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("📦 DID YOU RECEIVE THE PRODUCT?");
  lines.push("");
  lines.push("Send a clear photo if you want a post-purchase comparison.");

  // 11. DETAILED EVIDENCE REPORT
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("📄 Detailed Evidence Report");
  if (reportId) {
    lines.push(`• Report ID: ${reportId}`);
    lines.push("• Document attached below");
  }

  return lines.join("\n");
}
