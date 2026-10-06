import * as fs from "node:fs";
import * as path from "node:path";
import type {
  VerificationResult,
  RiskLevel,
  SourceType,
  RiskFactor,
  AdvertisingIntelligence,
  AdEvidenceItem,
  AdvertiserIdentityMatchRating,
  ProfileInvestigation,
  BioClaim,
  BioClaimVerificationResult,
  ExternalProfileLink,
  ProfileHighlight,
  ProfilePostSample,
  ProfileEvidenceItem,
  ProfileScoreDimension,
} from "./types.ts";
import type { VerificationReportData, GeneratedReport } from "./reportTypes.ts";
import { buildProfileInvestigationFromEvidence } from "./profileInvestigator.ts";

/**
 * Escapes dynamic string for safe HTML injection.
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return "";
  const text = String(str);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateReportId(): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `REP-${timestamp}-${randomSuffix}`.toUpperCase();
}

function formatProvenanceBadge(source: SourceType | string): string {
  const s = String(source).toUpperCase().replace(/_/g, " ");
  let bg = "#f1f5f9";
  let color = "#475569";

  if (s.includes("INSTAGRAM") || s.includes("BIO")) {
    bg = "#fdf2f8";
    color = "#db2777";
  } else if (s.includes("META") || s.includes("AD") || s.includes("APIFY")) {
    bg = "#eff6ff";
    color = "#2563eb";
  } else if (s.includes("WEBSITE") || s.includes("WEB")) {
    bg = "#ecfdf5";
    color = "#059669";
  } else if (s.includes("OCR") || s.includes("PACKAGING") || s.includes("PRODUCT IMAGE")) {
    bg = "#fef3c7";
    color = "#d97706";
  } else if (s.includes("RECEIVED") || s.includes("POST PURCHASE")) {
    bg = "#fae8ff";
    color = "#9333ea";
  } else if (s.includes("LINK") || s.includes("GITHUB") || s.includes("LINKEDIN")) {
    bg = "#e0e7ff";
    color = "#4338ca";
  }

  return `<span class="source-tag" style="background: ${bg}; color: ${color}; font-size: 11px; padding: 2px 7px; border-radius: 4px; font-weight: 600; text-transform: uppercase;">${escapeHtml(s)}</span>`;
}

function formatResultBadge(rating: string): string {
  switch (rating) {
    case "MATCH":
    case "SUPPORTED":
    case "CONSISTENT":
      return `<span class="badge badge-success">✓ ${escapeHtml(rating)}</span>`;
    case "PARTIAL":
    case "PARTIAL_MATCH":
      return `<span class="badge badge-warning">~ ${escapeHtml(rating)}</span>`;
    case "MISMATCH":
    case "CONTRADICTED":
    case "INCONSISTENT":
      return `<span class="badge badge-danger">✕ ${escapeHtml(rating)}</span>`;
    case "OBSERVED":
      return `<span class="badge badge-info" style="background: #e0f2fe; color: #0369a1;">👁 OBSERVED</span>`;
    case "UNVERIFIED":
      return `<span class="badge badge-neutral" style="background: #f1f5f9; color: #475569;">⚪ UNVERIFIED</span>`;
    case "DOMAIN_ANOMALY":
      return `<span class="badge badge-warning">⚠️ DOMAIN ANOMALY</span>`;
    case "CONTENT_AD_MATCH":
      return `<span class="badge badge-success">✓ CONTENT MATCH</span>`;
    case "PROFILE_AD_MISMATCH":
      return `<span class="badge badge-danger">⚠️ PROFILE MISMATCH</span>`;
    default:
      return `<span class="badge badge-neutral">— ${escapeHtml(rating || "UNKNOWN")}</span>`;
  }
}

function formatAdvertiserBadge(rating?: AdvertiserIdentityMatchRating | string): string {
  switch (rating) {
    case "MATCH":
      return `<span class="badge badge-success">🟢 MATCH</span>`;
    case "PARTIAL_MATCH":
    case "PARTIAL":
      return `<span class="badge badge-warning">🟠 PARTIAL</span>`;
    case "MISMATCH":
      return `<span class="badge badge-danger">🔴 MISMATCH</span>`;
    default:
      return `<span class="badge badge-neutral">⚪ UNKNOWN</span>`;
  }
}

function formatConsistencyLevelBadge(level?: string): string {
  switch (level) {
    case "HIGH":
      return `<span class="badge badge-success">🟢 HIGH</span>`;
    case "MEDIUM":
      return `<span class="badge badge-warning">🟠 MEDIUM</span>`;
    case "LOW":
      return `<span class="badge badge-danger">🔴 LOW</span>`;
    case "DOMAIN_ANOMALY":
      return `<span class="badge badge-warning">⚠️ ANOMALY</span>`;
    default:
      return `<span class="badge badge-neutral">⚪ UNKNOWN</span>`;
  }
}

function formatRiskBadge(level: RiskLevel): string {
  switch (level) {
    case "LOW":
      return `<span class="badge badge-risk-low">🟢 LOW RISK</span>`;
    case "MEDIUM":
      return `<span class="badge badge-risk-medium">🟠 MEDIUM RISK</span>`;
    case "HIGH":
      return `<span class="badge badge-risk-high">🔴 HIGH RISK</span>`;
    case "INSUFFICIENT_EVIDENCE":
    case "UNKNOWN":
    default:
      return `<span class="badge badge-risk-unknown">⚪ UNKNOWN RISK</span>`;
  }
}

/**
 * Extracts structured report data from VerificationResult.
 */
export function buildReportData(result: VerificationResult): VerificationReportData {
  const report_id = generateReportId();
  const generated_at = new Date().toISOString();

  const source_overview: {
    instagram: "AVAILABLE" | "UNAVAILABLE";
    meta_ad: "AVAILABLE" | "UNAVAILABLE";
    website: "AVAILABLE" | "UNAVAILABLE";
    product_image: "AVAILABLE" | "UNAVAILABLE";
    ocr: "AVAILABLE" | "UNAVAILABLE";
  } = {
    instagram: (result.evidence?.post?.caption || result.evidence?.account?.username) ? "AVAILABLE" : "UNAVAILABLE",
    meta_ad: ((result.meta_ad_evidence && result.meta_ad_evidence.status === "found") || (result.advertising_intelligence && result.advertising_intelligence.status === "FOUND")) ? "AVAILABLE" : "UNAVAILABLE",
    website: (result.website_evidence && result.website_evidence.status === "accessible") ? "AVAILABLE" : "UNAVAILABLE",
    product_image: (result.evidence?.media && result.evidence.media.length > 0) ? "AVAILABLE" : "UNAVAILABLE",
    ocr: (result.media_evidence?.ocr && result.media_evidence.ocr.status !== "failed" && result.media_evidence.ocr.text.length > 0) ? "AVAILABLE" : "UNAVAILABLE",
  };

  const product = {
    name: result.product?.name || result.media_evidence?.packaging?.product.name || null,
    brand: result.product?.brand || result.media_evidence?.packaging?.product.brand || null,
    category: result.product?.category || result.media_evidence?.packaging?.product.category || null,
    price: result.product?.price || result.media_evidence?.packaging?.product.price || null,
    mrp: result.media_evidence?.packaging?.product.mrp || null,
  };

  const seller = {
    username: result.seller?.username || result.evidence?.account?.username || null,
    name: result.seller?.name || result.evidence?.account?.display_name || result.website_evidence?.company.name || null,
    website: result.seller?.website || result.website_evidence?.url || null,
    contact: result.seller?.contact || result.website_evidence?.company.email || result.website_evidence?.company.phone || null,
    address: result.website_evidence?.company.address || result.media_evidence?.packaging?.manufacturer.address || null,
  };

  const policiesFound: string[] = [];
  if (result.website_evidence?.policies.refund) policiesFound.push("Refund");
  if (result.website_evidence?.policies.return) policiesFound.push("Return");
  if (result.website_evidence?.policies.shipping) policiesFound.push("Shipping");
  if (result.website_evidence?.policies.privacy) policiesFound.push("Privacy");
  if (result.website_evidence?.policies.terms) policiesFound.push("Terms");

  const evidence = {
    instagram: {
      available: source_overview.instagram === "AVAILABLE",
      caption: result.evidence?.post?.caption || null,
      timestamp: result.evidence?.post?.timestamp || null,
      external_links: result.evidence?.external_links || [],
      evidence_count: result.evidence?.evidence?.length || 0,
    },
    meta_ad: {
      available: source_overview.meta_ad === "AVAILABLE",
      status: result.meta_ad_evidence?.status || (result.advertising_intelligence?.status === "FOUND" ? "found" : "unavailable"),
      library_id: result.meta_ad_evidence?.libraryId || null,
      advertiser: result.meta_ad_evidence?.advertiserName || result.advertising_intelligence?.advertiserIdentity || null,
    },
    website: {
      available: source_overview.website === "AVAILABLE",
      domain: result.website_evidence?.domain || null,
      company_name: result.website_evidence?.company.name || null,
      policies_found: policiesFound,
    },
    product_image: {
      available: source_overview.product_image === "AVAILABLE",
      image_count: result.evidence?.media?.length || 0,
      analyzed: result.media_evidence?.status === "analyzed",
    },
    ocr: {
      available: source_overview.ocr === "AVAILABLE",
      status: result.media_evidence?.ocr?.status || "none",
      confidence: result.media_evidence?.ocr?.confidence || 0,
      text_snippet: result.media_evidence?.ocr?.text ? result.media_evidence.ocr.text.slice(0, 300) : null,
    },
  };

  const executive_finding =
    result.risk?.explanation ||
    result.trust_matrix?.summary_explanation ||
    "Multi-source investigation completed based on available public profile and evidence sources.";

  const consistency_matrix = result.trust_matrix?.fields || {};
  const trust_signals = result.trust_matrix?.trust_signals || result.risk?.positive_signals.map((s) => ({ signal: s, severity: "positive" as const, sources: ["instagram" as const] })) || [];
  const risk_signals = result.trust_matrix?.risk_signals || result.risk?.risk_signals.map((s) => ({ signal: s, severity: "high" as const, sources: ["instagram" as const] })) || [];
  const missing_information = result.risk?.missing_information || result.trust_matrix?.missing_information || [];
  const traceable_conclusions = result.trust_matrix?.traceable_conclusions || [];
  const recommendation = result.risk?.recommendation || "Verify seller before purchasing or engaging in transactions.";
  const disclaimer = "This verification is an evidence-based assessment and is not a guarantee of product authenticity, seller legitimacy, or legal compliance.";

  return {
    report_id,
    generated_at,
    source: {
      instagram_url: result.evidence?.source?.url || "",
      website_url: seller.website,
    },
    product,
    seller,
    risk: {
      level: result.risk?.risk_level || "UNKNOWN",
      confidence: result.risk?.confidence ?? 0,
    },
    evidence,
    meta_ad_details: result.meta_ad_evidence || null,
    advertising_intelligence: result.advertising_intelligence || null,
    ad_claim_analysis: result.ad_claim_analysis || null,
    source_overview,
    executive_finding,
    consistency_matrix,
    trust_signals,
    risk_signals,
    missing_information,
    traceable_conclusions,
    recommendation,
    disclaimer,
  };
}

/**
 * Builds self-contained HTML report with all 18 standardized sections in exact required order.
 */
export function buildReportHtml(data: VerificationReportData, rawResult: VerificationResult): string {
  // Ensure profile investigation is populated
  const profileInv: ProfileInvestigation =
    rawResult.profile_investigation ||
    buildProfileInvestigationFromEvidence(
      rawResult.evidence,
      rawResult.meta_ad_evidence,
      rawResult.website_evidence,
      rawResult.advertising_intelligence,
      rawResult.seller_identity_graph,
    );

  const packaging = rawResult.media_evidence?.packaging;
  const sellerGraph = rawResult.seller_identity_graph;
  const productConsistency = rawResult.product_consistency;
  const adIntel = rawResult.advertising_intelligence;

  // 1. Investigation Summary HTML
  const overallTrustScore = profileInv.overallScore;
  const confidenceScore = data.risk?.confidence ?? profileInv.sidePanelData.confidence;
  const coveragePercent = rawResult.risk?.evidence_coverage ?? profileInv.sidePanelData.evidenceCoverage;
  const finalRiskLevel = data.risk?.level ?? profileInv.sidePanelData.riskLevel;

  // 2. Profile Overview HTML
  const profileUsername = profileInv.username ? `@${profileInv.username}` : (data.seller.username ? `@${data.seller.username}` : "@unknown");
  const profileDisplayName = profileInv.displayName || data.seller.name || "Not specified";
  const profileVerified = profileInv.verifiedStatus;
  const followerDisplay = profileInv.followerCount !== null ? profileInv.followerCount.toLocaleString() : "Public / Unlisted";
  const postCountDisplay = profileInv.postCount !== null ? profileInv.postCount.toString() : `${profileInv.posts.length} sampled`;

  const productNameDisplay = data.product.name ? escapeHtml(data.product.name) : "Not available";
  const brandNameDisplay = data.product.brand ? escapeHtml(data.product.brand) : "Unspecified";

  // 3. Raw Bio HTML
  const rawBioHtml = profileInv.rawBio
    ? `<div class="raw-bio-box" style="white-space: pre-wrap; font-family: monospace; background: #0f172a; color: #38bdf8; padding: 16px 20px; border-radius: 8px; font-size: 14px; line-height: 1.6; border: 1px solid #1e293b;">${escapeHtml(profileInv.rawBio)}</div>`
    : `<div class="empty-text">No bio text publicly visible on this profile.</div>`;

  // 4. Bio Claim Extraction HTML
  let bioClaimsHtml = "";
  if (profileInv.profileClaims.length > 0) {
    bioClaimsHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Evidence ID</th>
            <th>Claim Type</th>
            <th>Observed Bio Text</th>
            <th>Normalized Value</th>
            <th>Status</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          ${profileInv.profileClaims.map((claim: BioClaim) => `
            <tr>
              <td style="font-family: monospace; font-weight: 700; color: #db2777;">${escapeHtml(claim.evidenceId)}</td>
              <td><span class="source-tag" style="background: #fdf2f8; color: #be185d; font-weight: 700;">${escapeHtml(claim.claimType)}</span></td>
              <td class="font-semibold">"${escapeHtml(claim.claimText)}"</td>
              <td style="color: #334155;">${escapeHtml(claim.normalizedValue)}</td>
              <td>${formatResultBadge(claim.status)}</td>
              <td>${claim.confidence}%</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else {
    bioClaimsHtml = `<div class="empty-text">No distinct structured claims extracted from profile bio.</div>`;
  }

  // 5. Bio Claim Verification HTML
  let bioVerificationHtml = "";
  if (profileInv.claimVerifications.length > 0) {
    bioVerificationHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Claim</th>
            <th>Verification Status</th>
            <th>Sources Checked</th>
            <th>Corroborating Evidence IDs</th>
            <th>Explanation</th>
          </tr>
        </thead>
        <tbody>
          ${profileInv.claimVerifications.map((v: BioClaimVerificationResult) => `
            <tr>
              <td>
                <div style="font-family: monospace; font-size: 11px; color: #db2777;">${escapeHtml(v.claim.evidenceId)}</div>
                <div class="font-semibold" style="margin-top: 2px;">"${escapeHtml(v.claim.claimText)}"</div>
              </td>
              <td>${formatResultBadge(v.status)}</td>
              <td style="font-size: 12px; color: #475569;">${escapeHtml(v.checkedSources.join(", ") || "Instagram Bio")}</td>
              <td style="font-family: monospace; font-size: 12px; color: #2563eb;">
                ${v.matchingEvidenceIds.length > 0 ? v.matchingEvidenceIds.map((id) => escapeHtml(id)).join(", ") : "—"}
              </td>
              <td style="font-size: 13px; color: #334155;">${escapeHtml(v.explanation)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else {
    bioVerificationHtml = `<div class="empty-text">No bio claims available for independent multi-source verification.</div>`;
  }

  // 6. External Links HTML
  let externalLinksHtml = "";
  if (profileInv.externalLinks.length > 0) {
    externalLinksHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Evidence ID</th>
            <th>Platform</th>
            <th>Domain</th>
            <th>Observed URL</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${profileInv.externalLinks.map((link: ExternalProfileLink) => `
            <tr>
              <td style="font-family: monospace; font-weight: 700; color: #4338ca;">${escapeHtml(link.evidenceId)}</td>
              <td><span class="source-tag" style="background: #e0e7ff; color: #4338ca; font-weight: 700;">${escapeHtml(link.platform.toUpperCase())}</span></td>
              <td class="font-semibold">${escapeHtml(link.domain)}</td>
              <td><a href="${escapeHtml(link.normalizedUrl)}" target="_blank" rel="noopener noreferrer" style="color: #0284c7; text-decoration: underline; font-size: 13px;">${escapeHtml(link.originalUrl)}</a></td>
              <td style="font-size: 12px; color: #64748b;">${escapeHtml(link.source)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else {
    externalLinksHtml = `<div class="empty-text">No external URLs or third-party platform links found on profile.</div>`;
  }

  // 7. Identity Graph HTML
  let identityGraphHtml = "";
  if (sellerGraph && sellerGraph.relationships.length > 0) {
    identityGraphHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Source Entity</th>
            <th>Target Entity</th>
            <th>Relationship Type</th>
            <th>Verdict</th>
            <th>Confidence</th>
            <th>Explanation</th>
          </tr>
        </thead>
        <tbody>
          ${sellerGraph.relationships.map((rel) => `
            <tr>
              <td>${formatProvenanceBadge(rel.source)} <div style="font-size: 13px; font-weight: 600; margin-top: 2px;">${escapeHtml(rel.sourceValue)}</div></td>
              <td>${formatProvenanceBadge(rel.targetSource)} <div style="font-size: 13px; font-weight: 600; margin-top: 2px;">${escapeHtml(rel.targetValue)}</div></td>
              <td>${escapeHtml(rel.type)}</td>
              <td>${formatResultBadge(rel.rating)}</td>
              <td>${rel.confidence}%</td>
              <td style="font-size: 13px; color: #475569;">${escapeHtml(rel.explanation)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div style="margin-top: 12px; font-size: 13px; color: #64748b;">
        <strong>Identity Verdict:</strong> ${escapeHtml(sellerGraph.summary)}
      </div>
    `;
  } else {
    identityGraphHtml = `<div class="empty-text">Identity graph compiled based on public Instagram handle.</div>`;
  }

  // 8. Highlights Investigation HTML
  let highlightsHtml = "";
  const accessibleHls = profileInv.highlights.filter((h) => h.status === "ACCESSIBLE");
  if (accessibleHls.length > 0) {
    highlightsHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Evidence ID</th>
            <th>Highlight Title</th>
            <th>Category</th>
            <th>Observed Stories / Content</th>
            <th>Extracted Entities &amp; Proof</th>
          </tr>
        </thead>
        <tbody>
          ${accessibleHls.map((hl: ProfileHighlight) => `
            <tr>
              <td style="font-family: monospace; font-weight: 700; color: #0284c7;">${escapeHtml(hl.evidenceIds[0] || "EV-HL-001")}</td>
              <td class="font-semibold">${escapeHtml(hl.title)}</td>
              <td><span class="source-tag" style="background: #f0fdf4; color: #166534;">${escapeHtml(hl.category)}</span></td>
              <td style="font-size: 13px; color: #334155;">${escapeHtml(hl.visibleContent.join(", "))}</td>
              <td style="font-size: 12px; color: #64748b;">${escapeHtml(hl.extractedClaims.join("; ") || "Verified story item")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else {
    highlightsHtml = `<div class="empty-text">Highlights status: <strong>HIGHLIGHTS_UNAVAILABLE</strong> (neutral — private, unarchived, or not publicly exposed).</div>`;
  }

  // 9. Content Investigation HTML
  let contentHtml = "";
  if (profileInv.posts.length > 0) {
    contentHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Evidence ID</th>
            <th>Media</th>
            <th>Caption Snippet</th>
            <th>Topics &amp; Hashtags</th>
            <th>Commercial Signals</th>
          </tr>
        </thead>
        <tbody>
          ${profileInv.posts.map((p: ProfilePostSample) => `
            <tr>
              <td style="font-family: monospace; font-weight: 700; color: #2563eb;">${escapeHtml(p.evidenceIds[0])}</td>
              <td><span class="source-tag" style="background: #f1f5f9; color: #0f172a;">${escapeHtml(p.mediaType.toUpperCase())}</span></td>
              <td style="font-size: 13px; color: #334155;">${escapeHtml(p.caption ? p.caption.slice(0, 120) + (p.caption.length > 120 ? "..." : "") : "No caption")}</td>
              <td style="font-size: 12px; color: #475569;">
                <div><strong>Topics:</strong> ${escapeHtml(p.topics.join(", ") || "lifestyle")}</div>
                ${p.hashtags.length > 0 ? `<div style="color: #0284c7; margin-top: 2px;">#${escapeHtml(p.hashtags.slice(0, 4).join(" #"))}</div>` : ""}
              </td>
              <td style="font-size: 12px; color: #64748b;">${escapeHtml(p.commercialSignals.join(", ") || "None")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else {
    contentHtml = `<div class="empty-text">No public post samples available in this investigation run.</div>`;
  }

  // 10. Cross-Source Consistency HTML
  let crossSourceConsistencyHtml = `
    <div style="margin-bottom: 14px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
      <div style="font-weight: 600; font-size: 14px; color: #0f172a;">Content &harr; Bio Consistency: ${formatResultBadge(profileInv.contentBioConsistency.status)}</div>
      <div style="font-size: 13px; color: #475569; margin-top: 4px;">${escapeHtml(profileInv.contentBioConsistency.explanation)}</div>
      ${profileInv.contentBioConsistency.matchingTopics.length > 0 ? `
        <div style="margin-top: 8px; font-size: 12px; color: #166534;"><strong>Matching Topics:</strong> ${escapeHtml(profileInv.contentBioConsistency.matchingTopics.join(", "))}</div>
      ` : ""}
    </div>
  `;

  if (productConsistency) {
    const fields = Object.values(productConsistency.fields);
    crossSourceConsistencyHtml += `
      <table class="data-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Values Across Sources</th>
            <th>Status</th>
            <th>Explanation</th>
          </tr>
        </thead>
        <tbody>
          ${fields.map((f) => `
            <tr>
              <td class="font-semibold">${escapeHtml(f.field.toUpperCase())}</td>
              <td>
                ${Object.entries(f.valuesBySource).map(([src, val]) => `
                  <div style="margin-bottom: 4px;">${formatProvenanceBadge(src)} <span style="font-size: 13px;">${escapeHtml(val || "N/A")}</span></div>
                `).join("")}
              </td>
              <td>${formatResultBadge(f.rating)}</td>
              <td style="font-size: 13px; color: #475569;">${escapeHtml(f.explanation)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else {
    const matrixKeys = ["brand", "product_name", "price", "pack_size", "seller", "manufacturer", "website", "contact"];
    const matrixRows = matrixKeys
      .map((key) => {
        const field = data.consistency_matrix[key];
        const fieldLabel = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
        const instaVal = field?.valuesBySource?.instagram || (key === "brand" ? data.product.brand : key === "product_name" ? data.product.name : key === "price" ? data.product.price : key === "seller" ? data.seller.username : null);
        const metaVal = field?.valuesBySource?.meta_ad || (key === "brand" ? rawResult.meta_ad_evidence?.linkTitle : key === "product_name" ? rawResult.meta_ad_evidence?.linkTitle : key === "seller" ? rawResult.meta_ad_evidence?.advertiserName : null);
        const webVal = field?.valuesBySource?.website || (key === "brand" ? rawResult.website_evidence?.product.brand : key === "product_name" ? rawResult.website_evidence?.product.name : key === "price" ? rawResult.website_evidence?.product.price : key === "seller" ? rawResult.website_evidence?.company.name : null);
        const imgVal = field?.valuesBySource?.product_image || (key === "brand" ? packaging?.product.brand : key === "product_name" ? packaging?.product.name : key === "price" ? packaging?.product.mrp : key === "manufacturer" ? packaging?.manufacturer.name : null);
        const rating = field?.result || (instaVal && (webVal || imgVal || metaVal) ? "MATCH" : "UNKNOWN");

        return `
          <tr>
            <td class="font-semibold">${escapeHtml(fieldLabel)}</td>
            <td>${escapeHtml(instaVal || "—")}</td>
            <td>${escapeHtml(metaVal || "—")}</td>
            <td>${escapeHtml(webVal || "—")}</td>
            <td>${escapeHtml(imgVal || "—")}</td>
            <td>${formatResultBadge(rating)}</td>
          </tr>
        `;
      })
      .join("");

    crossSourceConsistencyHtml += `
      <table class="data-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Instagram</th>
            <th>Meta Ad</th>
            <th>Website</th>
            <th>Product Image / Packaging</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          ${matrixRows}
        </tbody>
      </table>
    `;
  }

  // 11. Advertising Intelligence HTML
  let adTimelineTreeHtml = "";
  if (adIntel && adIntel.timeline.timelineTree.length > 0) {
    adTimelineTreeHtml = `
      <div class="ad-timeline-tree" style="margin-top: 14px; font-family: monospace; background: #0f172a; color: #f8fafc; padding: 16px 20px; border-radius: 8px; font-size: 13px; line-height: 1.6;">
        ${adIntel.timeline.timelineTree.map((group) => `
          <div style="margin-bottom: 12px;">
            <div style="color: #38bdf8; font-weight: bold; font-size: 14px;">📅 ${escapeHtml(group.year)}</div>
            ${group.entries.map((entry, idx) => {
              const isLast = idx === group.entries.length - 1;
              const branch = isLast ? "└──" : "├──";
              const statusTag = entry.status === "ACTIVE" ? '<span style="color: #4ade80;">[ACTIVE]</span>' : '<span style="color: #94a3b8;">[HISTORICAL]</span>';
              return `<div style="padding-left: 8px; color: #e2e8f0;">${branch} ${statusTag} <span style="color: #facc15;">${escapeHtml(entry.evidenceId)}</span> Ad observed: ${escapeHtml(entry.snippet || entry.label)} <span style="color: #94a3b8; font-size: 11px;">(${escapeHtml(entry.date)})</span></div>`;
            }).join("")}
          </div>
        `).join("")}
      </div>
    `;
  } else {
    adTimelineTreeHtml = `<div class="empty-text" style="margin-top: 10px;">Advertising timeline unavailable (no public campaigns observed or history unavailable).</div>`;
  }

  let advertiserIdentitySectionHtml = "";
  if (adIntel && adIntel.advertiserMatch) {
    const am = adIntel.advertiserMatch;
    advertiserIdentitySectionHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Identifier / Value</th>
            <th>Match Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${formatProvenanceBadge("instagram")} Instagram Profile</td>
            <td>@${escapeHtml(am.instagramUsername || "unknown")} (${escapeHtml(am.instagramDisplayName || "No display name")})</td>
            <td rowspan="3" style="vertical-align: middle; text-align: center;">
              ${formatAdvertiserBadge(am.rating)}
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${am.confidence}% confidence</div>
              ${am.evidenceItemId ? `<div style="font-size: 10px; font-family: monospace; color: #2563eb; margin-top: 2px;">${escapeHtml(am.evidenceItemId)}</div>` : ""}
            </td>
          </tr>
          <tr>
            <td>${formatProvenanceBadge("meta_ad")} Meta Advertiser</td>
            <td>${escapeHtml(am.metaAdvertiserIdentity || "None")} ${am.metaPageIdentity ? `<span style="font-size: 11px; color: #64748b;">(Page ID: ${escapeHtml(am.metaPageIdentity)})</span>` : ""}</td>
          </tr>
          <tr>
            <td>${formatProvenanceBadge("website")} Destination Storefront</td>
            <td>${escapeHtml(am.destinationDomain || "No destination domain")}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 10px; font-size: 13px; color: #334155;">
        <strong>Verdict:</strong> ${escapeHtml(am.verdict)}
      </div>
    `;
  }

  let destinationAnalysisHtml = "";
  if (adIntel && adIntel.destinationAnalysis.domains.length > 0) {
    destinationAnalysisHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Observed Destination Domain</th>
            <th>Ad Count</th>
            <th>Share</th>
            <th>Consistency Rating</th>
          </tr>
        </thead>
        <tbody>
          ${adIntel.destinationAnalysis.domains.map((dom) => `
            <tr>
              <td class="font-semibold">${escapeHtml(dom.domain)}</td>
              <td>${dom.count} ad(s)</td>
              <td>${dom.percentage}%</td>
              <td>${formatConsistencyLevelBadge(adIntel.destinationAnalysis.domainConsistency)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      ${adIntel.destinationAnalysis.hasDomainAnomaly && adIntel.destinationAnalysis.anomalyDetails ? `
        <div style="margin-top: 10px; padding: 10px 14px; background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px; font-size: 13px; color: #92400e;">
          ⚠️ <strong>DOMAIN_ANOMALY:</strong> ${escapeHtml(adIntel.destinationAnalysis.anomalyDetails)}
        </div>
      ` : ""}
    `;
  } else {
    destinationAnalysisHtml = `<div class="empty-text">No external destination domains linked in recorded advertising campaigns.</div>`;
  }

  let creativeHistoryHtml = "";
  if (adIntel && adIntel.creativeHistory.variations.length > 0) {
    const ch = adIntel.creativeHistory;
    creativeHistoryHtml = `
      <div class="summary-grid" style="margin-bottom: 14px;">
        <div class="summary-card">
          <div class="summary-label">Creative Score</div>
          <div class="summary-value">${ch.creativeConsistencyScore !== null ? `${ch.creativeConsistencyScore} / 100` : "HISTORY_UNAVAILABLE"}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Brand Consistency</div>
          <div class="summary-value">${formatResultBadge(ch.brandConsistency)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Product Consistency</div>
          <div class="summary-value">${formatResultBadge(ch.productConsistency)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Messaging Consistency</div>
          <div class="summary-value">${formatResultBadge(ch.messagingConsistency)}</div>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Creative ID</th>
            <th>Headline / Title</th>
            <th>Body Text Snippet</th>
            <th>Observed Date</th>
          </tr>
        </thead>
        <tbody>
          ${ch.variations.map((v) => `
            <tr>
              <td style="font-family: monospace; font-size: 12px; color: #2563eb;">${escapeHtml(v.creativeId || "AD")}</td>
              <td class="font-semibold">${escapeHtml(v.headline || "—")}</td>
              <td style="font-size: 13px; color: #475569;">${escapeHtml(v.bodySnippet || "—")}</td>
              <td style="font-size: 12px; color: #64748b;">${escapeHtml(v.deliveryDate || "HISTORY_UNAVAILABLE")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else {
    creativeHistoryHtml = `<div class="empty-text">Creative variations history unavailable for single-ad or unarchived campaigns.</div>`;
  }

  let instaMetaCorrelationHtml = "";
  if (adIntel && adIntel.instagramCorrelation) {
    const ic = adIntel.instagramCorrelation;
    instaMetaCorrelationHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Instagram Post Content</th>
            <th>Meta Ad Content</th>
            <th>Correlation Verdict</th>
            <th>Referenced Evidence IDs</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${formatProvenanceBadge("instagram")} <span style="font-size: 13px;">${escapeHtml(ic.instagramContent)}</span></td>
            <td>${formatProvenanceBadge("meta_ad")} <span style="font-size: 13px;">${escapeHtml(ic.metaAdContent)}</span></td>
            <td>${formatResultBadge(ic.result)}</td>
            <td style="font-family: monospace; font-size: 12px; color: #2563eb;">
              ${escapeHtml(ic.instagramEvidenceId || "EV-POST-001")} &harr; ${escapeHtml(ic.adEvidenceId || "EV-AD-001")}
            </td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 10px; font-size: 13px; color: ${ic.isAnomaly ? "#b91c1c" : "#334155"};">
        <strong>Correlation Analysis:</strong> ${escapeHtml(ic.explanation)}
      </div>
    `;
  }

  let adEvidenceLedgerHtml = "";
  if (adIntel && adIntel.evidenceLedger.length > 0) {
    adEvidenceLedgerHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Evidence ID</th>
            <th>Source</th>
            <th>Advertiser</th>
            <th>Ad ID</th>
            <th>Status</th>
            <th>Observed Window</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          ${adIntel.evidenceLedger.map((item: AdEvidenceItem) => `
            <tr>
              <td style="font-family: monospace; font-weight: 700; color: #2563eb;">${escapeHtml(item.id)}</td>
              <td>${formatProvenanceBadge(item.source)}</td>
              <td class="font-semibold">${escapeHtml(item.advertiser)}</td>
              <td style="font-family: monospace; font-size: 12px;">${escapeHtml(item.adId)}</td>
              <td><span class="badge ${item.status === "ACTIVE" ? "badge-success" : "badge-neutral"}">${escapeHtml(item.status)}</span></td>
              <td style="font-size: 12px; color: #475569;">${escapeHtml(item.observed)}</td>
              <td>${item.confidence}%</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } else {
    adEvidenceLedgerHtml = `<div class="empty-text">No discrete advertising evidence items generated for this investigation run.</div>`;
  }

  // 12. Trust Signals HTML
  const trustSignalsHtml = data.trust_signals.length > 0
    ? data.trust_signals.map((ts) => `
        <div class="signal-item signal-positive" style="margin-bottom: 8px; padding: 10px 14px; background: #f0fdf4; border-left: 3px solid #16a34a; border-radius: 4px;">
          <div class="signal-title" style="font-weight: 600; color: #166534;">✅ ${escapeHtml(ts.signal)}</div>
          ${ts.meaning ? `<div class="signal-meaning" style="font-size: 13px; color: #334155; margin-top: 2px;">${escapeHtml(ts.meaning)}</div>` : ""}
          <div class="signal-sources" style="font-size: 12px; color: #64748b; margin-top: 4px;">Sources: ${escapeHtml(ts.sources.join(", "))}</div>
        </div>
      `).join("")
    : `<div class="empty-text">No multi-source trust signals detected.</div>`;

  // 13. Risk Signals HTML
  const riskSignalsHtml = data.risk_signals.length > 0
    ? data.risk_signals.map((rs) => `
        <div class="signal-item signal-risk" style="margin-bottom: 8px; padding: 10px 14px; background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 4px;">
          <div class="signal-title" style="font-weight: 600; color: #991b1b;">⚠️ ${escapeHtml(rs.signal)}</div>
          <div class="signal-sources" style="font-size: 12px; color: #64748b; margin-top: 4px;">Severity: <strong>${escapeHtml(rs.severity.toUpperCase())}</strong> | Sources: ${escapeHtml(rs.sources.join(", "))}</div>
        </div>
      `).join("")
    : `<div class="empty-text">No high-risk signals detected based on available public evidence.</div>`;

  // 14. Unknown / Unavailable Information HTML
  const unknownsList = [
    ...data.missing_information,
    ...profileInv.sidePanelData.unknowns,
  ];
  const uniqueUnknowns = Array.from(new Set(unknownsList));
  const unknownInfoHtml = uniqueUnknowns.length > 0
    ? `<ul style="padding-left: 20px; font-size: 14px; color: #475569;">${uniqueUnknowns.map((m) => `<li style="margin-bottom: 4px;">${escapeHtml(m)}</li>`).join("")}</ul>`
    : `<div class="empty-text">All standard profile evidence sources were accessible.</div>`;

  // 15. Unified Evidence Ledger HTML
  const unifiedLedgerHtml = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Evidence ID</th>
          <th>Source Type</th>
          <th>Observed Text / Claim</th>
          <th>Status</th>
          <th>Confidence</th>
          <th>Corroborating IDs</th>
        </tr>
      </thead>
      <tbody>
        ${profileInv.evidence.map((item: ProfileEvidenceItem) => `
          <tr>
            <td style="font-family: monospace; font-weight: 700; color: #2563eb;">${escapeHtml(item.id)}</td>
            <td>${formatProvenanceBadge(item.sourceType)}</td>
            <td>
              <div class="font-semibold">${escapeHtml(item.observedText)}</div>
              ${item.claim ? `<div style="font-size: 12px; color: #64748b; margin-top: 2px;">Claim: ${escapeHtml(item.claim)}</div>` : ""}
            </td>
            <td>${formatResultBadge(item.status)}</td>
            <td>${item.confidence}%</td>
            <td style="font-family: monospace; font-size: 12px; color: #0284c7;">
              ${item.supportingEvidenceIds.length > 0 ? item.supportingEvidenceIds.map((id) => escapeHtml(id)).join(", ") : "—"}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  // 16. Score Calculation HTML (Answer "Why did Veriqoo give this score?")
  const scoreCalculationHtml = `
    <div style="margin-bottom: 16px;">
      <h3 style="font-size: 15px; color: #0f172a; margin-bottom: 8px;">Why did Veriqoo give this score?</h3>
      <div style="font-size: 13px; color: #475569; margin-bottom: 12px;">Every score contribution is traceable to discrete evidence items:</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Scoring Dimension</th>
            <th>Score Awarded</th>
            <th>Max Points</th>
            <th>Referenced Evidence IDs</th>
            <th>Explanation</th>
          </tr>
        </thead>
        <tbody>
          ${profileInv.dimensions.map((dim: ProfileScoreDimension) => `
            <tr>
              <td class="font-semibold">${escapeHtml(dim.name)}</td>
              <td style="font-weight: 700; color: ${dim.earnedScore > 0 ? "#16a34a" : "#64748b"};">+${dim.earnedScore}</td>
              <td style="color: #64748b;">${dim.maxScore}</td>
              <td style="font-family: monospace; font-size: 12px; color: #2563eb;">
                ${dim.evidenceIds.length > 0 ? dim.evidenceIds.map((id) => escapeHtml(id)).join(", ") : `<span style="color: #94a3b8;">None (0)</span>`}
              </td>
              <td style="font-size: 13px; color: #334155;">${escapeHtml(dim.explanation)}</td>
            </tr>
          `).join("")}
          <tr style="background: #f8fafc; font-weight: 700;">
            <td>Total Verified Trust Score</td>
            <td style="color: #0284c7; font-size: 15px;">${overallTrustScore}</td>
            <td>100</td>
            <td colspan="2" style="font-size: 13px; color: #334155;">Final Trust Rating: <strong>${overallTrustScore} / 100</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // 17. Final Risk Assessment HTML
  const finalRiskAssessmentHtml = `
    <div class="summary-grid" style="margin-bottom: 14px;">
      <div class="summary-card">
        <div class="summary-label">Final Risk Verdict</div>
        <div class="summary-value">${formatRiskBadge(finalRiskLevel)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Trust Score</div>
        <div class="summary-value">${overallTrustScore} / 100</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Confidence</div>
        <div class="summary-value">${confidenceScore}%</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Evidence Coverage</div>
        <div class="summary-value">${coveragePercent}%</div>
      </div>
    </div>
    <div style="font-size: 14px; font-weight: 600; color: #0f172a; line-height: 1.6;">
      ${escapeHtml(data.recommendation)}
    </div>
  `;

  // 18. Investigation Limitations HTML
  const limitationsHtml = `
    <div style="font-size: 12px; color: #64748b; line-height: 1.6;">
      ${escapeHtml(data.disclaimer)} Veriqoo evaluates public profile signals, bio claims, external links, bounded content samples, and advertising records. Unknown or unverified information does not constitute fraud or scam activity. No automated assessment should replace due diligence.
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Veriqoo Deep Profile Investigation - ${escapeHtml(profileUsername)}</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --primary: #0284c7;
      --success: #16a34a;
      --warning: #ea580c;
      --danger: #dc2626;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-family);
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 32px 16px;
    }
    .layout-wrapper {
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 24px;
      align-items: start;
    }
    @media (max-width: 960px) {
      .layout-wrapper {
        grid-template-columns: 1fr;
      }
    }
    .container {
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .side-panel {
      position: sticky;
      top: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .side-panel-card {
      background: var(--card-bg);
      border-radius: 12px;
      padding: 20px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
    }
    .side-panel-header {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0f172a;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }
    .side-stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      margin-bottom: 10px;
      color: #334155;
    }
    .side-label {
      color: var(--text-muted);
      font-weight: 500;
    }
    .side-panel-btn {
      display: block;
      width: 100%;
      padding: 8px 12px;
      background: #0284c7;
      color: #ffffff;
      text-align: center;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      transition: background 0.2s;
      margin-top: 6px;
    }
    .side-panel-btn:hover {
      background: #0369a1;
    }
    .header {
      padding: 28px 32px;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #ffffff;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .header-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .report-meta {
      font-size: 13px;
      color: #94a3b8;
    }
    .section {
      padding: 24px 32px;
      border-bottom: 1px solid var(--border);
    }
    .section:last-child {
      border-bottom: none;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }
    .subsection-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #334155;
      margin-top: 18px;
      margin-bottom: 10px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
    }
    .summary-card {
      background: #f1f5f9;
      border-radius: 8px;
      padding: 12px 14px;
      border: 1px solid #e2e8f0;
    }
    .summary-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
    }
    .summary-value {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      margin-top: 4px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .badge-success { background: #dcfce7; color: #15803d; }
    .badge-warning { background: #ffedd5; color: #c2410c; }
    .badge-danger { background: #fee2e2; color: #b91c1c; }
    .badge-neutral { background: #f1f5f9; color: #64748b; }
    .badge-risk-low { background: #dcfce7; color: #166534; font-size: 14px; padding: 6px 14px; }
    .badge-risk-medium { background: #ffedd5; color: #9a3412; font-size: 14px; padding: 6px 14px; }
    .badge-risk-high { background: #fee2e2; color: #991b1b; font-size: 14px; padding: 6px 14px; }
    .badge-risk-unknown { background: #f1f5f9; color: #475569; font-size: 14px; padding: 6px 14px; }

    .source-tag {
      display: inline-block;
      vertical-align: middle;
      font-family: inherit;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .data-table th, .data-table td {
      padding: 9px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .data-table th {
      background: #f8fafc;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
    }
    .font-semibold { font-weight: 600; }
    .empty-text { font-size: 13px; color: var(--text-muted); font-style: italic; }
  </style>
</head>
<body>
  <div class="layout-wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <div class="header-top">
          <div class="header-title">🛡️ VERIQOO DEEP PROFILE INVESTIGATION</div>
          <div class="report-meta">ID: ${escapeHtml(data.report_id)} | Generated: ${escapeHtml(new Date(data.generated_at).toLocaleString())}</div>
        </div>
      </div>

      <!-- 1. Investigation Summary -->
      <div class="section" id="section-investigation-summary">
        <div class="section-title">1. Investigation Summary &amp; Executive Finding</div>
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">Target Profile</div>
            <div class="summary-value">${escapeHtml(profileUsername)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Trust Score</div>
            <div class="summary-value" style="color: #0284c7; font-size: 18px;">${overallTrustScore} / 100</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Risk Assessment</div>
            <div class="summary-value">${formatRiskBadge(finalRiskLevel)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Confidence</div>
            <div class="summary-value">${confidenceScore}%</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Evidence Coverage</div>
            <div class="summary-value">${coveragePercent}%</div>
          </div>
        </div>
        <div style="margin-top: 14px; font-size: 14px; color: #334155; line-height: 1.5;">
          <strong>Executive Finding:</strong> ${escapeHtml(data.executive_finding)}
        </div>
      </div>

      <!-- 2. Profile Overview -->
      <div class="section" id="section-profile-overview">
        <div class="section-title">2. Profile Overview &amp; Product &amp; Seller Information</div>
        <table class="data-table">
          <tbody>
            <tr><td class="font-semibold" style="width: 200px;">Username</td><td>${escapeHtml(profileUsername)}</td></tr>
            <tr><td class="font-semibold">Display Name / Entity</td><td>${escapeHtml(profileDisplayName)}</td></tr>
            <tr><td class="font-semibold">Product Name</td><td>${productNameDisplay}</td></tr>
            <tr><td class="font-semibold">Brand</td><td>${brandNameDisplay}</td></tr>
            <tr><td class="font-semibold">Category</td><td>${escapeHtml(data.product.category || "General")}</td></tr>
            <tr><td class="font-semibold">Price</td><td>${escapeHtml(data.product.price || "N/A")}</td></tr>
            <tr><td class="font-semibold">Verification Badge</td><td>${formatResultBadge(profileVerified)}</td></tr>
            <tr><td class="font-semibold">Followers / Audience</td><td>${escapeHtml(followerDisplay)}</td></tr>
            <tr><td class="font-semibold">Post Activity</td><td>${escapeHtml(postCountDisplay)}</td></tr>
            <tr><td class="font-semibold">Profile URL</td><td><a href="${escapeHtml(profileInv.profileUrl)}" target="_blank" rel="noopener noreferrer" style="color: #0284c7; text-decoration: underline;">${escapeHtml(profileInv.profileUrl)}</a></td></tr>
          </tbody>
        </table>
        
        <div class="subsection-title">Investigation Source Overview</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Investigation Source</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${formatProvenanceBadge("instagram")} Instagram Profile & Post</td>
              <td><span class="badge badge-success">AVAILABLE</span></td>
              <td>Caption length: ${rawResult.evidence?.post?.caption?.length || 0} chars, Media count: ${rawResult.evidence?.media?.length || 0}</td>
            </tr>
            <tr>
              <td>${formatProvenanceBadge("meta_ad")} Meta Ad Library / Advertising Intelligence</td>
              <td>${(rawResult.meta_ad_evidence?.status === "found" || adIntel?.status === "FOUND") ? `<span class="badge badge-success">FOUND</span>` : `<span class="badge badge-neutral">${rawResult.meta_ad_evidence?.status?.toUpperCase() || adIntel?.status || "UNAVAILABLE"}</span>`}</td>
              <td>${escapeHtml(rawResult.meta_ad_evidence?.limitation || `Discovered ${adIntel?.totalAdsDiscovered ?? rawResult.meta_ad_evidence?.ads?.length ?? 0} campaign(s)`)}</td>
            </tr>
            <tr>
              <td>${formatProvenanceBadge("website")} External Web Store</td>
              <td>${rawResult.website_evidence?.status === "accessible" ? `<span class="badge badge-success">ACCESSIBLE</span>` : `<span class="badge badge-neutral">UNAVAILABLE</span>`}</td>
              <td>${escapeHtml(rawResult.website_evidence?.domain || "No independent storefront detected")}</td>
            </tr>
            <tr>
              <td>${formatProvenanceBadge("ocr")} Media & Packaging OCR</td>
              <td>${rawResult.media_evidence?.ocr?.status === "success" || rawResult.media_evidence?.ocr?.status === "partial" ? `<span class="badge badge-success">ANALYZED</span>` : `<span class="badge badge-neutral">UNAVAILABLE</span>`}</td>
              <td>Extracted ${rawResult.media_evidence?.ocr?.text?.length || 0} chars of visible package text</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 3. Raw Bio -->
      <div class="section" id="section-raw-bio">
        <div class="section-title">3. Raw Bio</div>
        ${rawBioHtml}
      </div>

      <!-- 4. Bio Claim Extraction -->
      <div class="section" id="section-bio-claim-extraction">
        <div class="section-title">4. Bio Claim Extraction</div>
        ${bioClaimsHtml}
      </div>

      <!-- 5. Bio Claim Verification -->
      <div class="section" id="section-bio-claim-verification">
        <div class="section-title">5. Bio Claim Verification</div>
        ${bioVerificationHtml}
      </div>

      <!-- 6. External Links -->
      <div class="section" id="section-external-links">
        <div class="section-title">6. External Links</div>
        ${externalLinksHtml}
      </div>

      <!-- 7. Identity Graph -->
      <div class="section" id="section-identity-graph">
        <div class="section-title">7. Identity Graph</div>
        ${identityGraphHtml}
      </div>

      <!-- 8. Highlights Investigation -->
      <div class="section" id="section-highlights-investigation">
        <div class="section-title">8. Highlights Investigation</div>
        ${highlightsHtml}
      </div>

      <!-- 9. Content Investigation -->
      <div class="section" id="section-content-investigation">
        <div class="section-title">9. Content Investigation</div>
        ${contentHtml}
      </div>

      <!-- 10. Cross-Source Consistency -->
      <div class="section" id="section-cross-source-consistency">
        <div class="section-title">10. Cross-Source Consistency Matrix</div>
        ${crossSourceConsistencyHtml}
      </div>

      <!-- 11. Advertising Intelligence -->
      <div class="section" id="section-advertising-intelligence" style="background: #fdfefe;">
        <div class="section-title" style="color: #0284c7; font-size: 15px;">📢 11. Advertising Intelligence</div>
        
        <div class="summary-grid" style="margin-bottom: 16px;">
          <div class="summary-card">
            <div class="summary-label">Advertiser Identity</div>
            <div class="summary-value">${escapeHtml(adIntel?.advertiserIdentity || rawResult.meta_ad_evidence?.advertiserName || "None detected")}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Ads Discovered</div>
            <div class="summary-value">${adIntel?.totalAdsDiscovered ?? rawResult.meta_ad_evidence?.ads?.length ?? 0} total</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Active / Historical</div>
            <div class="summary-value">${adIntel?.activeAdCount ?? 0} active / ${adIntel?.historicalAdCount ?? 0} past</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Advertising Span</div>
            <div class="summary-value">${escapeHtml(adIntel?.advertisingSpan || "HISTORY_UNAVAILABLE")}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Platforms</div>
            <div class="summary-value">${escapeHtml(adIntel?.platforms.join(", ") || "INSTAGRAM")}</div>
          </div>
        </div>

        <div class="subsection-title">📅 Advertising Timeline</div>
        ${adTimelineTreeHtml}

        <div class="subsection-title">🔗 Advertiser Identity Matching</div>
        ${advertiserIdentitySectionHtml}

        <div class="subsection-title">🌐 Destination Domain Analysis</div>
        ${destinationAnalysisHtml}

        <div class="subsection-title">🎨 Creative History &amp; Consistency</div>
        ${creativeHistoryHtml}

        <div class="subsection-title">🔄 Instagram &harr; Meta Ad Correlation</div>
        ${instaMetaCorrelationHtml}

        <div class="subsection-title">📚 Ad Evidence Ledger</div>
        ${adEvidenceLedgerHtml}
      </div>

      <!-- 12. Trust Signals -->
      <div class="section" id="section-trust-signals">
        <div class="section-title">12. Trust Signals</div>
        ${trustSignalsHtml}
      </div>

      <!-- 13. Risk Signals -->
      <div class="section" id="section-risk-signals">
        <div class="section-title">13. Risk Signals</div>
        ${riskSignalsHtml}
      </div>

      <!-- 14. Unknown / Unavailable Information -->
      <div class="section" id="section-unknown-information">
        <div class="section-title">14. Unknown / Unavailable Information &amp; Missing Information</div>
        ${unknownInfoHtml}
      </div>

      <!-- 15. Evidence Ledger -->
      <div class="section" id="section-evidence-ledger">
        <div class="section-title">15. Evidence Ledger</div>
        ${unifiedLedgerHtml}
        
        ${data.traceable_conclusions && data.traceable_conclusions.length > 0 ? `
          <div class="subsection-title">Evidence Traceability Mapping</div>
          ${data.traceable_conclusions.map((tc) => `
            <div style="margin-bottom: 8px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;">
              <div style="font-weight: 600; font-size: 13px;">🔍 ${escapeHtml(tc.conclusion)}</div>
              ${tc.evidence.map((ev) => `
                <div style="font-size: 12px; margin-top: 2px;">
                  ${formatProvenanceBadge(ev.source)} <span>${escapeHtml(ev.value)}</span>
                </div>
              `).join("")}
            </div>
          `).join("")}
        ` : ""}
      </div>

      <!-- 16. Score Calculation -->
      <div class="section" id="section-score-calculation">
        <div class="section-title">16. Score Calculation</div>
        ${scoreCalculationHtml}
      </div>

      <!-- 17. Final Risk Assessment -->
      <div class="section" id="section-final-risk-assessment">
        <div class="section-title">17. Final Risk Assessment &amp; Final Recommendation</div>
        ${finalRiskAssessmentHtml}
      </div>

      <!-- 18. Investigation Limitations -->
      <div class="section" id="section-investigation-limitations" style="background: #f8fafc;">
        <div class="section-title">18. Investigation Limitations &amp; Disclaimer</div>
        ${limitationsHtml}
      </div>
    </div>

    <!-- Sticky Side Panel for Future Chrome Side Panel Extension -->
    <div class="side-panel">
      <div class="side-panel-card">
        <div class="side-panel-header">${escapeHtml(profileUsername)}</div>
        <div class="side-stat-row">
          <span class="side-label">TRUST SCORE:</span>
          <strong style="font-size: 16px; color: #0284c7;">${overallTrustScore} / 100</strong>
        </div>
        <div class="side-stat-row">
          <span class="side-label">Confidence:</span>
          <strong>${confidenceScore}%</strong>
        </div>
        <div class="side-stat-row">
          <span class="side-label">Evidence Coverage:</span>
          <strong>${coveragePercent}%</strong>
        </div>
        <hr style="margin: 10px 0; border: none; border-top: 1px solid #e2e8f0;" />
        <div class="side-stat-row">
          <span class="side-label">Identity:</span>
          <strong>${profileInv.sidePanelData.dimensions.identity.percentage}%</strong>
        </div>
        <div class="side-stat-row">
          <span class="side-label">Bio:</span>
          <strong>${profileInv.sidePanelData.dimensions.bio.percentage}%</strong>
        </div>
        <div class="side-stat-row">
          <span class="side-label">Content:</span>
          <strong>${profileInv.sidePanelData.dimensions.content.percentage}%</strong>
        </div>
        <div class="side-stat-row">
          <span class="side-label">External Identity:</span>
          <strong>${profileInv.sidePanelData.dimensions.externalIdentity.percentage}%</strong>
        </div>
        <div class="side-stat-row">
          <span class="side-label">Advertising:</span>
          <strong>${profileInv.sidePanelData.dimensions.advertising.percentage}%</strong>
        </div>
        <div style="margin-top: 14px;">
          <a href="#section-evidence-ledger" class="side-panel-btn">[Evidence Ledger]</a>
          <a href="#section-score-calculation" class="side-panel-btn" style="background: #475569;">[Why this score?]</a>
          <a href="#section-investigation-summary" class="side-panel-btn" style="background: #0f172a;">[Detailed Report]</a>
        </div>
      </div>

      <div class="side-panel-card">
        <div class="side-panel-header">📢 Advertising</div>
        <div class="side-stat-row">
          <span class="side-label">Ads:</span>
          <strong>${adIntel?.totalAdsDiscovered ?? rawResult.meta_ad_evidence?.ads?.length ?? 0}</strong>
        </div>
        <div class="side-stat-row">
          <span class="side-label">Active:</span>
          <strong>${adIntel?.activeAdCount ?? 0}</strong>
        </div>
        <div class="side-stat-row">
          <span class="side-label">Historical:</span>
          <strong>${adIntel?.historicalAdCount ?? 0}</strong>
        </div>
        <div class="side-stat-row">
          <span class="side-label">Ad History:</span>
          <strong>${escapeHtml(adIntel?.advertisingSpan || "HISTORY_UNAVAILABLE")}</strong>
        </div>
        <div class="side-stat-row">
          <span class="side-label">Advertiser Match:</span>
          <span>${formatAdvertiserBadge(adIntel?.advertiserMatch?.rating)}</span>
        </div>
        <div class="side-stat-row">
          <span class="side-label">Domain Consistency:</span>
          <span>${formatConsistencyLevelBadge(adIntel?.destinationAnalysis?.domainConsistency)}</span>
        </div>
        <div class="side-stat-row">
          <span class="side-label">Creative Consistency:</span>
          <span>${formatConsistencyLevelBadge(adIntel?.creativeHistory?.creativeConsistency)}</span>
        </div>
        <div style="margin-top: 14px;">
          <a href="#section-advertising-intelligence" class="side-panel-btn">View Ad History</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates the HTML report file and saves it to the reports directory.
 */
export function generateVerificationReport(result: VerificationResult): GeneratedReport {
  const data = buildReportData(result);
  const html = buildReportHtml(data, result);

  const reportsDir = path.resolve(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const filePath = path.join(reportsDir, `verification-${data.report_id}.html`);
  fs.writeFileSync(filePath, html, "utf-8");

  return {
    report_id: data.report_id,
    file_path: filePath,
    html,
    data,
  };
}
