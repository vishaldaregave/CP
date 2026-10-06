import type {
  InstagramEvidence,
  ProductInfo,
  SellerInfo,
  WebsiteEvidence,
  MediaEvidence,
  MetaAdEvidence,
  AdClaimAnalysis,
  ProductConsistencyReport,
  ProductConsistencyField,
  ConsistencyRating,
  TrustSignal,
} from "./types.ts";

function cleanStr(str?: string | null): string {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumericPrice(str?: string | null): number | null {
  if (!str) return null;
  const match = str.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function extractQuantity(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|grams?|ml|l|litres?|tablets?|capsules?|pcs|pieces?|count|pack)/i);
  if (!match) return null;
  return `${match[1]} ${match[2].toLowerCase()}`;
}

function extractCountryOfOrigin(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/(?:made\s*in|country\s*of\s*origin|origin|mfd\s*in)\s*:?\s*([a-zA-Z\s]+)/i);
  if (!match) return null;
  return match[1].trim().split(/\n|,|\./)[0].trim();
}

/**
 * Evaluates comprehensive multi-source Product Consistency across:
 * Instagram, Meta Ad Library, External Website, OCR & Physical Packaging.
 *
 * NOTE: Missing evidence is classified as UNKNOWN, NEVER automatically as MISMATCH or fraud.
 */
export function evaluateProductConsistency(
  instagram: InstagramEvidence,
  product: ProductInfo,
  seller: SellerInfo,
  website?: WebsiteEvidence | null,
  media?: MediaEvidence | null,
  metaAd?: MetaAdEvidence | null,
  adClaims?: AdClaimAnalysis | null,
): ProductConsistencyReport {
  const packaging = media?.packaging;
  const ocrText = media?.ocr?.text || "";
  const combinedAdText = [metaAd?.adText, metaAd?.linkTitle, metaAd?.linkDescription].filter(Boolean).join("\n");

  const fields: Record<string, ProductConsistencyField> = {};
  const trust_signals: TrustSignal[] = [];
  const risk_signals: TrustSignal[] = [];

  function evaluateSingleField(
    field: string,
    valuesBySource: Record<string, string | null>,
    customComparator?: (vals: Record<string, string>) => { rating: ConsistencyRating; note?: string },
  ): ProductConsistencyField {
    const presentEntries = Object.entries(valuesBySource).filter(
      ([, v]) => v !== null && v !== undefined && String(v).trim().length > 0,
    ) as Array<[string, string]>;

    if (presentEntries.length === 0) {
      return {
        field,
        rating: "UNKNOWN",
        valuesBySource,
        explanation: `No evidence available for ${field} across any source.`,
      };
    }

    if (customComparator) {
      const presentVals: Record<string, string> = {};
      for (const [k, v] of presentEntries) {
        presentVals[k] = v;
      }
      const customRes = customComparator(presentVals);
      return {
        field,
        rating: customRes.rating,
        valuesBySource,
        explanation: customRes.note || `${field} evaluation completed.`,
        discrepancyNote: customRes.rating === "MISMATCH" ? customRes.note : undefined,
      };
    }

    if (presentEntries.length === 1) {
      return {
        field,
        rating: "MATCH",
        valuesBySource,
        explanation: `Single-source evidence found from ${presentEntries[0][0]}: "${presentEntries[0][1]}".`,
      };
    }

    // Default comparator: pairwise clean string comparison
    const baseVal = presentEntries[0][1];
    const cleanBase = cleanStr(baseVal);
    let hasMismatch = false;
    let hasPartial = false;

    for (let i = 1; i < presentEntries.length; i++) {
      const otherVal = presentEntries[i][1];
      const cleanOther = cleanStr(otherVal);

      if (cleanBase === cleanOther) {
        continue;
      } else if (cleanBase.includes(cleanOther) || cleanOther.includes(cleanBase)) {
        hasPartial = true;
      } else {
        hasMismatch = true;
      }
    }

    const rating: ConsistencyRating = hasMismatch ? "MISMATCH" : hasPartial ? "PARTIAL" : "MATCH";
    const explanation = hasMismatch
      ? `${field} mismatch between sources: ${presentEntries.map(([s, v]) => `${s}="${v}"`).join(" vs ")}`
      : hasPartial
      ? `${field} partially matches across sources.`
      : `${field} is consistent across all ${presentEntries.length} sources.`;

    return {
      field,
      rating,
      valuesBySource,
      explanation,
      discrepancyNote: hasMismatch ? explanation : undefined,
    };
  }

  // 1. Brand
  fields.brand = evaluateSingleField("brand", {
    instagram: product.brand || instagram.account?.display_name || null,
    meta_ad: metaAd?.linkTitle || metaAd?.advertiserName || null,
    website: website?.product?.brand || website?.company?.name || null,
    product_image: packaging?.product?.brand || null,
  });

  // 2. Product Name
  fields.product = evaluateSingleField("product", {
    instagram: product.name || null,
    meta_ad: metaAd?.linkTitle || null,
    website: website?.product?.name || null,
    product_image: packaging?.product?.name || null,
  });

  // 3. Category
  fields.category = evaluateSingleField("category", {
    instagram: product.category || null,
    website: website?.product?.description ? product.category : null,
    product_image: packaging?.product?.category || null,
  });

  // 4. Price & MRP
  fields.price = evaluateSingleField(
    "price",
    {
      instagram: product.price || null,
      website: website?.product?.price || null,
      product_image: packaging?.product?.price || packaging?.product?.mrp || null,
    },
    (vals) => {
      const numPrices = Object.entries(vals)
        .map(([src, p]) => ({ src, val: parseNumericPrice(p) }))
        .filter((item): item is { src: string; val: number } => item.val !== null);

      if (numPrices.length === 0) return { rating: "UNKNOWN", note: "No price information available." };
      if (numPrices.length === 1) return { rating: "MATCH", note: `Price listed on ${numPrices[0].src} (${numPrices[0].val}).` };
      const baseVal = numPrices[0].val;
      const differs = numPrices.some((item) => Math.abs(item.val - baseVal) > 2.0);
      if (differs) {
        return {
          rating: "PARTIAL",
          note: `Price varies between channels (${numPrices.map((p) => `${p.src}: ${p.val}`).join(" vs ")}) - promotional discounts may apply.`,
        };
      }
      return { rating: "MATCH", note: `Price is consistent across sources (${baseVal}).` };
    },
  );

  // 5. MRP
  fields.mrp = evaluateSingleField("mrp", {
    instagram: null,
    website: null,
    product_image: packaging?.product?.mrp || null,
  });

  // 6. Discount & Offers
  fields.discount = evaluateSingleField("discount", {
    instagram: adClaims?.price_claims?.[0] || null,
    meta_ad: adClaims?.price_claims?.[0] || null,
  });

  // 7. Pack Size / Quantity
  fields.pack_size = evaluateSingleField(
    "pack_size",
    {
      instagram: extractQuantity(instagram.post?.caption),
      meta_ad: extractQuantity(combinedAdText),
      website: extractQuantity(website?.product?.description || website?.product?.name),
      product_image: extractQuantity(ocrText),
    },
    (vals) => {
      const entries = Object.entries(vals);
      if (entries.length === 0) return { rating: "UNKNOWN", note: "No pack size information." };
      if (entries.length === 1) return { rating: "MATCH", note: `Pack size found on ${entries[0][0]}: ${entries[0][1]}.` };
      const q1 = entries[0][1].toLowerCase().replace(/\s+/g, "");
      const q2 = entries[1][1].toLowerCase().replace(/\s+/g, "");
      if (q1 === q2) return { rating: "MATCH", note: `Pack quantity matches (${entries[0][1]}).` };
      return {
        rating: "MISMATCH",
        note: `Pack size discrepancy: ${entries.map(([s, v]) => `${s}=${v}`).join(" vs ")}`,
      };
    },
  );

  // 8. Manufacturer
  fields.manufacturer = evaluateSingleField("manufacturer", {
    website: website?.company?.name || null,
    product_image: packaging?.manufacturer?.name || null,
  });

  // 9. Seller Identity
  fields.seller = evaluateSingleField("seller", {
    instagram: seller.username ? `@${seller.username.replace(/^@+/, "")}` : seller.name,
    meta_ad: metaAd?.advertiserName || null,
    website: website?.company?.name || website?.domain || null,
  });

  // 10. Country of Origin
  fields.country_of_origin = evaluateSingleField("country_of_origin", {
    instagram: extractCountryOfOrigin(instagram.post?.caption),
    website: extractCountryOfOrigin(website?.product?.description),
    product_image: extractCountryOfOrigin(ocrText),
  });

  // 11. Product Claims / Authenticity
  fields.product_claims = evaluateSingleField(
    "product_claims",
    {
      instagram: (instagram.claims || []).map((c) => c.claim).join(", ") || null,
      meta_ad: adClaims?.claims_detected?.join(", ") || null,
      product_image: packaging?.claims?.join(", ") || null,
    },
    (vals) => {
      const allText = Object.values(vals).join(" ").toLowerCase();
      if (allText.includes("100% original") || allText.includes("authentic") || allText.includes("genuine")) {
        const hasRegulatory = Boolean(packaging?.regulatory?.license_numbers && packaging.regulatory.license_numbers.length > 0);
        return {
          rating: hasRegulatory ? "MATCH" : "UNKNOWN",
          note: hasRegulatory
            ? "Authenticity claims corroborated by physical packaging license marks."
            : "Promotional authenticity claim detected without independent lab/regulatory verification (UNSUPPORTED).",
        };
      }
      return { rating: "MATCH", note: "Product claims consistent." };
    },
  );

  // Generate Trust / Risk signals based on field results
  if (fields.brand.rating === "MATCH" && fields.brand.valuesBySource.website) {
    trust_signals.push({
      signal: "Brand name matches between social listing and verified web catalog",
      severity: "positive",
      sources: ["instagram", "website"],
      meaning: "Brand identity is consistent between social advertisement and standalone store.",
    });
  }

  if (fields.brand.rating === "MISMATCH") {
    risk_signals.push({
      signal: `Brand mismatch detected: ${fields.brand.explanation}`,
      severity: "high",
      sources: ["instagram", "product_image"],
      meaning: "Product packaging OCR text contradicts the advertised brand name.",
    });
  }

  if (fields.product.rating === "MISMATCH") {
    risk_signals.push({
      signal: `Product mismatch: ${fields.product.explanation}`,
      severity: "high",
      sources: ["instagram", "website"],
      meaning: "Destination store catalog item differs significantly from social advertisement.",
    });
  }

  if (fields.pack_size.rating === "MISMATCH") {
    risk_signals.push({
      signal: `Pack size quantity contradiction: ${fields.pack_size.explanation}`,
      severity: "high",
      sources: ["meta_ad", "product_image"],
      meaning: "Advertisement specifies a pack quantity/size that differs from physical packaging OCR.",
    });
  }

  // Calculate overall rating
  const ratings = Object.values(fields).map((f) => f.rating);
  const mismatches = ratings.filter((r) => r === "MISMATCH").length;
  const matches = ratings.filter((r) => r === "MATCH").length;

  let overallRating: ConsistencyRating = "UNKNOWN";
  if (mismatches > 0) {
    overallRating = "MISMATCH";
  } else if (matches >= 3) {
    overallRating = "MATCH";
  } else if (matches > 0) {
    overallRating = "PARTIAL";
  }

  let summary = "";
  if (overallRating === "MATCH") {
    summary = "Product attributes, brand, and specifications are consistent across multi-source evidence.";
  } else if (overallRating === "MISMATCH") {
    summary = `Product contradictions detected across channels (${risk_signals[0]?.signal || "conflicting specifications"}).`;
  } else if (overallRating === "PARTIAL") {
    summary = "Product attributes partially align across available channels with minor missing fields.";
  } else {
    summary = "Limited multi-source product evidence available for cross-comparison.";
  }

  return {
    overallRating,
    fields,
    trust_signals,
    risk_signals,
    summary,
  };
}
