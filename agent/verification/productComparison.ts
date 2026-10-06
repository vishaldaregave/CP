import type {
  VerificationResult,
  ReceivedProductEvidence,
  PostPurchaseComparisonResult,
  PostPurchaseFieldComparison,
  PostPurchaseSession,
  ConsistencyRating,
  RiskLevel,
} from "./types.ts";

function cleanStr(str?: string | null): string {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function parseQuantityNum(str?: string | null): { num: number; unit: string } | null {
  if (!str) return null;
  const match = str.match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|grams?|ml|l|litres?|tablets?|capsules?|pcs|pieces?|count|pack)/i);
  if (!match) return null;
  let unit = match[2].toLowerCase();
  let num = parseFloat(match[1]);
  if (unit === "kg") {
    num *= 1000;
    unit = "g";
  } else if (unit === "l" || unit === "litres" || unit === "litre") {
    num *= 1000;
    unit = "ml";
  } else if (unit === "gm" || unit === "grams" || unit === "gram") {
    unit = "g";
  } else if (unit === "tablets" || unit === "capsules" || unit === "pcs" || unit === "pieces" || unit === "count") {
    unit = "count";
  }
  return { num, unit };
}

// In-memory Post-Purchase Session Storage keyed by authorized WhatsApp JID
const activeSessions = new Map<string, PostPurchaseSession>();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days retention

export function storePostPurchaseSession(
  jid: string,
  originalResult: VerificationResult,
  investigationId: string,
): void {
  const normalizedJid = jid.trim();
  activeSessions.set(normalizedJid, {
    investigationId,
    originalResult,
    timestamp: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    jid: normalizedJid,
  });
}

export function getPostPurchaseSession(jid: string): PostPurchaseSession | null {
  const normalizedJid = jid.trim();
  const session = activeSessions.get(normalizedJid);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(normalizedJid);
    return null;
  }
  return session;
}

export function removePostPurchaseSession(jid: string): void {
  activeSessions.delete(jid.trim());
}

export function clearAllPostPurchaseSessions(): void {
  activeSessions.clear();
}

/**
 * Compares advertised product evidence against physical received product evidence.
 *
 * NOTE: Discrepancies represent empirical mismatches, not automatic assumptions of fraud.
 */
export function compareAdvertisedVsReceived(
  originalResult: VerificationResult,
  received: ReceivedProductEvidence,
  customInvestigationId?: string,
): PostPurchaseComparisonResult {
  const investigationId = customInvestigationId || (originalResult.trust_matrix ? "REP-" + Date.now().toString(36).toUpperCase() : "REP-POST");
  const comparisonTimestamp = new Date().toISOString();
  const mismatchesDetected: string[] = [];
  const fields: Record<string, PostPurchaseFieldComparison> = {};

  // 1. Brand Comparison
  const advBrand = originalResult.product.brand || originalResult.website_evidence?.product.brand || originalResult.seller.name || null;
  const recBrand = received.brand;
  const cleanAdvB = cleanStr(advBrand);
  const cleanRecB = cleanStr(recBrand);

  if (!cleanAdvB || !cleanRecB) {
    fields.brand = {
      field: "brand",
      advertised: advBrand,
      received: recBrand,
      rating: "UNKNOWN",
      explanation: "Insufficient brand information on received packaging or advertisement.",
    };
  } else if (cleanAdvB === cleanRecB || cleanAdvB.includes(cleanRecB) || cleanRecB.includes(cleanAdvB)) {
    fields.brand = {
      field: "brand",
      advertised: advBrand,
      received: recBrand,
      rating: "MATCH",
      explanation: `Brand matches advertised product ("${advBrand}").`,
    };
  } else {
    fields.brand = {
      field: "brand",
      advertised: advBrand,
      received: recBrand,
      rating: "MISMATCH",
      explanation: `Brand mismatch: Advertised as "${advBrand}" but received product shows "${recBrand}".`,
    };
    mismatchesDetected.push(`Brand mismatch: Advertised "${advBrand}" vs Received "${recBrand}"`);
  }

  // 2. Product Name Comparison
  const advProd = originalResult.product.name || originalResult.website_evidence?.product.name || null;
  const recProd = received.product;
  const cleanAdvP = cleanStr(advProd);
  const cleanRecP = cleanStr(recProd);

  if (!cleanAdvP || !cleanRecP) {
    fields.product = {
      field: "product",
      advertised: advProd,
      received: recProd,
      rating: "UNKNOWN",
      explanation: "Product name could not be fully extracted from received packaging.",
    };
  } else if (cleanAdvP === cleanRecP || cleanAdvP.includes(cleanRecP) || cleanRecP.includes(cleanAdvP)) {
    fields.product = {
      field: "product",
      advertised: advProd,
      received: recProd,
      rating: "MATCH",
      explanation: `Product name aligns with advertised item ("${advProd}").`,
    };
  } else {
    // Check keyword overlap
    const advWords = (advProd || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const recWords = (recProd || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const overlap = advWords.some((w) => recWords.some((rw) => rw.includes(w) || w.includes(rw)));

    if (overlap) {
      fields.product = {
        field: "product",
        advertised: advProd,
        received: recProd,
        rating: "PARTIAL",
        explanation: `Received product ("${recProd}") partially aligns with advertised listing ("${advProd}").`,
      };
    } else {
      fields.product = {
        field: "product",
        advertised: advProd,
        received: recProd,
        rating: "MISMATCH",
        explanation: `Product mismatch: Advertised as "${advProd}" but received item shows "${recProd}".`,
      };
      mismatchesDetected.push(`Product mismatch: Advertised "${advProd}" vs Received "${recProd}"`);
    }
  }

  // 3. Pack Size / Quantity Comparison
  const advCaption = `${originalResult.evidence.post.caption || ""} ${originalResult.meta_ad_evidence?.adText || ""}`;
  const advQty = parseQuantityNum(advCaption);
  const recQty = parseQuantityNum(`${received.pack_size || ""} ${received.net_quantity || ""} ${received.ocr_text}`);

  if (!advQty || !recQty) {
    fields.pack_size = {
      field: "pack_size",
      advertised: advQty ? `${advQty.num} ${advQty.unit}` : null,
      received: recQty ? `${recQty.num} ${recQty.unit}` : null,
      rating: "UNKNOWN",
      explanation: "Quantity / pack size not specified on both advertisement and received packaging.",
    };
  } else if (advQty.unit === recQty.unit && Math.abs(advQty.num - recQty.num) < 0.01) {
    fields.pack_size = {
      field: "pack_size",
      advertised: `${advQty.num} ${advQty.unit}`,
      received: `${recQty.num} ${recQty.unit}`,
      rating: "MATCH",
      explanation: `Pack size / quantity matches advertised specification (${recQty.num} ${recQty.unit}).`,
    };
  } else {
    fields.pack_size = {
      field: "pack_size",
      advertised: `${advQty.num} ${advQty.unit}`,
      received: `${recQty.num} ${recQty.unit}`,
      rating: "MISMATCH",
      explanation: `Quantity mismatch: Advertised ${advQty.num} ${advQty.unit} vs Received ${recQty.num} ${recQty.unit}.`,
    };
    mismatchesDetected.push(`Quantity mismatch: Advertised ${advQty.num} ${advQty.unit} vs Received ${recQty.num} ${recQty.unit}`);
  }
  fields.quantity = fields.pack_size;

  // 4. Country of Origin Comparison
  const advOrigin = (advCaption.match(/(?:made\s*in|country\s*of\s*origin|origin)\s*:?\s*([a-zA-Z\s]+)/i)?.[1] || "").trim();
  const recOrigin = received.country_of_origin;

  if (advOrigin && recOrigin) {
    const cleanAdvO = cleanStr(advOrigin);
    const cleanRecO = cleanStr(recOrigin);
    if (cleanAdvO === cleanRecO || cleanAdvO.includes(cleanRecO) || cleanRecO.includes(cleanAdvO)) {
      fields.country_of_origin = {
        field: "country_of_origin",
        advertised: advOrigin,
        received: recOrigin,
        rating: "MATCH",
        explanation: `Country of origin matches (${recOrigin}).`,
      };
    } else {
      fields.country_of_origin = {
        field: "country_of_origin",
        advertised: advOrigin,
        received: recOrigin,
        rating: "MISMATCH",
        explanation: `Country of origin discrepancy: Advertised "${advOrigin}" vs Received packaging "${recOrigin}".`,
      };
      mismatchesDetected.push(`Country of origin mismatch: Advertised "${advOrigin}" vs Received "${recOrigin}"`);
    }
  } else {
    fields.country_of_origin = {
      field: "country_of_origin",
      advertised: advOrigin || null,
      received: recOrigin || null,
      rating: "UNKNOWN",
      explanation: "Country of origin not declared across both channels.",
    };
  }

  // 5. Price / MRP Comparison
  const advPrice = originalResult.product.price;
  const recMrp = received.mrp || received.price;
  fields.price = {
    field: "price",
    advertised: advPrice,
    received: recMrp,
    rating: advPrice && recMrp ? "MATCH" : "UNKNOWN",
    explanation: advPrice && recMrp ? `Advertised price: ${advPrice} | Received packaging MRP: ${recMrp}` : "Price comparison unavailable.",
  };

  // Compute overall post-purchase rating and risk update
  let overallRating: ConsistencyRating = "UNKNOWN";
  let status: "MATCH" | "PARTIAL" | "MISMATCH" | "UNKNOWN" = "UNKNOWN";
  let updatedRiskLevel: RiskLevel = originalResult.risk.risk_level;
  let updatedConfidence = Math.max(originalResult.risk.confidence, 80);
  let updatedRiskExplanation = "";

  if (mismatchesDetected.length > 0) {
    overallRating = "MISMATCH";
    status = "MISMATCH";
    updatedRiskLevel = "HIGH";
    updatedConfidence = 92;
    updatedRiskExplanation = `Post-purchase inspection detected ${mismatchesDetected.length} empirical discrepancy(ies) between advertisement and delivered product.`;
  } else if (fields.brand.rating === "MATCH" && fields.product.rating === "MATCH") {
    overallRating = "MATCH";
    status = "MATCH";
    updatedRiskLevel = "LOW";
    updatedConfidence = 90;
    updatedRiskExplanation = "Delivered product packaging is fully consistent with advertised brand and specifications.";
  } else if (fields.brand.rating === "MATCH" || fields.product.rating === "PARTIAL") {
    overallRating = "PARTIAL";
    status = "PARTIAL";
    updatedRiskLevel = originalResult.risk.risk_level;
    updatedRiskExplanation = "Delivered product shows general alignment with minor uncorroborated packaging facts.";
  } else {
    overallRating = "UNKNOWN";
    status = "UNKNOWN";
    updatedRiskExplanation = "Received packaging evidence was inconclusive for detailed post-purchase comparison.";
  }

  const summary =
    status === "MISMATCH"
      ? `Discrepancies found between advertised listing and physical received item: ${mismatchesDetected.join("; ")}.`
      : status === "MATCH"
        ? "Received product matches the advertised brand and specifications."
        : "Post-purchase received product inspection completed.";

  return {
    status,
    overallRating,
    investigationId,
    comparisonTimestamp,
    fields,
    mismatchesDetected,
    receivedProduct: received,
    summary,
    updatedRiskLevel,
    updatedConfidence,
    updatedRiskExplanation,
  };
}
