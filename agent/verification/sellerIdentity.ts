import type {
  InstagramEvidence,
  SellerInfo,
  MetaAdEvidence,
  WebsiteEvidence,
  SellerIdentityGraph,
  SellerIdentityNode,
  IdentityRelationship,
  TrustSignal,
  ConsistencyRating,
} from "./types.ts";

function cleanStr(str?: string | null): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/\b(pvt|ltd|limited|private|llc|inc|official|store|shop|india|in)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function extractEmailDomain(email?: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const parts = email.split("@");
  return parts[1]?.toLowerCase().trim() || null;
}

function cleanDomain(domain?: string | null): string {
  if (!domain) return "";
  return domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Builds a structured multi-source Seller Identity Graph.
 *
 * Compares identity across:
 * - Instagram handle & display name
 * - Meta Advertiser & Page ID
 * - Website company name & domain
 * - Phone numbers & email domains
 *
 * NOTE: Never assumes different display names automatically mean fraud.
 */
export function buildSellerIdentityGraph(
  instagram: InstagramEvidence,
  seller: SellerInfo,
  metaAd?: MetaAdEvidence | null,
  website?: WebsiteEvidence | null,
): SellerIdentityGraph {
  const nodes: SellerIdentityNode[] = [];
  const relationships: IdentityRelationship[] = [];
  const trust_signals: TrustSignal[] = [];
  const risk_signals: TrustSignal[] = [];

  const igHandle = instagram.account?.username || seller.username || null;
  const igName = instagram.account?.display_name || seller.name || null;
  const metaAdvName = metaAd?.advertiserName || null;
  const metaPageId = metaAd?.advertiserPageId || null;
  const webCompName = website?.company?.name || null;
  const webDomain = website?.domain || null;
  const webEmail = website?.company?.email || null;
  const webPhone = website?.company?.phone || seller.contact || null;
  const emailDomain = extractEmailDomain(webEmail);

  // 1. Build Identity Nodes
  if (igHandle) {
    nodes.push({ type: "instagram", label: "Instagram Handle", value: `@${igHandle.replace(/^@+/, "")}`, verified: true });
  }
  if (igName && igName !== igHandle) {
    nodes.push({ type: "instagram", label: "Instagram Display Name", value: igName, verified: true });
  }
  if (metaAdvName) {
    nodes.push({ type: "meta_ad", label: "Meta Advertiser Name", value: metaAdvName, verified: metaAd?.status === "found" });
  }
  if (metaPageId) {
    nodes.push({ type: "meta_ad", label: "Meta Page ID", value: metaPageId, verified: true });
  }
  if (webCompName) {
    nodes.push({ type: "website", label: "Website Company Name", value: webCompName, verified: website?.status === "accessible" });
  }
  if (webDomain) {
    nodes.push({ type: "website", label: "Website Domain", value: webDomain, verified: website?.status === "accessible" });
  }
  if (webEmail) {
    nodes.push({ type: "seller", label: "Contact Email", value: webEmail, verified: true });
  }
  if (webPhone) {
    nodes.push({ type: "seller", label: "Contact Phone", value: webPhone, verified: true });
  }

  const cleanIgHandle = cleanStr(igHandle);
  const cleanIgName = cleanStr(igName);
  const cleanMetaAdv = cleanStr(metaAdvName);
  const cleanWebComp = cleanStr(webCompName);
  const cleanWebDom = cleanDomain(webDomain);
  const cleanEmailDom = cleanDomain(emailDomain);

  // 2. Evaluate Relationships

  // Relationship 1: Instagram Account ↔ Meta Advertiser
  if (igHandle && metaAdvName) {
    let rating: ConsistencyRating = "UNKNOWN";
    let conf = 50;
    let exp = "";

    const directMatch = cleanIgHandle === cleanMetaAdv || (cleanIgName && cleanIgName === cleanMetaAdv);
    const subMatch =
      cleanMetaAdv.includes(cleanIgHandle) ||
      cleanIgHandle.includes(cleanMetaAdv) ||
      (cleanIgName && (cleanMetaAdv.includes(cleanIgName) || cleanIgName.includes(cleanMetaAdv)));

    if (directMatch) {
      rating = "MATCH";
      conf = 90;
      exp = `Meta advertiser "${metaAdvName}" directly matches Instagram account @${igHandle}.`;
      trust_signals.push({
        signal: `Meta advertiser name (${metaAdvName}) matches Instagram seller (@${igHandle})`,
        severity: "positive",
        sources: ["instagram", "meta_ad"],
        meaning: "Meta Ad Library records corroborate the advertiser identity with the social handle.",
      });
    } else if (subMatch && cleanMetaAdv.length > 2 && cleanIgHandle.length > 2) {
      rating = "PARTIAL";
      conf = 75;
      exp = `Meta advertiser "${metaAdvName}" partially aligns with Instagram seller (@${igHandle}).`;
      trust_signals.push({
        signal: `Meta advertiser name (${metaAdvName}) aligns with Instagram handle (@${igHandle})`,
        severity: "positive",
        sources: ["instagram", "meta_ad"],
        meaning: "Meta Ad Library and Instagram seller show consistent root identity.",
      });
    } else {
      rating = "MISMATCH";
      conf = 80;
      exp = `Meta advertiser "${metaAdvName}" differs substantially from Instagram seller (@${igHandle}).`;
      risk_signals.push({
        signal: `Identity mismatch: Meta advertiser (${metaAdvName}) differs from Instagram seller (@${igHandle})`,
        severity: "medium",
        sources: ["instagram", "meta_ad"],
        meaning: "The advertisement is registered under a different identity than the Instagram account.",
      });
    }

    relationships.push({
      source: "instagram",
      targetSource: "meta_ad",
      type: "INSTAGRAM_VS_META",
      sourceValue: `@${igHandle.replace(/^@+/, "")}`,
      targetValue: metaAdvName,
      rating,
      confidence: conf,
      explanation: exp,
    });
  }

  // Relationship 2: Instagram Account ↔ Website Domain / Company
  if (igHandle && (webCompName || webDomain)) {
    let rating: ConsistencyRating = "UNKNOWN";
    let conf = 50;
    let exp = "";

    const targetVal = webCompName || webDomain || "";
    const cleanTarget = cleanWebComp || cleanWebDom;
    const directMatch = cleanIgHandle === cleanTarget || (cleanIgName && cleanIgName === cleanTarget);
    const subMatch = cleanTarget.includes(cleanIgHandle) || cleanIgHandle.includes(cleanTarget);

    if (directMatch) {
      rating = "MATCH";
      conf = 90;
      exp = `Instagram seller identity aligns with external website entity "${targetVal}".`;
      trust_signals.push({
        signal: `Instagram seller identity matches registered entity on external store (${targetVal})`,
        severity: "positive",
        sources: ["instagram", "website"],
        meaning: "Social handle and store company registration represent the same business.",
      });
    } else if (subMatch && cleanTarget.length > 2) {
      rating = "PARTIAL";
      conf = 70;
      exp = `Instagram handle partially aligns with website domain/entity "${targetVal}".`;
    } else if (cleanTarget.length > 3 && cleanIgHandle.length > 3) {
      rating = "MISMATCH";
      conf = 75;
      exp = `Instagram handle @${igHandle} differs from website company entity "${targetVal}".`;
      risk_signals.push({
        signal: `Identity mismatch: Instagram seller handle differs from website company (${targetVal})`,
        severity: "medium",
        sources: ["instagram", "website"],
        meaning: "Instagram profile and destination store display differing operating names.",
      });
    }

    relationships.push({
      source: "instagram",
      targetSource: "website",
      type: "INSTAGRAM_VS_WEBSITE",
      sourceValue: `@${igHandle.replace(/^@+/, "")}`,
      targetValue: targetVal,
      rating,
      confidence: conf,
      explanation: exp,
    });
  }

  // Relationship 3: Meta Advertiser ↔ Website Company
  if (metaAdvName && (webCompName || webDomain)) {
    let rating: ConsistencyRating = "UNKNOWN";
    let conf = 50;
    let exp = "";

    const targetVal = webCompName || webDomain || "";
    const cleanTarget = cleanWebComp || cleanWebDom;
    const directMatch = cleanMetaAdv === cleanTarget;
    const subMatch = cleanMetaAdv.includes(cleanTarget) || cleanTarget.includes(cleanMetaAdv);

    if (directMatch) {
      rating = "MATCH";
      conf = 95;
      exp = `Meta advertiser "${metaAdvName}" matches external store company "${targetVal}".`;
      trust_signals.push({
        signal: `Meta advertiser matches external store registration (${targetVal})`,
        severity: "positive",
        sources: ["meta_ad", "website"],
        meaning: "Direct legal/corporate correspondence between ad buyer and online store.",
      });
    } else if (subMatch && cleanTarget.length > 2) {
      rating = "PARTIAL";
      conf = 75;
      exp = `Meta advertiser "${metaAdvName}" relates to website domain/entity "${targetVal}".`;
    } else if (cleanTarget.length > 3 && cleanMetaAdv.length > 3) {
      rating = "MISMATCH";
      conf = 80;
      exp = `Meta advertiser "${metaAdvName}" differs from external store entity "${targetVal}".`;
      risk_signals.push({
        signal: `Identity mismatch: Meta advertiser differs from external store entity (${targetVal})`,
        severity: "medium",
        sources: ["meta_ad", "website"],
        meaning: "Ad campaign entity differs from store registration.",
      });
    }

    relationships.push({
      source: "meta_ad",
      targetSource: "website",
      type: "META_VS_WEBSITE",
      sourceValue: metaAdvName,
      targetValue: targetVal,
      rating,
      confidence: conf,
      explanation: exp,
    });
  }

  // Relationship 4: Website Company ↔ Domain
  if (webCompName && webDomain) {
    let rating: ConsistencyRating = "UNKNOWN";
    let conf = 60;
    let exp = "";

    if (cleanWebComp === cleanWebDom || cleanWebDom.includes(cleanWebComp) || cleanWebComp.includes(cleanWebDom)) {
      rating = "MATCH";
      conf = 90;
      exp = `Company name "${webCompName}" matches registered domain "${webDomain}".`;
    } else {
      rating = "PARTIAL";
      conf = 65;
      exp = `Company name "${webCompName}" operates under domain "${webDomain}".`;
    }

    relationships.push({
      source: "website",
      targetSource: "website",
      type: "WEBSITE_TO_DOMAIN",
      sourceValue: webCompName,
      targetValue: webDomain,
      rating,
      confidence: conf,
      explanation: exp,
    });
  }

  // Relationship 5: Domain ↔ Support Email Domain
  if (webDomain && cleanEmailDom) {
    let rating: ConsistencyRating = "UNKNOWN";
    let conf = 70;
    let exp = "";

    const isCommonFreeEmail = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"].includes(cleanEmailDom);

    if (cleanWebDom.includes(cleanEmailDom) || cleanEmailDom.includes(cleanWebDom)) {
      rating = "MATCH";
      conf = 95;
      exp = `Support email uses custom domain @${cleanEmailDom} matching web store.`;
      trust_signals.push({
        signal: `Dedicated business email domain (@${cleanEmailDom})`,
        severity: "positive",
        sources: ["website", "seller"],
        meaning: "Official custom domain email indicates established professional operations.",
      });
    } else if (isCommonFreeEmail) {
      rating = "PARTIAL";
      conf = 60;
      exp = `Seller uses generic email provider (@${cleanEmailDom}) rather than custom domain.`;
    } else {
      rating = "MISMATCH";
      conf = 65;
      exp = `Support email domain @${cleanEmailDom} differs from website domain ${webDomain}.`;
    }

    relationships.push({
      source: "website",
      targetSource: "seller",
      type: "DOMAIN_TO_EMAIL",
      sourceValue: webDomain,
      targetValue: webEmail || cleanEmailDom,
      rating,
      confidence: conf,
      explanation: exp,
    });
  }

  // Relationship 6: Contact Phone
  if (webPhone) {
    relationships.push({
      source: "seller",
      targetSource: "website",
      type: "CONTACT_PHONE",
      sourceValue: webPhone,
      targetValue: webCompName || webDomain || "Website",
      rating: "MATCH",
      confidence: 80,
      explanation: `Business contact number ${webPhone} published for customer support.`,
    });
  }

  // Determine Overall Rating & Summary
  let overallRating: ConsistencyRating = "UNKNOWN";
  let totalConf = 0;

  if (relationships.length === 0) {
    overallRating = "UNKNOWN";
    totalConf = 20;
  } else {
    const ratings = relationships.map((r) => r.rating);
    const hasMismatch = ratings.includes("MISMATCH");
    const matchCount = ratings.filter((r) => r === "MATCH").length;
    const partialCount = ratings.filter((r) => r === "PARTIAL").length;

    totalConf = Math.round(relationships.reduce((acc, r) => acc + r.confidence, 0) / relationships.length);

    if (hasMismatch) {
      overallRating = "MISMATCH";
    } else if (matchCount >= 2 || (matchCount >= 1 && partialCount >= 1)) {
      overallRating = "MATCH";
    } else if (matchCount >= 1 || partialCount >= 1) {
      overallRating = "PARTIAL";
    } else {
      overallRating = "UNKNOWN";
    }
  }

  let summary = "";
  if (overallRating === "MATCH") {
    summary = `Seller identity is consistent across ${relationships.length} entity relationship(s) (Instagram, Meta, and website records align).`;
  } else if (overallRating === "MISMATCH") {
    summary = `Seller identity mismatch detected across entity records.`;
  } else if (overallRating === "PARTIAL") {
    summary = `Partial identity match observed across available platforms.`;
  } else {
    summary = `Seller identity could not be corroborated across independent channels.`;
  }

  return {
    overallRating,
    confidence: totalConf,
    nodes,
    relationships,
    summary,
    trust_signals,
    risk_signals,
  };
}
