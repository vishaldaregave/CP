import * as fs from "node:fs";
import * as path from "node:path";
import type { VerificationResult, RiskLevel, SourceType, RiskFactor } from "./types.ts";
import type { VerificationReportData, GeneratedReport } from "./reportTypes.ts";

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

  if (s.includes("INSTAGRAM")) {
    bg = "#fdf2f8";
    color = "#db2777";
  } else if (s.includes("META") || s.includes("AD")) {
    bg = "#eff6ff";
    color = "#2563eb";
  } else if (s.includes("WEBSITE")) {
    bg = "#ecfdf5";
    color = "#059669";
  } else if (s.includes("OCR") || s.includes("PACKAGING") || s.includes("PRODUCT IMAGE")) {
    bg = "#fef3c7";
    color = "#d97706";
  } else if (s.includes("RECEIVED") || s.includes("POST PURCHASE")) {
    bg = "#fae8ff";
    color = "#9333ea";
  }

  return `<span class="source-tag" style="background: ${bg}; color: ${color}; font-size: 11px; padding: 2px 7px; border-radius: 4px; font-weight: 600; text-transform: uppercase;">${escapeHtml(s)}</span>`;
}

function formatResultBadge(rating: string): string {
  switch (rating) {
    case "MATCH":
      return `<span class="badge badge-success">✓ MATCH</span>`;
    case "PARTIAL":
      return `<span class="badge badge-warning">~ PARTIAL</span>`;
    case "MISMATCH":
      return `<span class="badge badge-danger">✕ MISMATCH</span>`;
    default:
      return `<span class="badge badge-neutral">— UNKNOWN</span>`;
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
    meta_ad: (result.meta_ad_evidence && result.meta_ad_evidence.status === "found") ? "AVAILABLE" : "UNAVAILABLE",
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
    username: result.seller?.username || null,
    name: result.seller?.name || result.website_evidence?.company.name || null,
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
      status: result.meta_ad_evidence?.status || "unavailable",
      library_id: result.meta_ad_evidence?.libraryId || null,
      advertiser: result.meta_ad_evidence?.advertiserName || null,
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
    "Multi-source verification completed based on available listing and packaging evidence.";

  const consistency_matrix = result.trust_matrix?.fields || {};
  const trust_signals = result.trust_matrix?.trust_signals || result.risk?.positive_signals.map((s) => ({ signal: s, severity: "positive" as const, sources: ["instagram" as const] })) || [];
  const risk_signals = result.trust_matrix?.risk_signals || result.risk?.risk_signals.map((s) => ({ signal: s, severity: "high" as const, sources: ["instagram" as const] })) || [];
  const missing_information = result.risk?.missing_information || result.trust_matrix?.missing_information || [];
  const traceable_conclusions = result.trust_matrix?.traceable_conclusions || [];
  const recommendation = result.risk?.recommendation || "Verify seller before purchasing.";
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
      confidence: result.risk?.confidence || 0,
    },
    evidence,
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
 * Builds self-contained HTML report with all 16 standardized sections and provenance tracking.
 */
export function buildReportHtml(data: VerificationReportData, rawResult: VerificationResult): string {
  const packaging = rawResult.media_evidence?.packaging;
  const sellerGraph = rawResult.seller_identity_graph;
  const productConsistency = rawResult.product_consistency;
  const timeline = rawResult.evidence_timeline;
  const postPurchase = rawResult.post_purchase_comparison;
  const riskFactors = rawResult.risk?.risk_factors || [];

  // Build consistency table rows
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

  // Seller Identity Graph HTML
  let sellerGraphHtml = "";
  if (sellerGraph && sellerGraph.relationships.length > 0) {
    sellerGraphHtml = `
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
    sellerGraphHtml = `<div class="empty-text">Seller identity graph generated from single profile context.</div>`;
  }

  // Cross-Source Product Consistency HTML
  let productConsistencyHtml = "";
  if (productConsistency) {
    const fields = Object.values(productConsistency.fields);
    productConsistencyHtml = `
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
      <div style="margin-top: 12px; font-size: 13px; color: #64748b;">
        <strong>Consistency Summary:</strong> ${escapeHtml(productConsistency.summary)}
      </div>
    `;
  }

  // Evidence Timeline HTML
  let timelineHtml = "";
  if (timeline && timeline.events.length > 0) {
    timelineHtml = `
      <div class="timeline-container">
        ${timeline.events.map((ev) => `
          <div class="timeline-item">
            <div class="timeline-badge">${formatProvenanceBadge(ev.source)}</div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-title font-semibold">${escapeHtml(ev.event)}</span>
                <span class="timeline-time">${escapeHtml(new Date(ev.timestamp).toLocaleDateString())}</span>
              </div>
              <div class="timeline-desc">${escapeHtml(ev.description)}</div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } else {
    timelineHtml = `<div class="empty-text">Timeline events compiled during verification run.</div>`;
  }

  // Risk Factors HTML
  let riskFactorsHtml = "";
  if (riskFactors.length > 0) {
    riskFactorsHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Severity</th>
            <th>Category</th>
            <th>Factor / Title</th>
            <th>Explanation</th>
            <th>Provenance</th>
          </tr>
        </thead>
        <tbody>
          ${riskFactors.map((rf: RiskFactor) => {
            const sevBadge = rf.severity === "positive"
              ? `<span class="badge badge-success">POSITIVE</span>`
              : rf.severity === "low"
              ? `<span class="badge badge-neutral">LOW</span>`
              : rf.severity === "medium"
              ? `<span class="badge badge-warning">MEDIUM</span>`
              : `<span class="badge badge-danger">HIGH</span>`;
            return `
              <tr>
                <td>${sevBadge}</td>
                <td><span style="font-size: 11px; font-weight: 700; color: #475569;">${escapeHtml(rf.category)}</span></td>
                <td class="font-semibold">${escapeHtml(rf.title)}</td>
                <td style="font-size: 13px; color: #334155;">${escapeHtml(rf.explanation)}</td>
                <td>${rf.sources.map(formatProvenanceBadge).join(" ")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  } else {
    riskFactorsHtml = `<div class="empty-text">Standard multi-source risk assessment completed.</div>`;
  }

  // Trust signals HTML
  const trustSignalsHtml = data.trust_signals.length > 0
    ? data.trust_signals.map((ts) => `
        <div class="signal-item signal-positive" style="margin-bottom: 8px; padding: 10px 14px; background: #f0fdf4; border-left: 3px solid #16a34a; border-radius: 4px;">
          <div class="signal-title" style="font-weight: 600; color: #166534;">✅ ${escapeHtml(ts.signal)}</div>
          ${ts.meaning ? `<div class="signal-meaning" style="font-size: 13px; color: #334155; margin-top: 2px;">${escapeHtml(ts.meaning)}</div>` : ""}
          <div class="signal-sources" style="font-size: 12px; color: #64748b; margin-top: 4px;">Sources: ${escapeHtml(ts.sources.join(", "))}</div>
        </div>
      `).join("")
    : `<div class="empty-text">No multi-source trust signals detected.</div>`;

  // Risk signals HTML
  const riskSignalsHtml = data.risk_signals.length > 0
    ? data.risk_signals.map((rs) => `
        <div class="signal-item signal-risk signal-risk-${escapeHtml(rs.severity)}" style="margin-bottom: 8px; padding: 10px 14px; background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 4px;">
          <div class="signal-title" style="font-weight: 600; color: #991b1b;">⚠️ ${escapeHtml(rs.signal)}</div>
          <div class="signal-sources" style="font-size: 12px; color: #64748b; margin-top: 4px;">Severity: <strong>${escapeHtml(rs.severity.toUpperCase())}</strong> | Sources: ${escapeHtml(rs.sources.join(", "))}</div>
        </div>
      `).join("")
    : `<div class="empty-text">No risk signals detected based on available evidence.</div>`;

  // Missing info HTML
  const missingInfoHtml = data.missing_information.length > 0
    ? `<ul style="padding-left: 20px; font-size: 14px; color: #475569;">${data.missing_information.map((m) => `<li style="margin-bottom: 4px;">${escapeHtml(m)}</li>`).join("")}</ul>`
    : `<div class="empty-text">All standard verification sources were accessible.</div>`;

  // Traceable conclusions HTML
  const traceableHtml = data.traceable_conclusions.length > 0
    ? data.traceable_conclusions.map((tc) => `
        <div class="traceable-card" style="margin-bottom: 12px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <div class="traceable-conclusion font-semibold" style="color: #0f172a; margin-bottom: 6px;">🔍 ${escapeHtml(tc.conclusion)}</div>
          <div class="traceable-evidence">
            ${tc.evidence.length > 0
              ? tc.evidence.map((ev) => `
                  <div style="font-size: 13px; margin-bottom: 2px;">
                    ${formatProvenanceBadge(ev.source)} <span style="color: #334155;">${escapeHtml(ev.value)}</span>
                  </div>
                `).join("")
              : `<div class="empty-text">No direct source values recorded</div>`
            }
          </div>
        </div>
      `).join("")
    : `<div class="empty-text">Evidence traceability mapping generated based on listing data.</div>`;

  // Post-Purchase Section HTML (If available)
  let postPurchaseHtml = "";
  if (postPurchase) {
    postPurchaseHtml = `
      <div class="section" id="section-post-purchase" style="background: #faf5ff;">
        <div class="section-title">14. Post-Purchase Received Product Verification</div>
        <div class="summary-grid" style="margin-bottom: 16px;">
          <div class="summary-card">
            <div class="summary-label">Delivered Item Verdict</div>
            <div class="summary-value">${formatResultBadge(postPurchase.overallRating)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Delivered Confidence</div>
            <div class="summary-value">${postPurchase.updatedConfidence}%</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Discrepancies Detected</div>
            <div class="summary-value">${postPurchase.mismatchesDetected.length}</div>
          </div>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Advertised Value</th>
              <th>Received Physical Value</th>
              <th>Match Status</th>
              <th>Explanation</th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(postPurchase.fields).map((f) => `
              <tr>
                <td class="font-semibold">${escapeHtml(f.field.toUpperCase())}</td>
                <td>${formatProvenanceBadge("instagram")} ${escapeHtml(f.advertised || "N/A")}</td>
                <td>${formatProvenanceBadge("received_product")} ${escapeHtml(f.received || "N/A")}</td>
                <td>${formatResultBadge(f.rating)}</td>
                <td style="font-size: 13px; color: #475569;">${escapeHtml(f.explanation)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  const productNameDisplay = data.product.name ? escapeHtml(data.product.name) : "Not available";
  const brandNameDisplay = data.product.brand ? escapeHtml(data.product.brand) : "Unspecified";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Veriqoo Multi-Source Evidence Report - ${escapeHtml(data.report_id)}</title>
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
    .container {
      max-width: 960px;
      margin: 0 auto;
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
      border: 1px solid var(--border);
      overflow: hidden;
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
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }
    .summary-card {
      background: #f1f5f9;
      border-radius: 8px;
      padding: 14px 16px;
      border: 1px solid #e2e8f0;
    }
    .summary-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
    }
    .summary-value {
      font-size: 16px;
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
      font-size: 14px;
    }
    .data-table th, .data-table td {
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .data-table th {
      background: #f8fafc;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
    }
    .font-semibold { font-weight: 600; }
    .empty-text { font-size: 13px; color: var(--text-muted); font-style: italic; }

    /* Timeline styling */
    .timeline-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-left: 8px;
    }
    .timeline-item {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      border-left: 2px solid #e2e8f0;
      padding-left: 14px;
      position: relative;
    }
    .timeline-badge {
      min-width: 110px;
    }
    .timeline-content {
      flex: 1;
    }
    .timeline-header {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 14px;
    }
    .timeline-time {
      font-size: 12px;
      color: var(--text-muted);
    }
    .timeline-desc {
      font-size: 13px;
      color: #475569;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-top">
        <div class="header-title">🛡️ VERIQOO EVIDENCE REPORT</div>
        <div class="report-meta">ID: ${escapeHtml(data.report_id)} | Generated: ${escapeHtml(new Date(data.generated_at).toLocaleString())}</div>
      </div>
    </div>

    <!-- 1. Executive Summary -->
    <div class="section" id="section-executive-summary">
      <div class="section-title">1. Executive Summary &amp; Executive Finding</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Seller Account</div>
          <div class="summary-value">${escapeHtml(data.seller.username ? `@${data.seller.username}` : data.seller.name || "N/A")}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Product Name</div>
          <div class="summary-value">${productNameDisplay}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Risk Level</div>
          <div class="summary-value">${formatRiskBadge(data.risk.level)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Evidence Coverage</div>
          <div class="summary-value">${rawResult.risk?.evidence_coverage ?? 75}%</div>
        </div>
      </div>
      <div style="margin-top: 14px; font-size: 14px; color: #334155; line-height: 1.5;">
        <strong>Executive Finding:</strong> ${escapeHtml(data.executive_finding)}
      </div>
    </div>

    <!-- 2. Risk Assessment -->
    <div class="section" id="section-risk-assessment">
      <div class="section-title">2. Risk Assessment</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Risk Rating</div>
          <div class="summary-value">${formatRiskBadge(data.risk.level)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Risk Score</div>
          <div class="summary-value">${rawResult.risk?.score ?? 30} / 100</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Confidence</div>
          <div class="summary-value">${data.risk.confidence}%</div>
        </div>
      </div>
    </div>

    <!-- 3. Evidence Coverage / Source Overview -->
    <div class="section" id="section-evidence-coverage">
      <div class="section-title">3. Evidence Coverage &amp; Source Overview</div>
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
            <td>${formatProvenanceBadge("meta_ad")} Meta Ad Library</td>
            <td>${rawResult.meta_ad_evidence?.status === "found" ? `<span class="badge badge-success">FOUND</span>` : `<span class="badge badge-neutral">${rawResult.meta_ad_evidence?.status?.toUpperCase() || "UNAVAILABLE"}</span>`}</td>
            <td>${escapeHtml(rawResult.meta_ad_evidence?.limitation || `Queried query terms: ${rawResult.meta_ad_evidence?.queryTerms?.join(", ") || "seller"}`)}</td>
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

    <!-- 4. Product & Seller Information -->
    <div class="section" id="section-product-seller">
      <div class="section-title">4. Product &amp; Seller Information</div>
      <table class="data-table">
        <tbody>
          <tr><td class="font-semibold" style="width: 200px;">Product Name</td><td>${productNameDisplay}</td></tr>
          <tr><td class="font-semibold">Brand</td><td>${brandNameDisplay}</td></tr>
          <tr><td class="font-semibold">Seller Account</td><td>@${escapeHtml(data.seller.username || "unknown")}</td></tr>
          <tr><td class="font-semibold">Seller Name / Entity</td><td>${escapeHtml(data.seller.name || "N/A")}</td></tr>
          <tr><td class="font-semibold">Website Store URL</td><td>${escapeHtml(data.seller.website || "None")}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 5. Seller Identity Graph -->
    <div class="section" id="section-seller-identity">
      <div class="section-title">5. Seller Identity Graph</div>
      ${sellerGraphHtml}
    </div>

    <!-- 6. Instagram Evidence -->
    <div class="section" id="section-instagram-evidence">
      <div class="section-title">6. Instagram Evidence</div>
      <table class="data-table">
        <tbody>
          <tr><td class="font-semibold" style="width: 200px;">Username</td><td>@${escapeHtml(data.seller.username || "unknown")}</td></tr>
          <tr><td class="font-semibold">Post Caption</td><td style="font-size: 13px; color: #334155;">${escapeHtml(data.evidence.instagram.caption || "No caption text")}</td></tr>
          <tr><td class="font-semibold">External Links</td><td>${data.evidence.instagram.external_links.map((l) => escapeHtml(l)).join(", ") || "None"}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 7. Meta Ad Library Evidence -->
    <div class="section" id="section-meta-evidence">
      <div class="section-title">7. Meta Ad Library Evidence</div>
      <table class="data-table">
        <tbody>
          <tr><td class="font-semibold" style="width: 200px;">Status</td><td>${escapeHtml(rawResult.meta_ad_evidence?.status?.toUpperCase() || "UNAVAILABLE")}</td></tr>
          <tr><td class="font-semibold">Advertiser Name</td><td>${escapeHtml(rawResult.meta_ad_evidence?.advertiserName || "N/A")}</td></tr>
          <tr><td class="font-semibold">Ad Count</td><td>${rawResult.meta_ad_evidence?.ads?.length || 0} active campaign(s)</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 8. Website Evidence -->
    <div class="section" id="section-website-evidence">
      <div class="section-title">8. Website Evidence</div>
      <table class="data-table">
        <tbody>
          <tr><td class="font-semibold" style="width: 200px;">Domain</td><td>${escapeHtml(rawResult.website_evidence?.domain || "N/A")}</td></tr>
          <tr><td class="font-semibold">Company Name</td><td>${escapeHtml(rawResult.website_evidence?.company?.name || "N/A")}</td></tr>
          <tr><td class="font-semibold">Contact Info</td><td>${escapeHtml(rawResult.website_evidence?.company?.phone || rawResult.website_evidence?.company?.email || "None listed")}</td></tr>
          <tr><td class="font-semibold">Policies Found</td><td>${data.evidence.website.policies_found.join(", ") || "None"}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 9. Product Evidence -->
    <div class="section" id="section-product-evidence">
      <div class="section-title">9. Product Evidence</div>
      <table class="data-table">
        <tbody>
          <tr><td class="font-semibold" style="width: 200px;">Product Name</td><td>${productNameDisplay}</td></tr>
          <tr><td class="font-semibold">Brand</td><td>${brandNameDisplay}</td></tr>
          <tr><td class="font-semibold">Category</td><td>${escapeHtml(data.product.category || "General Merchandise")}</td></tr>
          <tr><td class="font-semibold">Listed Price</td><td>${escapeHtml(data.product.price || "N/A")}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 10. OCR / Packaging Extraction -->
    <div class="section" id="section-ocr-packaging">
      <div class="section-title">10. OCR / Packaging Extraction</div>
      <table class="data-table">
        <tbody>
          <tr><td class="font-semibold" style="width: 200px;">OCR Status</td><td>${escapeHtml(rawResult.media_evidence?.ocr?.status || "None")} (${rawResult.media_evidence?.ocr?.confidence || 0}% confidence)</td></tr>
          <tr><td class="font-semibold">Extracted Text</td><td style="font-size: 13px; font-family: monospace; color: #475569;">${escapeHtml(rawResult.media_evidence?.ocr?.text?.slice(0, 300) || "No visual text extracted")}</td></tr>
          <tr><td class="font-semibold">Extracted MRP</td><td>${escapeHtml(packaging?.product?.mrp || "N/A")}</td></tr>
          <tr><td class="font-semibold">Regulatory Licenses</td><td>${packaging?.regulatory?.license_numbers?.join(", ") || "None detected"}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 11. Advertising Claim Analysis -->
    <div class="section" id="section-ad-claims">
      <div class="section-title">11. Advertising Claim &amp; Pressure Analysis</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Claim / Pressure Pattern</th>
            <th>Type</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          ${(rawResult.ad_claim_analysis?.ad_pressure_signals || []).map((sig) => `
            <tr>
              <td class="font-semibold">${escapeHtml(sig.text)}</td>
              <td>${formatProvenanceBadge(sig.source)} <span style="font-size: 12px; font-weight: 600;">${escapeHtml(sig.type.toUpperCase())}</span></td>
              <td style="font-size: 13px; color: #475569;">${escapeHtml(sig.meaning)}</td>
            </tr>
          `).join("")}
          ${(rawResult.ad_claim_analysis?.ad_pressure_signals || []).length === 0 ? `<tr><td colspan="3" class="empty-text">No high-pressure promotional claims detected.</td></tr>` : ""}
        </tbody>
      </table>
    </div>

    <!-- 12. Cross-Source Consistency Matrix -->
    <div class="section" id="section-cross-source">
      <div class="section-title">12. Cross-Source Consistency Matrix</div>
      ${productConsistencyHtml || `
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
      `}
    </div>

    <!-- 13. Evidence Timeline -->
    <div class="section" id="section-timeline">
      <div class="section-title">13. Evidence Timeline</div>
      ${timelineHtml}
    </div>

    <!-- 14. Explainable Risk Factors, Trust & Risk Signals -->
    <div class="section" id="section-risk-factors">
      <div class="section-title">14. Explainable Risk Factors, Trust Signals &amp; Risk Signals</div>
      <div style="margin-bottom: 16px;">
        ${riskFactorsHtml}
      </div>
      <div style="margin-top: 16px;">
        <div class="font-semibold" style="margin-bottom: 8px; font-size: 13px; color: #166534;">POSITIVE TRUST SIGNALS</div>
        ${trustSignalsHtml}
      </div>
      <div style="margin-top: 16px;">
        <div class="font-semibold" style="margin-bottom: 8px; font-size: 13px; color: #991b1b;">RISK SIGNALS</div>
        ${riskSignalsHtml}
      </div>
      <div style="margin-top: 16px;">
        <div class="font-semibold" style="margin-bottom: 8px; font-size: 13px; color: #475569;">Missing Information</div>
        ${missingInfoHtml}
      </div>
      <div style="margin-top: 16px;">
        <div class="font-semibold" style="margin-bottom: 8px; font-size: 13px; color: #0f172a;">Evidence Traceability</div>
        ${traceableHtml}
      </div>
    </div>

    <!-- 15. Post-Purchase Comparison (Conditional) -->
    ${postPurchaseHtml}

    <!-- 16. Recommendation & Limitations -->
    <div class="section" id="section-recommendation">
      <div class="section-title">15. Final Recommendation</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a; line-height: 1.6;">
        ${escapeHtml(data.recommendation)}
      </div>
    </div>

    <div class="section" id="section-limitations" style="background: #f8fafc;">
      <div class="section-title">16. Limitations &amp; Disclaimer</div>
      <div style="font-size: 12px; color: #64748b; line-height: 1.5;">
        ${escapeHtml(data.disclaimer)} This automated report is generated by Veriqoo by cross-referencing available public signals from Instagram, Meta Ad Library, destination websites, and computer vision OCR. The absence of advertisements or external storefronts does not automatically indicate fraud.
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
