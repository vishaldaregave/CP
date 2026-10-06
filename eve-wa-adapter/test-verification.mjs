import test from "node:test";
import assert from "node:assert/strict";

import {
  parseInstagramUrl,
  extractInstagramUrl,
  extractProductAndSeller,
  collectWebsiteEvidence,
  downloadMedia,
  extractPackagingInfo,
  compareInstagramAndWebsite,
  compareImageWithInstagramAndWebsite,
  normalizeEvidence,
  buildTrustMatrix,
  evaluateRisk,
  formatVerificationResult,
  generateVerificationReport,
  buildReportHtml,
  buildReportData,
  escapeHtml,
  collectMetaAdEvidence,
  analyzeAdClaims,
  compareAdvertiserIdentity,
  buildSellerIdentityGraph,
  evaluateProductConsistency,
  buildEvidenceTimeline,
  analyzeReceivedProductImage,
  analyzeReceivedProductText,
  compareAdvertisedVsReceived,
  storePostPurchaseSession,
  getPostPurchaseSession,
  removePostPurchaseSession,
  calculateEvidenceCoverage,
  analyzeAdvertisingIntelligence,
  buildAdvertisingTimeline,
  analyzeDestinationDomains,
  analyzeCreativeHistory,
  matchAdvertiserIdentity,
  correlateAdWithInstagram,
  correlateAdWithWebsite,
  buildAdEvidenceLedger,
  normalizeApifyOrMetaRecord,
  calculateAdvertisingSpan,
  extractDomain,
  investigateInstagramProfile,
  buildProfileInvestigationFromEvidence,
  extractBioClaims,
  verifyBioClaims,
  normalizeBioText,
  extractExternalLinks,
  extractProfileHighlights,
  sampleProfileContent,
  evaluateContentBioConsistency,
  calculateProfileScore,
  createVeriqooServer,
  validateProfileInvestigationRequest,
  executeProfileInvestigation,
} from "./agent/verification/index.ts";
import {
  checkBackendHealth,
  requestProfileInvestigation,
  VeriqooApiError,
} from "./extension/shared/apiClient.ts";
import {
  detectInstagramProfileFromUrl,
  isInstagramHostname,
  isValidInstagramUsername,
} from "./extension/shared/profileDetector.ts";
import {
  parseCount,
  extractExternalUrl,
  extractProfileFromDocument,
} from "./extension/shared/domExtractor.ts";
import {
  DEFAULT_POST_SAMPLE_LIMIT,
  extractHashtags,
  extractMentions,
  extractPostShortcodeAndType,
  extractPostSamplesFromDocument,
} from "./extension/shared/postCollector.ts";
import {
  DEFAULT_HIGHLIGHT_LIMIT,
  DEFAULT_STORY_SAMPLE_LIMIT,
  extractHighlightsFromDocument,
  extractActiveStoriesFromDocument,
} from "./extension/shared/highlightCollector.ts";
import * as fs from "node:fs";
import * as path from "node:path";

test("parseInstagramUrl extracts clean canonical URL and shortcode", () => {
  const reel = parseInstagramUrl("https://www.instagram.com/reel/C8XYZ123/?igsh=token123");
  assert.equal(reel.canonicalUrl, "https://www.instagram.com/reel/C8XYZ123/");
  assert.equal(reel.type, "reel");
  assert.equal(reel.shortcode, "C8XYZ123");

  const post = parseInstagramUrl("https://instagram.com/p/ABC999/");
  assert.equal(post.canonicalUrl, "https://www.instagram.com/p/ABC999/");
  assert.equal(post.type, "post");
  assert.equal(post.shortcode, "ABC999");
});

test("extractInstagramUrl extracts Instagram URLs embedded in text", () => {
  assert.equal(
    extractInstagramUrl("Hey check this out https://www.instagram.com/reel/ABC123/ please"),
    "https://www.instagram.com/reel/ABC123/",
  );
  assert.equal(
    extractInstagramUrl("Visit https://example.com/?next=instagram.com"),
    null,
  );
});

test("collectWebsiteEvidence handles null and empty URLs gracefully", async () => {
  const res = await collectWebsiteEvidence(null);
  assert.equal(res.status, "not_found");
  assert.equal(res.domain, "");
  assert.ok(res.missing_information.length > 0);
});

test("downloadMedia handles null or invalid URLs gracefully", async () => {
  const res = await downloadMedia("invalid-url");
  assert.equal(res, null);
});

test("extractPackagingInfo parses OCR text into structured product & regulatory facts", () => {
  const ocrSample = `
    ABC NUTRITION
    100% WHEY PROTEIN POWDER
    Net Weight: 2kg
    Mfd by: ABC Health Supplements Pvt Ltd
    Plot 45, Industrial Area, Mumbai
    FSSAI Lic No: 11521018000234
    ISO 22000:2018 Certified
    GMP Certified
    100% Organic
    Sugar Free
    MRP: Rs. 3,499 (Incl. of all taxes)
    Mfg: 01/2026
    Exp: 12/2027
    Care: support@abchealth.com, +91 9876543210
    Website: www.abchealth.com
  `;

  const packaging = extractPackagingInfo(ocrSample, "product_image_1");

  assert.equal(packaging.product.brand, "ABC NUTRITION");
  assert.equal(packaging.product.name, "100% WHEY PROTEIN POWDER");
  assert.ok(packaging.product.mrp?.includes("3,499"));
  assert.equal(packaging.manufacturer.name, "ABC Health Supplements Pvt Ltd");
  assert.ok(packaging.regulatory.license_numbers.some((l) => l.includes("11521018000234")));
  assert.ok(packaging.regulatory.certifications.some((c) => c.includes("ISO 22000")));
  assert.ok(packaging.regulatory.certifications.some((c) => c.includes("GMP Certified")));
  assert.equal(packaging.dates.manufactured, "01/2026");
  assert.equal(packaging.dates.expiry, "12/2027");
  assert.ok(packaging.claims.includes("Sugar Free"));
  assert.ok(packaging.websites.includes("www.abchealth.com"));
  assert.ok(packaging.contact_information.includes("support@abchealth.com"));

  assert.ok(packaging.facts.length >= 5);
  assert.equal(packaging.facts[0].source, "product_image_1");
  assert.equal(packaging.facts[0].method, "OCR");
});

test("compareImageWithInstagramAndWebsite performs cross-checks correctly", () => {
  const sampleEvidence = {
    source: { platform: "instagram", url: "https://www.instagram.com/p/123/" },
    account: { username: "abc_nutrition", display_name: "ABC Nutrition" },
    post: { type: "post", caption: "100% Whey Protein Powder for Rs. 3499. Visit https://abchealth.com", timestamp: null },
    product: { name: "100% Whey Protein Powder", brand: "ABC Nutrition", price: "Rs. 3499", category: "Nutrition" },
    seller: { name: "ABC Nutrition", username: "abc_nutrition", website: "https://abchealth.com", contact: null },
    claims: [],
    media: [{ type: "image", url: "https://instagram.com/p/123/media.jpg", source: "instagram" }],
    external_links: ["https://abchealth.com"],
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const packagingSample = {
    product: { name: "100% Whey Protein Powder", brand: "ABC Nutrition", category: null, price: "Rs. 3499", mrp: "Rs. 3499" },
    manufacturer: { name: "ABC Health Supplements", address: null, contact: null },
    regulatory: { license_numbers: ["FSSAI Lic: 11521018000234"], certifications: ["GMP Certified"] },
    dates: { manufactured: "01/2026", expiry: "12/2027", best_before: null },
    claims: ["Sugar Free"],
    websites: ["abchealth.com"],
    contact_information: ["support@abchealth.com"],
    facts: [],
  };

  const websiteSample = {
    url: "https://abchealth.com",
    domain: "abchealth.com",
    status: "accessible",
    company: { name: "ABC Health Supplements", email: "support@abchealth.com", phone: "+919876543210", address: null },
    product: { name: "100% Whey Protein Powder", brand: "ABC Nutrition", price: "Rs. 3499", description: "Pure whey protein" },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const crossCheck = compareImageWithInstagramAndWebsite(
    packagingSample,
    sampleEvidence,
    sampleEvidence.product,
    sampleEvidence.seller,
    websiteSample,
  );

  assert.equal(crossCheck.image_vs_instagram.brand, "MATCH");
  assert.equal(crossCheck.image_vs_instagram.product, "MATCH");
  assert.equal(crossCheck.image_vs_instagram.price, "MATCH");
  assert.equal(crossCheck.image_vs_website.brand, "MATCH");
  assert.equal(crossCheck.image_vs_website.product, "MATCH");
  assert.equal(crossCheck.image_vs_website.manufacturer, "MATCH");
  assert.equal(crossCheck.image_vs_website.contact, "MATCH");
});

test("formatVerificationResult generates complete Feature 4 layout", () => {
  const result = {
    evidence: {
      source: { platform: "instagram", url: "https://www.instagram.com/p/123/" },
      account: { username: "abc_nutrition", display_name: "ABC Nutrition" },
      post: { type: "post", caption: "ABC Protein Powder", timestamp: null },
      product: { name: "ABC Protein Powder", brand: "ABC", price: "$49.99", category: null },
      seller: { name: "ABC Nutrition", username: "abc_nutrition", website: "https://abc.com", contact: null },
      claims: [],
      media: [{ type: "image", url: "https://instagram.com/img.jpg", source: "instagram" }],
      external_links: ["https://abc.com"],
      evidence: [],
      missing_information: [],
      errors: [],
    },
    media_evidence: {
      media: [{ type: "image", url: "https://instagram.com/img.jpg", source: "instagram" }],
      ocr: { text: "ABC Protein Powder MRP $49.99", confidence: 92, status: "success" },
      packaging: {
        product: { name: "ABC Protein Powder", brand: "ABC", category: null, price: "$49.99", mrp: "$49.99" },
        manufacturer: { name: "ABC Labs", address: null, contact: null },
        regulatory: { license_numbers: ["FDA Approved"], certifications: [] },
        dates: { manufactured: null, expiry: null, best_before: null },
        claims: [],
        websites: [],
        contact_information: [],
        facts: [],
      },
      video_analysis: null,
      status: "analyzed",
      evidence: [],
      errors: [],
    },
    website_evidence: {
      url: "https://abc.com",
      domain: "abc.com",
      status: "accessible",
      company: { name: "ABC Labs", email: "help@abc.com", phone: null, address: null },
      product: { name: "ABC Protein Powder", brand: "ABC", price: "$49.99", description: "Pure protein" },
      policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
      evidence: [],
      missing_information: [],
      errors: [],
    },
    product: { name: "ABC Protein Powder", brand: "ABC", price: "$49.99", category: null },
    seller: { name: "ABC Nutrition", username: "abc_nutrition", website: "https://abc.com", contact: null },
    risk: {
      risk_level: "LOW",
      confidence: 91,
      positive_signals: [
        "Brand matches across all sources",
        "Product name is consistent",
        "Packaging matches website",
        "Seller information is consistent",
      ],
      risk_signals: [],
      missing_information: ["Independent company registration not checked"],
      consistency_checks: [],
      recommendation: "Proceed with normal purchasing precautions.",
      explanation: "The available Instagram, website, and packaging evidence is broadly consistent.",
      evidence_check: {
        instagram: true,
        website: true,
        product_image: true,
        ocr: true,
      },
    },
    status: "EVIDENCE_COLLECTED",
  };

  const formatted = formatVerificationResult(result);
  assert.ok(formatted.includes("🔍 PRODUCT VERIFICATION"));
  assert.ok(formatted.includes("Product:\nABC Protein Powder"));
  assert.ok(formatted.includes("Brand:\nABC"));
  assert.ok(formatted.includes("🟢 RISK: LOW"));
  assert.ok(formatted.includes("Confidence:\n91%"));
  assert.ok(formatted.includes("🔎 EVIDENCE CHECK"));
  assert.ok(formatted.includes("Instagram      ✅"));
  assert.ok(formatted.includes("Website        ✅"));
  assert.ok(formatted.includes("Product Image  ✅"));
  assert.ok(formatted.includes("OCR            ✅"));
  assert.ok(formatted.includes("✅ TRUST SIGNALS"));
  assert.ok(formatted.includes("⚠️ RISK SIGNALS"));
  assert.ok(formatted.includes("• None detected"));
  assert.ok(formatted.includes("❓ MISSING INFORMATION"));
  assert.ok(formatted.includes("💡 WHY?"));
  assert.ok(formatted.includes("RECOMMENDATION"));
});

// =========================================================================
// FEATURE 4 TESTS (TEST 1 to TEST 8)
// =========================================================================

test("TEST 1: All sources match -> LOW risk, High confidence", () => {
  const instagram = {
    source: { platform: "instagram", url: "https://instagram.com/p/test1" },
    account: { username: "abc_nutrition", display_name: "ABC Nutrition" },
    post: { type: "post", caption: "ABC Whey Protein - $50. Visit https://abc.com", timestamp: null },
    product: { name: "ABC Whey Protein", brand: "ABC Nutrition", price: "$50", category: "Supplements" },
    seller: { name: "ABC Nutrition", username: "abc_nutrition", website: "https://abc.com", contact: null },
    claims: [],
    media: [{ type: "image", url: "https://instagram.com/img1.jpg", source: "instagram" }],
    external_links: ["https://abc.com"],
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const website = {
    url: "https://abc.com",
    domain: "abc.com",
    status: "accessible",
    company: { name: "ABC Nutrition", email: "support@abc.com", phone: null, address: null },
    product: { name: "ABC Whey Protein", brand: "ABC Nutrition", price: "$50", description: "Top whey protein" },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const media = {
    media: [{ type: "image", url: "https://instagram.com/img1.jpg", source: "instagram" }],
    ocr: { text: "ABC Nutrition ABC Whey Protein MRP $50 FSSAI 11521018000234", confidence: 95, status: "success" },
    packaging: {
      product: { name: "ABC Whey Protein", brand: "ABC Nutrition", category: "Supplements", price: "$50", mrp: "$50" },
      manufacturer: { name: "ABC Nutrition Pvt Ltd", address: null, contact: null },
      regulatory: { license_numbers: ["FSSAI 11521018000234"], certifications: [] },
      dates: { manufactured: null, expiry: null, best_before: null },
      claims: [],
      websites: ["abc.com"],
      contact_information: [],
      facts: [],
    },
    video_analysis: null,
    status: "analyzed",
    evidence: [],
    errors: [],
  };

  const normalized = normalizeEvidence(instagram, instagram.product, instagram.seller, website, media);
  const matrix = buildTrustMatrix(normalized, instagram, website, media);
  const risk = evaluateRisk(instagram, instagram.product, instagram.seller, [], website, null, media, null, matrix);

  assert.equal(risk.risk_level, "LOW");
  assert.ok(risk.confidence >= 80, `Expected confidence >= 80%, got ${risk.confidence}%`);
  assert.equal(risk.risk_signals.length, 0);
  assert.ok(matrix.fields.brand.result === "MATCH");
  assert.ok(matrix.fields.product_name.result === "MATCH");
});

test("TEST 2: Brand mismatch -> Risk increases, Risk signal explains mismatch", () => {
  const instagram = {
    source: { platform: "instagram", url: "https://instagram.com/p/test2" },
    account: { username: "fake_store", display_name: "Fake Store" },
    post: { type: "post", caption: "Original Nike Air Max Sneakers for sale", timestamp: null },
    product: { name: "Nike Air Max Sneakers", brand: "Nike", price: "$40", category: "Shoes" },
    seller: { name: "Fake Store", username: "fake_store", website: null, contact: null },
    claims: [],
    media: [{ type: "image", url: "https://instagram.com/img2.jpg", source: "instagram" }],
    external_links: [],
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const media = {
    media: [{ type: "image", url: "https://instagram.com/img2.jpg", source: "instagram" }],
    ocr: { text: "Abibas Super Sport Shoes", confidence: 90, status: "success" },
    packaging: {
      product: { name: "Abibas Super Sport", brand: "Abibas", category: "Shoes", price: "$40", mrp: "$40" },
      manufacturer: { name: "Abibas Corp", address: null, contact: null },
      regulatory: { license_numbers: [], certifications: [] },
      dates: { manufactured: null, expiry: null, best_before: null },
      claims: [],
      websites: [],
      contact_information: [],
      facts: [],
    },
    video_analysis: null,
    status: "analyzed",
    evidence: [],
    errors: [],
  };

  const normalized = normalizeEvidence(instagram, instagram.product, instagram.seller, null, media);
  const matrix = buildTrustMatrix(normalized, instagram, null, media);
  const risk = evaluateRisk(instagram, instagram.product, instagram.seller, [], null, null, media, null, matrix);

  assert.equal(matrix.fields.brand.result, "MISMATCH");
  assert.equal(risk.risk_level, "HIGH");
  assert.ok(risk.risk_signals.some((s) => s.toLowerCase().includes("brand mismatch")));
});

test("TEST 3: Product mismatch -> Risk increases", () => {
  const instagram = {
    source: { platform: "instagram", url: "https://instagram.com/p/test3" },
    account: { username: "tech_reseller", display_name: "Tech Reseller" },
    post: { type: "post", caption: "Brand New iPhone 16 Pro Max", timestamp: null },
    product: { name: "iPhone 16 Pro Max", brand: "Apple", price: "$999", category: "Smartphones" },
    seller: { name: "Tech Reseller", username: "tech_reseller", website: "https://techstore.com", contact: null },
    claims: [],
    media: [{ type: "image", url: "https://instagram.com/img3.jpg", source: "instagram" }],
    external_links: ["https://techstore.com"],
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const website = {
    url: "https://techstore.com",
    domain: "techstore.com",
    status: "accessible",
    company: { name: "Tech Store", email: "tech@store.com", phone: null, address: null },
    product: { name: "Wireless Bluetooth Earbuds Pro", brand: "TechStore", price: "$29", description: "Wireless earbuds" },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const normalized = normalizeEvidence(instagram, instagram.product, instagram.seller, website, null);
  const matrix = buildTrustMatrix(normalized, instagram, website, null);
  const risk = evaluateRisk(instagram, instagram.product, instagram.seller, [], website, null, null, null, matrix);

  assert.equal(matrix.fields.product_name.result, "MISMATCH");
  assert.equal(risk.risk_level, "HIGH");
  assert.ok(risk.risk_signals.some((s) => s.toLowerCase().includes("product mismatch")));
});

test("TEST 4: Only Instagram available -> UNKNOWN/LOW confidence", () => {
  const instagram = {
    source: { platform: "instagram", url: "https://instagram.com/p/test4" },
    account: { username: "handmade_crafts", display_name: "Handmade Crafts" },
    post: { type: "post", caption: "Handmade Ceramic Mug - DM to order", timestamp: null },
    product: { name: "Handmade Ceramic Mug", brand: null, price: null, category: "Crafts" },
    seller: { name: "Handmade Crafts", username: "handmade_crafts", website: null, contact: null },
    claims: [],
    media: [],
    external_links: [],
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const normalized = normalizeEvidence(instagram, instagram.product, instagram.seller, null, null);
  const matrix = buildTrustMatrix(normalized, instagram, null, null);
  const risk = evaluateRisk(instagram, instagram.product, instagram.seller, [], null, null, null, null, matrix);

  assert.equal(risk.risk_level, "UNKNOWN");
  assert.ok(risk.confidence <= 35, `Expected confidence <= 35%, got ${risk.confidence}%`);
  assert.equal(risk.risk_signals.length, 0); // Not marked as fraudulent just because single source
});

test("TEST 5: OCR unavailable -> Pipeline still works", () => {
  const instagram = {
    source: { platform: "instagram", url: "https://instagram.com/p/test5" },
    account: { username: "glow_skincare", display_name: "Glow Skincare" },
    post: { type: "post", caption: "Vitamin C Serum. Visit https://glowskin.com", timestamp: null },
    product: { name: "Vitamin C Serum", brand: "Glow Skincare", price: "$25", category: "Skincare" },
    seller: { name: "Glow Skincare", username: "glow_skincare", website: "https://glowskin.com", contact: null },
    claims: [],
    media: [{ type: "image", url: "https://instagram.com/img5.jpg", source: "instagram" }],
    external_links: ["https://glowskin.com"],
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const website = {
    url: "https://glowskin.com",
    domain: "glowskin.com",
    status: "accessible",
    company: { name: "Glow Skincare LLC", email: "info@glowskin.com", phone: null, address: null },
    product: { name: "Vitamin C Serum", brand: "Glow Skincare", price: "$25", description: "Brightening serum" },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const mediaFailedOcr = {
    media: [{ type: "image", url: "https://instagram.com/img5.jpg", source: "instagram" }],
    ocr: null,
    packaging: null,
    video_analysis: null,
    status: "not_available",
    evidence: [],
    errors: ["OCR failed to extract text"],
  };

  const normalized = normalizeEvidence(instagram, instagram.product, instagram.seller, website, mediaFailedOcr);
  const matrix = buildTrustMatrix(normalized, instagram, website, mediaFailedOcr);
  const risk = evaluateRisk(instagram, instagram.product, instagram.seller, [], website, null, mediaFailedOcr, null, matrix);

  assert.equal(risk.risk_level, "LOW");
  assert.ok(matrix.evidence_check.ocr === false);
  assert.ok(matrix.missing_information.some((m) => m.includes("OCR") || m.includes("Packaging")));
  assert.ok(!risk.risk_signals.some((s) => s.toLowerCase().includes("ocr")));
});

test("TEST 6: Website unavailable -> Pipeline still works", () => {
  const instagram = {
    source: { platform: "instagram", url: "https://instagram.com/p/test6" },
    account: { username: "pure_honey", display_name: "Pure Honey Co" },
    post: { type: "post", caption: "Raw Organic Honey 500g", timestamp: null },
    product: { name: "Raw Organic Honey", brand: "Pure Honey Co", price: "$15", category: "Food" },
    seller: { name: "Pure Honey Co", username: "pure_honey", website: null, contact: null },
    claims: [],
    media: [{ type: "image", url: "https://instagram.com/img6.jpg", source: "instagram" }],
    external_links: [],
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const media = {
    media: [{ type: "image", url: "https://instagram.com/img6.jpg", source: "instagram" }],
    ocr: { text: "Pure Honey Co Raw Organic Honey Net Wt 500g FSSAI 1122334455", confidence: 92, status: "success" },
    packaging: {
      product: { name: "Raw Organic Honey", brand: "Pure Honey Co", category: "Food", price: "$15", mrp: "$15" },
      manufacturer: { name: "Pure Honey Farms", address: null, contact: null },
      regulatory: { license_numbers: ["FSSAI 1122334455"], certifications: [] },
      dates: { manufactured: null, expiry: null, best_before: null },
      claims: ["Raw Organic"],
      websites: [],
      contact_information: [],
      facts: [],
    },
    video_analysis: null,
    status: "analyzed",
    evidence: [],
    errors: [],
  };

  const normalized = normalizeEvidence(instagram, instagram.product, instagram.seller, null, media);
  const matrix = buildTrustMatrix(normalized, instagram, null, media);
  const risk = evaluateRisk(instagram, instagram.product, instagram.seller, [], null, null, media, null, matrix);

  assert.equal(risk.risk_level, "LOW");
  assert.ok(matrix.evidence_check.website === false);
  assert.ok(matrix.fields.brand.result === "MATCH");
  assert.ok(matrix.trust_signals.length >= 1);
});

test("TEST 7: No evidence -> UNKNOWN", () => {
  const emptyInstagram = {
    source: { platform: "instagram", url: "https://instagram.com/p/empty" },
    account: { username: null, display_name: null },
    post: { type: null, caption: null, timestamp: null },
    product: { name: null, brand: null, price: null, category: null },
    seller: { name: null, username: null, website: null, contact: null },
    claims: [],
    media: [],
    external_links: [],
    evidence: [],
    missing_information: ["Instagram metadata could not be fetched"],
    errors: ["Private post or invalid URL"],
  };

  const risk = evaluateRisk(emptyInstagram, emptyInstagram.product, emptyInstagram.seller, [], null, null, null, null, null);

  assert.equal(risk.risk_level, "UNKNOWN");
  assert.equal(risk.confidence, 0);
  assert.ok(risk.missing_information.length > 0);
});

test("TEST 8: Multiple positive signals + one missing field -> Missing field does not create a risk signal", () => {
  const instagram = {
    source: { platform: "instagram", url: "https://instagram.com/p/test8" },
    account: { username: "fit_nutrition", display_name: "Fit Nutrition" },
    post: { type: "post", caption: "Fit Nutrition Creatine Monohydrate 250g. Visit https://fitnutrition.com", timestamp: null },
    product: { name: "Creatine Monohydrate", brand: "Fit Nutrition", price: "$20", category: "Supplements" },
    seller: { name: "Fit Nutrition", username: "fit_nutrition", website: "https://fitnutrition.com", contact: null },
    claims: [],
    media: [{ type: "image", url: "https://instagram.com/img8.jpg", source: "instagram" }],
    external_links: ["https://fitnutrition.com"],
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const website = {
    url: "https://fitnutrition.com",
    domain: "fitnutrition.com",
    status: "accessible",
    company: { name: "Fit Nutrition", email: "info@fitnutrition.com", phone: null, address: null },
    product: { name: "Creatine Monohydrate", brand: "Fit Nutrition", price: "$20", description: "Pure creatine" },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const mediaMissingContact = {
    media: [{ type: "image", url: "https://instagram.com/img8.jpg", source: "instagram" }],
    ocr: { text: "Fit Nutrition Creatine Monohydrate 250g", confidence: 90, status: "success" },
    packaging: {
      product: { name: "Creatine Monohydrate", brand: "Fit Nutrition", category: "Supplements", price: "$20", mrp: "$20" },
      manufacturer: { name: null, address: null, contact: null }, // Missing manufacturer & contact
      regulatory: { license_numbers: [], certifications: [] },
      dates: { manufactured: null, expiry: null, best_before: null },
      claims: [],
      websites: [],
      contact_information: [],
      facts: [],
    },
    video_analysis: null,
    status: "analyzed",
    evidence: [],
    errors: [],
  };

  const normalized = normalizeEvidence(instagram, instagram.product, instagram.seller, website, mediaMissingContact);
  const matrix = buildTrustMatrix(normalized, instagram, website, mediaMissingContact);
  const risk = evaluateRisk(instagram, instagram.product, instagram.seller, [], website, null, mediaMissingContact, null, matrix);

  // Missing manufacturer on packaging is MISSING INFO, not RISK SIGNAL
  assert.equal(risk.risk_level, "LOW");
  assert.equal(risk.risk_signals.length, 0);
  assert.ok(matrix.trust_signals.length >= 2);
  assert.ok(matrix.traceable_conclusions.length >= 3);
});

// =========================================================================
// FEATURE 5 TESTS (DETAILED VERIFICATION REPORT)
// =========================================================================

test("FEATURE 5 - TEST 1: Report generation succeeds and creates file", () => {
  const sampleResult = {
    evidence: {
      source: { platform: "instagram", url: "https://instagram.com/p/rep1" },
      account: { username: "official_brand", display_name: "Official Brand" },
      post: { type: "post", caption: "Premium Protein Powder. Visit https://officialbrand.com", timestamp: null },
      product: { name: "Premium Protein Powder", brand: "Official Brand", price: "$60", category: "Nutrition" },
      seller: { name: "Official Brand", username: "official_brand", website: "https://officialbrand.com", contact: "help@brand.com" },
      claims: [],
      media: [{ type: "image", url: "https://instagram.com/img.jpg", source: "instagram" }],
      external_links: ["https://officialbrand.com"],
      evidence: ["Caption found", "Profile verified"],
      missing_information: [],
      errors: [],
    },
    website_evidence: {
      url: "https://officialbrand.com",
      domain: "officialbrand.com",
      status: "accessible",
      company: { name: "Official Brand LLC", email: "help@brand.com", phone: "+1234567890", address: "100 Brand Way" },
      product: { name: "Premium Protein Powder", brand: "Official Brand", price: "$60", description: "Clean whey" },
      policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
      evidence: [],
      missing_information: [],
      errors: [],
    },
    media_evidence: {
      media: [{ type: "image", url: "https://instagram.com/img.jpg", source: "instagram" }],
      ocr: { text: "Official Brand Premium Protein Powder MRP $60", confidence: 95, status: "success" },
      packaging: {
        product: { name: "Premium Protein Powder", brand: "Official Brand", category: "Nutrition", price: "$60", mrp: "$60" },
        manufacturer: { name: "Official Brand LLC", address: "100 Brand Way", contact: "help@brand.com" },
        regulatory: { license_numbers: ["FDA-12345"], certifications: ["ISO-9001"] },
        dates: { manufactured: "01/2026", expiry: "12/2027", best_before: null },
        claims: ["GMP Certified"],
        websites: ["officialbrand.com"],
        contact_information: ["help@brand.com"],
        facts: [],
      },
      video_analysis: null,
      status: "analyzed",
      evidence: [],
      errors: [],
    },
    product: { name: "Premium Protein Powder", brand: "Official Brand", price: "$60", category: "Nutrition" },
    seller: { name: "Official Brand", username: "official_brand", website: "https://officialbrand.com", contact: "help@brand.com" },
    risk: {
      risk_level: "LOW",
      confidence: 92,
      positive_signals: ["Brand matches across all sources", "Product name is consistent"],
      risk_signals: [],
      missing_information: ["Independent business registration not checked"],
      consistency_checks: [],
      recommendation: "Proceed with normal purchasing precautions.",
      explanation: "All sources are consistent.",
      evidence_check: { instagram: true, website: true, product_image: true, ocr: true },
    },
    trust_matrix: {
      fields: {
        brand: { field: "brand", valuesBySource: { instagram: "Official Brand", website: "Official Brand", product_image: "Official Brand" }, result: "MATCH", explanation: "Brand matches" },
        product_name: { field: "product_name", valuesBySource: { instagram: "Premium Protein Powder", website: "Premium Protein Powder", product_image: "Premium Protein Powder" }, result: "MATCH", explanation: "Product matches" },
      },
      available_sources: ["instagram", "website", "product_image", "seller"],
      evidence_check: { instagram: true, website: true, product_image: true, ocr: true },
      trust_signals: [{ signal: "Brand matches across sources", severity: "positive", sources: ["instagram", "website", "product_image"] }],
      risk_signals: [],
      missing_information: ["Independent business registration not checked"],
      traceable_conclusions: [
        { conclusion: "Brand is consistent", evidence: [{ source: "instagram", value: "Official Brand" }, { source: "website", value: "Official Brand" }] },
      ],
      summary_explanation: "Broadly consistent evidence across all channels.",
    },
    status: "EVIDENCE_COLLECTED",
  };

  const report = generateVerificationReport(sampleResult);
  assert.ok(report.report_id.startsWith("REP-"));
  assert.ok(fs.existsSync(report.file_path));
  assert.ok(report.html.length > 500);
});

test("FEATURE 5 - TEST 2: HTML contains product information", () => {
  const result = {
    product: { name: "Super Vitamin C Serum", brand: "Radiant Skin", price: "$28", category: "Cosmetics" },
    seller: { name: "Radiant Skin", username: "radiant_skin", website: null, contact: null },
    risk: { risk_level: "LOW", confidence: 80, positive_signals: [], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "OK" },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/c1" }, account: { username: "radiant_skin" }, post: { caption: "Vitamin C" }, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };
  const data = buildReportData(result);
  const html = buildReportHtml(data, result);

  assert.ok(html.includes("Super Vitamin C Serum"));
  assert.ok(html.includes("Radiant Skin"));
  assert.ok(html.includes("$28"));
  assert.ok(html.includes("Cosmetics"));
});

test("FEATURE 5 - TEST 3: HTML contains risk level", () => {
  const lowResult = {
    product: { name: "Item", brand: "B" },
    seller: {},
    risk: { risk_level: "LOW", confidence: 85, positive_signals: [], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "Safe" },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: {}, post: {}, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };
  const data = buildReportData(lowResult);
  const html = buildReportHtml(data, lowResult);
  assert.ok(html.includes("LOW RISK"));

  const highResult = { ...lowResult, risk: { ...lowResult.risk, risk_level: "HIGH" } };
  const dataHigh = buildReportData(highResult);
  const htmlHigh = buildReportHtml(dataHigh, highResult);
  assert.ok(htmlHigh.includes("HIGH RISK"));
});

test("FEATURE 5 - TEST 4: HTML contains confidence score", () => {
  const result = {
    product: { name: "Item", brand: "B" },
    seller: {},
    risk: { risk_level: "MEDIUM", confidence: 73, positive_signals: [], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "Proceed with caution" },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: {}, post: {}, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };
  const data = buildReportData(result);
  const html = buildReportHtml(data, result);
  assert.ok(html.includes("73%"));
});

test("FEATURE 5 - TEST 5: HTML contains evidence sections", () => {
  const result = {
    product: { name: "Item", brand: "B" },
    seller: { username: "shop_owner", website: "https://shop.com" },
    risk: { risk_level: "LOW", confidence: 90, positive_signals: [], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "OK" },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: { username: "shop_owner" }, post: { caption: "Caption text" }, media: [{ type: "image", url: "https://img.jpg", source: "instagram" }], external_links: ["https://shop.com"], evidence: [], missing_information: [], errors: [] },
    website_evidence: { url: "https://shop.com", domain: "shop.com", status: "accessible", company: { name: "Shop Inc", email: null, phone: null, address: null }, product: { name: "Item", brand: "B", price: null, description: null }, policies: { refund: true, return: true, shipping: true, privacy: true, terms: true }, evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };
  const data = buildReportData(result);
  const html = buildReportHtml(data, result);

  assert.ok(html.includes("Source Overview"));
  assert.ok(html.includes("Product &amp; Seller Information") || html.includes("Product & Seller Information"));
  assert.ok(html.includes("Cross-Source Consistency Matrix"));
  assert.ok(html.includes("Executive Finding"));
});

test("FEATURE 5 - TEST 6: HTML contains trust signals", () => {
  const result = {
    product: { name: "Item", brand: "B" },
    seller: {},
    risk: { risk_level: "LOW", confidence: 85, positive_signals: [], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "OK" },
    trust_matrix: {
      fields: {},
      available_sources: ["instagram", "website"],
      evidence_check: { instagram: true, website: true, product_image: false, ocr: false },
      trust_signals: [
        { signal: "Packaging matches website", severity: "positive", sources: ["product_image", "website"] },
        { signal: "Verified FSSAI license", severity: "positive", sources: ["product_image"] },
      ],
      risk_signals: [],
      missing_information: [],
      traceable_conclusions: [],
      summary_explanation: "",
    },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: {}, post: {}, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };
  const data = buildReportData(result);
  const html = buildReportHtml(data, result);

  assert.ok(html.includes("Packaging matches website"));
  assert.ok(html.includes("Verified FSSAI license"));
  assert.ok(html.includes("Sources: product_image, website"));
});

test("FEATURE 5 - TEST 7: HTML contains risk signals", () => {
  const result = {
    product: { name: "Item", brand: "B" },
    seller: {},
    risk: { risk_level: "HIGH", confidence: 88, positive_signals: [], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "Avoid" },
    trust_matrix: {
      fields: {},
      available_sources: ["instagram", "website"],
      evidence_check: { instagram: true, website: true, product_image: false, ocr: false },
      trust_signals: [],
      risk_signals: [
        { signal: "Brand mismatch detected between listing and packaging", severity: "high", sources: ["instagram", "product_image"] },
      ],
      missing_information: [],
      traceable_conclusions: [],
      summary_explanation: "",
    },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: {}, post: {}, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };
  const data = buildReportData(result);
  const html = buildReportHtml(data, result);

  assert.ok(html.includes("Brand mismatch detected between listing and packaging"));
  assert.ok(html.includes("HIGH"));
});

test("FEATURE 5 - TEST 8: HTML contains missing information distinctly", () => {
  const result = {
    product: { name: "Item", brand: "B" },
    seller: {},
    risk: {
      risk_level: "LOW",
      confidence: 70,
      positive_signals: [],
      risk_signals: [],
      missing_information: ["Company registration was not independently verified.", "Packaging OCR was partially obscured."],
      consistency_checks: [],
      recommendation: "OK",
    },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: {}, post: {}, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };
  const data = buildReportData(result);
  const html = buildReportHtml(data, result);

  assert.ok(html.includes("Missing Information"));
  assert.ok(html.includes("Company registration was not independently verified."));
  assert.ok(html.includes("Packaging OCR was partially obscured."));
});

test("FEATURE 5 - TEST 9: HTML contains traceable conclusions", () => {
  const result = {
    product: { name: "Item", brand: "B" },
    seller: {},
    risk: { risk_level: "LOW", confidence: 90, positive_signals: [], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "OK" },
    trust_matrix: {
      fields: {},
      available_sources: ["instagram", "website"],
      evidence_check: { instagram: true, website: true, product_image: false, ocr: false },
      trust_signals: [],
      risk_signals: [],
      missing_information: [],
      traceable_conclusions: [
        {
          conclusion: "Brand is consistent across all sources",
          evidence: [
            { source: "instagram", value: "Nike Shoes" },
            { source: "website", value: "Nike Shoes" },
          ],
        },
      ],
      summary_explanation: "",
    },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: {}, post: {}, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };
  const data = buildReportData(result);
  const html = buildReportHtml(data, result);

  assert.ok(html.includes("Evidence Traceability"));
  assert.ok(html.includes("Brand is consistent across all sources"));
  assert.ok(html.includes("Nike Shoes"));
});

test("FEATURE 5 - TEST 10: Dynamic HTML is properly escaped", () => {
  const maliciousInput = `<script>alert('XSS')</script>" onclick="hack()`;
  const escaped = escapeHtml(maliciousInput);
  assert.ok(!escaped.includes("<script>"));
  assert.ok(escaped.includes("&lt;script&gt;"));
  assert.ok(escaped.includes("&quot;"));

  const result = {
    product: { name: "<img src=x onerror=alert(1)>", brand: "<b>BoldBrand</b>" },
    seller: { username: "seller<script>", name: "Malicious' OR '1'='1" },
    risk: { risk_level: "LOW", confidence: 50, positive_signals: ["<svg onload=alert(2)>"], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "Safe" },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/<xss>" }, account: {}, post: {}, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };
  const data = buildReportData(result);
  const html = buildReportHtml(data, result);

  assert.ok(!html.includes("<img src=x onerror=alert(1)>"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<svg onload=alert(2)>"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("FEATURE 5 - TEST 11: Missing evidence does not crash report generation", () => {
  const resultWithoutWebsiteOrMedia = {
    product: { name: "Handmade Mug", brand: null, price: null, category: null },
    seller: { name: null, username: "craft_maker", website: null, contact: null },
    risk: { risk_level: "UNKNOWN", confidence: 25, positive_signals: [], risk_signals: [], missing_information: ["No website"], consistency_checks: [], recommendation: "Verify" },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/test" }, account: { username: "craft_maker" }, post: { caption: "My mug" }, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    website_evidence: null,
    media_evidence: null,
    status: "EVIDENCE_COLLECTED",
  };

  const report = generateVerificationReport(resultWithoutWebsiteOrMedia);
  assert.ok(report.html.includes("Handmade Mug"));
  assert.ok(report.html.includes("UNAVAILABLE"));
});

test("FEATURE 5 - TEST 12: Empty VerificationResult is handled safely", () => {
  const emptyResult = {
    product: { name: null, brand: null, price: null, category: null },
    seller: { name: null, username: null, website: null, contact: null },
    risk: { risk_level: "UNKNOWN", confidence: 0, positive_signals: [], risk_signals: [], missing_information: ["No data"], consistency_checks: [], recommendation: "Unable to verify" },
    evidence: { source: { platform: "instagram", url: "" }, account: { username: null, display_name: null }, post: { type: null, caption: null, timestamp: null }, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "INSUFFICIENT_EVIDENCE",
  };

  const report = generateVerificationReport(emptyResult);
  assert.ok(report.html.includes("UNKNOWN RISK"));
  assert.ok(report.html.includes("Not available") || report.html.includes("Unspecified"));
});

// ==========================================
// META AD INTELLIGENCE & AD CLAIM TESTS (20 SCENARIOS)
// ==========================================

test("META TEST 1: Meta API returns an ad", async () => {
  const originalFetch = globalThis.fetch;
  process.env.META_AD_LIBRARY_ACCESS_TOKEN = "EAAB_VALID_MOCK_TOKEN";
  try {
    globalThis.fetch = async (url) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: "AD_1001",
              page_id: "PAGE_999",
              page_name: "Joota Vyapari Official",
              publisher_platforms: ["INSTAGRAM"],
              ad_delivery_start_time: "2026-08-01T00:00:00+0000",
              ad_delivery_stop_time: null,
              ad_creative_bodies: ["Premium leather shoes 90% OFF today only"],
              ad_creative_link_titles: ["Handcrafted Oxford Shoes"],
              ad_creative_link_descriptions: ["Genuine leather with rubber sole"],
              ad_creative_link_captions: ["https://jootavyapari.com/oxford"],
              ad_snapshot_url: "https://www.facebook.com/ads/archive/render_ad/?id=AD_1001",
            },
          ],
        }),
      };
    };

    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/test1/",
      instagramHandle: "joota_vyapari",
      sellerName: "Joota Vyapari",
      brand: "Joota Vyapari",
      product: "Handcrafted Oxford Shoes",
    });

    assert.equal(result.status, "found");
    assert.equal(result.totalFound, 1);
    assert.equal(result.ads.length, 1);
    assert.equal(result.ads[0].libraryId, "AD_1001");
    assert.equal(result.ads[0].advertiserName, "Joota Vyapari Official");
    assert.equal(result.ads[0].advertiserPageId, "PAGE_999");
    assert.equal(result.ads[0].adText, "Premium leather shoes 90% OFF today only");
    assert.equal(result.ads[0].linkTitle, "Handcrafted Oxford Shoes");
    assert.equal(result.ads[0].destinationUrl, "https://jootavyapari.com/oxford");
    assert.equal(result.ads[0].adSnapshotUrl, "https://www.facebook.com/ads/archive/render_ad/?id=AD_1001");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  }
});

test("META TEST 2: Meta API returns multiple ads", async () => {
  const originalFetch = globalThis.fetch;
  process.env.META_AD_LIBRARY_ACCESS_TOKEN = "EAAB_VALID_MOCK_TOKEN";
  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: "AD_1", page_name: "BrandStore", ad_creative_bodies: ["Ad 1 Body"] },
          { id: "AD_2", page_name: "BrandStore", ad_creative_bodies: ["Ad 2 Body"] },
          { id: "AD_3", page_name: "BrandStore", ad_creative_bodies: ["Ad 3 Body"] },
        ],
      }),
    });

    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/multitest/",
      instagramHandle: "brandstore",
    });

    assert.equal(result.status, "found");
    assert.equal(result.totalFound, 3);
    assert.equal(result.ads.length, 3);
    assert.equal(result.ads[0].libraryId, "AD_1");
    assert.equal(result.ads[1].libraryId, "AD_2");
    assert.equal(result.ads[2].libraryId, "AD_3");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  }
});

test("META TEST 3: Instagram publisher platform filtering", async () => {
  const originalFetch = globalThis.fetch;
  process.env.META_AD_LIBRARY_ACCESS_TOKEN = "EAAB_VALID_MOCK_TOKEN";
  let capturedUrl = "";
  try {
    globalThis.fetch = async (url) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: "AD_INSTA", page_name: "Shop", publisher_platforms: ["INSTAGRAM"] }],
        }),
      };
    };

    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/plat1/",
      instagramHandle: "shop_ig",
    });

    assert.ok(capturedUrl.includes("publisher_platforms="));
    assert.equal(result.ads[0].publisherPlatforms[0], "INSTAGRAM");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  }
});

test("META TEST 4: Advertiser extraction", async () => {
  const originalFetch = globalThis.fetch;
  process.env.META_AD_LIBRARY_ACCESS_TOKEN = "EAAB_VALID_MOCK_TOKEN";
  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: "AD_ADV", page_id: "PAGE_12345", page_name: "Apex Electronics India" }],
      }),
    });

    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/adv1/",
      sellerName: "Apex Electronics",
    });

    assert.equal(result.advertiserName, "Apex Electronics India");
    assert.equal(result.advertiserPageId, "PAGE_12345");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  }
});

test("META TEST 5: Ad text extraction", async () => {
  const originalFetch = globalThis.fetch;
  process.env.META_AD_LIBRARY_ACCESS_TOKEN = "EAAB_VALID_MOCK_TOKEN";
  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: "AD_TXT",
            ad_creative_bodies: ["Line 1 text", "Line 2 text"],
            ad_creative_link_titles: ["Headline 1"],
            ad_creative_link_descriptions: ["Description text"],
          },
        ],
      }),
    });

    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/txt1/",
      brand: "SomeBrand",
    });

    assert.equal(result.adText, "Line 1 text\nLine 2 text");
    assert.equal(result.linkTitle, "Headline 1");
    assert.equal(result.linkDescription, "Description text");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  }
});

test("META TEST 6: Snapshot URL extraction", async () => {
  const originalFetch = globalThis.fetch;
  process.env.META_AD_LIBRARY_ACCESS_TOKEN = "EAAB_VALID_MOCK_TOKEN";
  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: "AD_SNAP",
            ad_snapshot_url: "https://www.facebook.com/ads/archive/render_ad/?id=AD_SNAP",
          },
        ],
      }),
    });

    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/snap1/",
      brand: "SomeBrand",
    });

    assert.equal(result.adSnapshotUrl, "https://www.facebook.com/ads/archive/render_ad/?id=AD_SNAP");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  }
});

test("META TEST 7: Delivery dates extraction and normalization", async () => {
  const originalFetch = globalThis.fetch;
  process.env.META_AD_LIBRARY_ACCESS_TOKEN = "EAAB_VALID_MOCK_TOKEN";
  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: "AD_DATES",
            ad_delivery_start_time: "2026-09-01T12:30:00+0000",
            ad_delivery_stop_time: "2026-09-15T18:00:00+0000",
          },
        ],
      }),
    });

    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/dates1/",
      brand: "SomeBrand",
    });

    assert.equal(result.deliveryStart, "2026-09-01");
    assert.equal(result.deliveryEnd, "2026-09-15");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  }
});

test("META TEST 8: Claim detection across discount, urgency, scarcity, authenticity, certification", () => {
  const copy = "Special 90% OFF! Buy 1 Get 2 Free. 100% Original Genuine Shoes. FDA approved formula. TODAY ONLY - Only 2 left in stock! 5-star rated.";
  const claims = analyzeAdClaims(copy, "meta_ad");

  assert.ok(claims.price_claims.some((c) => c.includes("90% OFF")));
  assert.ok(claims.authenticity_claims.some((c) => /100% original|genuine/i.test(c)));
  assert.ok(claims.urgency_claims.some((c) => /today only/i.test(c)));
  assert.ok(claims.scarcity_claims.some((c) => /only 2 left/i.test(c)));
  assert.ok(claims.authority_claims.some((c) => /fda approved/i.test(c)));
  assert.ok(claims.social_proof_claims.some((c) => /5-star/i.test(c)));
  assert.ok(claims.ad_pressure_signals.length >= 4);
});

test("META TEST 9: Advertiser MATCH", () => {
  const check = compareAdvertiserIdentity("joota_vyapari", "Joota Vyapari", "Joota Vyapari Store");
  assert.equal(check.result, "MATCH");
  assert.ok(check.details.includes("matches"));
});

test("META TEST 10: Advertiser MISMATCH", () => {
  const check = compareAdvertiserIdentity("joota_vyapari", "XYZ Electronics Pvt Ltd", "Random Corp");
  assert.equal(check.result, "MISMATCH");
  assert.ok(check.details.includes("does not match"));
});

test("META TEST 11: Advertiser UNKNOWN", () => {
  const check = compareAdvertiserIdentity(null, null, null);
  assert.equal(check.result, "UNKNOWN");
});

test("META TEST 12: API token missing returns unavailable without throwing", async () => {
  const originalToken = process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  try {
    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/test/",
      instagramHandle: "teststore",
    });
    assert.equal(result.status, "unavailable");
    assert.ok(result.error?.includes("No Meta Ad Library access token"));
    assert.equal(result.ads.length, 0);
  } finally {
    if (originalToken) process.env.META_AD_LIBRARY_ACCESS_TOKEN = originalToken;
  }
});

test("META TEST 13: API timeout handled gracefully", async () => {
  const originalFetch = globalThis.fetch;
  process.env.META_AD_LIBRARY_ACCESS_TOKEN = "EAAB_MOCK_TOKEN";
  try {
    globalThis.fetch = async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    };

    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/timeout1/",
      instagramHandle: "timeoutstore",
    });

    assert.ok(["unavailable", "error"].includes(result.status));
    assert.ok(result.error?.includes("timed out") || result.error?.includes("aborted"));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  }
});

test("META TEST 14: API error handled gracefully", async () => {
  const originalFetch = globalThis.fetch;
  process.env.META_AD_LIBRARY_ACCESS_TOKEN = "EAAB_MOCK_TOKEN";
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "Internal server error from Meta" } }),
    });

    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/err1/",
      instagramHandle: "errstore",
    });

    assert.ok(["error", "unavailable"].includes(result.status));
    assert.ok(result.error?.includes("Internal server error"));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  }
});

test("META TEST 15: Meta commercial coverage unavailable preserves limitation", async () => {
  const originalFetch = globalThis.fetch;
  process.env.META_AD_LIBRARY_ACCESS_TOKEN = "EAAB_MOCK_TOKEN";
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: "Unsupported country or commercial ads archive coverage restricted for ad_type ALL in IN",
          code: 100,
        },
      }),
    });

    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/cov1/",
      instagramHandle: "covstore",
    });

    assert.equal(result.status, "unavailable");
    assert.ok(result.limitation?.includes("Meta's official Ad Library API did not provide the requested commercial-ad coverage"));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  }
});

test("META TEST 16: Zero results returns not_found without fabricating data", async () => {
  const originalFetch = globalThis.fetch;
  process.env.META_AD_LIBRARY_ACCESS_TOKEN = "EAAB_MOCK_TOKEN";
  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    const result = await collectMetaAdEvidence({
      instagramUrl: "https://www.instagram.com/p/zero1/",
      instagramHandle: "zero_ads_store",
    });

    assert.equal(result.status, "not_found");
    assert.equal(result.ads.length, 0);
    assert.equal(result.totalFound, 0);
    assert.ok(result.limitation?.includes("No matching ads were returned by the Meta Ad Library API for the current query."));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.META_AD_LIBRARY_ACCESS_TOKEN;
  }
});

test("META TEST 17: Zero results does NOT increase risk", () => {
  const evidence = {
    source: { platform: "instagram", url: "https://instagram.com/p/1" },
    account: { username: "artisan_pottery" },
    post: { caption: "Handmade ceramic cups" },
    media: [],
    external_links: [],
    evidence: [],
    missing_information: [],
    errors: [],
  };
  const product = { name: "Handmade Mug", brand: "Artisan Pottery" };
  const seller = { username: "artisan_pottery" };
  const metaAd = {
    status: "not_found",
    queryTerms: ["artisan_pottery"],
    country: "IN",
    ads: [],
    totalFound: 0,
    source: "meta_ad_library",
    collectedAt: new Date().toISOString(),
    limitation: "No matching ads were returned by the Meta Ad Library API for the current query.",
    evidenceSource: "Meta Ad Library",
  };

  const risk = evaluateRisk(evidence, product, seller, [], null, null, null, null, null, metaAd);
  assert.notEqual(risk.risk_level, "HIGH");
  assert.equal(risk.risk_signals.length, 0);
});

test("META TEST 18: Meta ad presence does NOT force LOW risk", () => {
  const evidence = {
    source: { platform: "instagram", url: "https://instagram.com/p/1" },
    account: { username: "unverified_seller" },
    post: { caption: "Buy cheap watch" },
    media: [],
    external_links: [],
    evidence: [],
    missing_information: [],
    errors: [],
  };
  const product = { name: "Watch", brand: null };
  const seller = { username: "unverified_seller" };
  const metaAd = {
    status: "found",
    queryTerms: ["unverified_seller"],
    country: "IN",
    ads: [{ libraryId: "AD_999", advertiserName: "Watch Seller", publisherPlatforms: ["INSTAGRAM"], evidenceSource: "meta_ad_library" }],
    totalFound: 1,
    source: "meta_ad_library",
    collectedAt: new Date().toISOString(),
    evidenceSource: "Meta Ad Library",
  };

  const risk = evaluateRisk(evidence, product, seller, [], null, null, null, null, null, metaAd);
  assert.notEqual(risk.risk_level, "LOW");
});

test("META TEST 19: Existing Instagram evidence still works", () => {
  const parsed = parseInstagramUrl("https://www.instagram.com/reel/C8XYZ123/?igsh=token123");
  assert.equal(parsed.canonicalUrl, "https://www.instagram.com/reel/C8XYZ123/");
  assert.equal(parsed.type, "reel");
  assert.equal(parsed.shortcode, "C8XYZ123");
});

test("META TEST 20: Existing Website evidence still works", async () => {
  const res = await collectWebsiteEvidence(null);
  assert.equal(res.status, "not_found");
  assert.equal(res.domain, "");
});

// ===========================================================================
// FEATURE 1: SELLER IDENTITY GRAPH TESTS
// ===========================================================================

test("FEATURE 1: Seller identity MATCH across Instagram, Meta, and Website", () => {
  const instagram = {
    account: { username: "joota_vyapari", display_name: "Joota Vyapari" },
    post: {},
    media: [],
    external_links: ["https://jootavyapari.com"],
  };
  const seller = { username: "joota_vyapari", name: "Joota Vyapari" };
  const metaAd = {
    advertiserName: "Joota Vyapari",
    advertiserPageId: "PAGE_1001",
    status: "found",
    queryTerms: ["joota_vyapari"],
    country: "IN",
    ads: [],
    totalFound: 1,
    source: "meta_ad_library",
    collectedAt: new Date().toISOString(),
  };
  const website = {
    url: "https://jootavyapari.com",
    domain: "jootavyapari.com",
    status: "accessible",
    company: { name: "Joota Vyapari", email: "support@jootavyapari.com", phone: "+91 9876543210", address: null },
    product: { name: null, brand: null, price: null, description: null },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const graph = buildSellerIdentityGraph(instagram, seller, metaAd, website);
  assert.equal(graph.overallRating, "MATCH");
  assert.ok(graph.confidence >= 80);
  assert.ok(graph.relationships.some((r) => r.type === "INSTAGRAM_VS_META" && r.rating === "MATCH"));
  assert.ok(graph.relationships.some((r) => r.type === "INSTAGRAM_VS_WEBSITE" && r.rating === "MATCH"));
  assert.ok(graph.relationships.some((r) => r.type === "META_VS_WEBSITE" && r.rating === "MATCH"));
});

test("FEATURE 1: Seller identity MISMATCH between Instagram and Website", () => {
  const instagram = {
    account: { username: "joota_vyapari", display_name: "Joota Vyapari" },
    post: {},
    media: [],
    external_links: ["https://xyzelectronics.com"],
  };
  const seller = { username: "joota_vyapari", name: "Joota Vyapari" };
  const metaAd = {
    advertiserName: "XYZ Electronics",
    status: "found",
    queryTerms: ["joota_vyapari"],
    country: "IN",
    ads: [],
    totalFound: 1,
    source: "meta_ad_library",
    collectedAt: new Date().toISOString(),
  };
  const website = {
    url: "https://xyzelectronics.com",
    domain: "xyzelectronics.com",
    status: "accessible",
    company: { name: "XYZ Electronics Pvt Ltd", email: "help@xyzelectronics.com", phone: null, address: null },
    product: { name: null, brand: null, price: null, description: null },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const graph = buildSellerIdentityGraph(instagram, seller, metaAd, website);
  assert.equal(graph.overallRating, "MISMATCH");
  assert.ok(graph.relationships.some((r) => r.rating === "MISMATCH"));
  assert.ok(graph.risk_signals.some((s) => s.signal.includes("Identity mismatch")));
});

test("FEATURE 1: Missing identity fields yield UNKNOWN without assuming fraud", () => {
  const instagram = {
    account: { username: "new_seller", display_name: null },
    post: {},
    media: [],
    external_links: [],
  };
  const seller = { username: "new_seller" };

  const graph = buildSellerIdentityGraph(instagram, seller, null, null);
  assert.equal(graph.overallRating, "UNKNOWN");
  assert.equal(graph.risk_signals.length, 0); // Must NOT assume fraud
});

// ===========================================================================
// FEATURE 2: CROSS-SOURCE PRODUCT CONSISTENCY TESTS
// ===========================================================================

test("FEATURE 2: Product brand MATCH (Nike -> Nike)", () => {
  const instagram = { account: { username: "nike_store" }, post: { caption: "Original Nike Air Max Shoes" }, media: [], external_links: [] };
  const product = { name: "Air Max", brand: "Nike", price: "₹4,999" };
  const seller = { username: "nike_store" };
  const website = {
    url: "https://nikestore.in",
    domain: "nikestore.in",
    status: "accessible",
    company: { name: "Nike Store India", email: null, phone: null, address: null },
    product: { name: "Air Max Shoes", brand: "Nike", price: "₹4,999", description: null },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const report = evaluateProductConsistency(instagram, product, seller, website);
  assert.equal(report.fields.brand.rating, "MATCH");
  assert.equal(report.fields.price.rating, "MATCH");
});

test("FEATURE 2: Product brand MISMATCH (Nike -> XYZ)", () => {
  const instagram = { account: { username: "sneaker_hub" }, post: { caption: "Authentic Nike Jordans" }, media: [], external_links: [] };
  const product = { name: "Jordans", brand: "Nike", price: "₹2,000" };
  const seller = { username: "sneaker_hub" };
  const website = {
    url: "https://sneakerhub.in",
    domain: "sneakerhub.in",
    status: "accessible",
    company: { name: "Sneaker Hub", email: null, phone: null, address: null },
    product: { name: "Generic Running Shoes", brand: "XYZ Footwear", price: "₹2,000", description: null },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const report = evaluateProductConsistency(instagram, product, seller, website);
  assert.equal(report.fields.brand.rating, "MISMATCH");
  assert.equal(report.overallRating, "MISMATCH");
});

test("FEATURE 2: Pack size MISMATCH (1 KG -> 500 G)", () => {
  const instagram = { account: { username: "protein_seller" }, post: { caption: "Whey Protein 1 KG tub on discount!" }, media: [], external_links: [] };
  const product = { name: "Whey Protein 1 KG", brand: "Optimum" };
  const seller = { username: "protein_seller" };
  const media = {
    media: [],
    ocr: { text: "Net Weight: 500 g Whey Protein Powder", confidence: 90, status: "success" },
    packaging: {
      product: { name: "Whey Protein", brand: "Optimum", category: null, price: null, mrp: null },
      manufacturer: { name: null, address: null, contact: null },
      regulatory: { license_numbers: [], certifications: [] },
      dates: { manufactured: null, expiry: null, best_before: null },
      claims: [],
      websites: [],
      contact_information: [],
      facts: [],
    },
    video_analysis: null,
    status: "analyzed",
    evidence: [],
    errors: [],
  };

  const report = evaluateProductConsistency(instagram, product, seller, null, media);
  assert.equal(report.fields.pack_size.rating, "MISMATCH");
});

test("FEATURE 2: Missing price yields UNKNOWN, never MISMATCH or fraud", () => {
  const instagram = { account: { username: "watch_store" }, post: { caption: "Luxury watch available DM for price" }, media: [], external_links: [] };
  const product = { name: "Luxury Watch", brand: "Rolex", price: null };
  const seller = { username: "watch_store" };

  const report = evaluateProductConsistency(instagram, product, seller);
  assert.equal(report.fields.price.rating, "UNKNOWN");
  assert.equal(report.risk_signals.length, 0);
});

// ===========================================================================
// FEATURE 3: POST-PURCHASE RECEIVED PRODUCT VERIFICATION TESTS
// ===========================================================================

test("FEATURE 3: Post-purchase session lifecycle (store, retrieve, remove)", () => {
  const dummyResult = {
    product: { name: "Air Jordan 1", brand: "Nike" },
    seller: { username: "shoe_seller" },
    risk: { risk_level: "LOW", confidence: 80, positive_signals: [], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "OK" },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: { username: "shoe_seller" }, post: {}, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };

  storePostPurchaseSession("919876543210@s.whatsapp.net", dummyResult, "REP-TEST-123");
  const session = getPostPurchaseSession("919876543210@s.whatsapp.net");
  assert.ok(session);
  assert.equal(session.investigationId, "REP-TEST-123");
  assert.equal(session.originalResult.product.name, "Air Jordan 1");

  removePostPurchaseSession("919876543210@s.whatsapp.net");
  assert.equal(getPostPurchaseSession("919876543210@s.whatsapp.net"), null);
});

test("FEATURE 3: Post-purchase comparison detects Brand MISMATCH (Advertised Nike vs Received XYZ)", () => {
  const originalResult = {
    product: { name: "Air Jordan 1", brand: "Nike" },
    seller: { username: "sneaker_shop" },
    risk: { risk_level: "LOW", confidence: 85, positive_signals: [], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "OK" },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: { username: "sneaker_shop" }, post: {}, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };

  const received = analyzeReceivedProductText("Brand: XYZ Fashion\nItem: Casual Sneakers\nMade in India\nNet Qty: 1 Pair");
  const comparison = compareAdvertisedVsReceived(originalResult, received, "REP-TEST-001");

  assert.equal(comparison.fields.brand.rating, "MISMATCH");
  assert.equal(comparison.overallRating, "MISMATCH");
  assert.equal(comparison.updatedRiskLevel, "HIGH");
  assert.ok(comparison.mismatchesDetected.some((m) => m.toLowerCase().includes("brand")));
});

test("FEATURE 3: Post-purchase comparison detects Quantity MISMATCH (Advertised 1 KG vs Received 500 G)", () => {
  const originalResult = {
    product: { name: "Creatine Monohydrate 1 KG", brand: "MuscleBlaze" },
    seller: { username: "gym_supplements" },
    risk: { risk_level: "LOW", confidence: 85, positive_signals: [], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "OK" },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: { username: "gym_supplements" }, post: { caption: "Creatine 1 KG pack" }, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };

  const received = analyzeReceivedProductText("MuscleBlaze Creatine Monohydrate\nNet Weight: 500 g\nBatch: MB99");
  const comparison = compareAdvertisedVsReceived(originalResult, received);

  assert.equal(comparison.fields.brand.rating, "MATCH");
  assert.equal(comparison.fields.quantity.rating, "MISMATCH");
  assert.equal(comparison.overallRating, "MISMATCH");
});

test("FEATURE 3: Post-purchase comparison detects Country of Origin MISMATCH (Advertised India vs Received China)", () => {
  const originalResult = {
    product: { name: "Cotton Kurta", brand: "DesiWeaves" },
    seller: { username: "desi_weaves" },
    risk: { risk_level: "LOW", confidence: 85, positive_signals: [], risk_signals: [], missing_information: [], consistency_checks: [], recommendation: "OK" },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: { username: "desi_weaves" }, post: { caption: "Handcrafted 100% Cotton Made in India" }, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };

  const received = analyzeReceivedProductText("DesiWeaves Cotton Kurta\nMade in China\nSize: L");
  const comparison = compareAdvertisedVsReceived(originalResult, received);

  assert.equal(comparison.fields.country_of_origin.rating, "MISMATCH");
  assert.equal(comparison.overallRating, "MISMATCH");
});

// ===========================================================================
// FEATURE 4: EVIDENCE TIMELINE TESTS
// ===========================================================================

test("FEATURE 4: Evidence timeline constructs chronologically ordered events", () => {
  const evidence = {
    source: { platform: "instagram", url: "https://instagram.com/p/1" },
    account: { username: "vintage_seller" },
    post: { caption: "Selling vintage camera", timestamp: "2026-10-01T10:00:00.000Z" },
    media: [],
    external_links: ["https://vintagestore.com"],
    claims: [{ claim: "100% Original", type: "authenticity", confidence: 90 }],
    evidence: [],
    missing_information: [],
    errors: [],
  };
  const website = {
    url: "https://vintagestore.com",
    domain: "vintagestore.com",
    status: "accessible",
    company: { name: "Vintage Store", email: null, phone: null, address: null },
    product: { name: "Camera", brand: "Canon", price: null, description: null },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };
  const metaAd = {
    status: "found",
    queryTerms: ["vintage_seller"],
    country: "IN",
    ads: [{ libraryId: "AD_1", advertiserName: "Vintage Store", publisherPlatforms: ["INSTAGRAM"], deliveryStart: "2026-10-02T12:00:00.000Z", evidenceSource: "meta_ad_library" }],
    totalFound: 1,
    source: "meta_ad_library",
    collectedAt: "2026-10-03T15:00:00.000Z",
  };

  const timeline = buildEvidenceTimeline({ evidence, website, metaAd });
  assert.ok(timeline.events.length >= 3);
  // Verify chronological ordering
  for (let i = 0; i < timeline.events.length - 1; i++) {
    const tA = new Date(timeline.events[i].timestamp).getTime();
    const tB = new Date(timeline.events[i + 1].timestamp).getTime();
    assert.ok(tA <= tB);
  }
});

// ===========================================================================
// FEATURE 5 & 6: EXPLAINABLE RISK SCORE & EVIDENCE COVERAGE TESTS
// ===========================================================================

test("FEATURE 5: Risk factors are categorized across SELLER_IDENTITY, ADVERTISING, PRODUCT, etc.", () => {
  const evidence = {
    source: { platform: "instagram", url: "https://instagram.com/p/1" },
    account: { username: "discount_hub" },
    post: { caption: "HURRY TODAY ONLY 90% OFF" },
    media: [],
    external_links: [],
    evidence: [],
    missing_information: [],
    errors: [],
  };
  const product = { name: "Smart Watch", brand: "Apple" };
  const seller = { username: "discount_hub" };
  const adClaims = {
    claims_detected: ["90% OFF"],
    ad_pressure_signals: [
      { type: "price_anchoring", text: "90% OFF", source: "instagram", meaning: "Extreme discount claim" },
      { type: "urgency", text: "TODAY ONLY", source: "instagram", meaning: "Urgency pressure" },
    ],
    price_claims: [],
    authenticity_claims: [],
    urgency_claims: ["TODAY ONLY"],
    scarcity_claims: [],
    authority_claims: [],
    performance_claims: [],
    social_proof_claims: [],
    price_anchoring_claims: ["90% OFF"],
    pressure_signals: [],
  };

  const risk = evaluateRisk(evidence, product, seller, [], null, null, null, null, null, null, adClaims);
  assert.ok(risk.risk_factors);
  assert.ok(risk.risk_factors.some((f) => f.category === "ADVERTISING"));
  assert.ok(typeof risk.score === "number");
  assert.ok(typeof risk.evidence_coverage === "number");
});

test("FEATURE 6: Evidence Coverage calculates independent data source availability (0-100%)", () => {
  const evidence = {
    source: { platform: "instagram", url: "https://instagram.com/p/1" },
    account: { username: "organic_farm" },
    post: { caption: "Fresh Honey" },
    media: [{ type: "image", url: "https://img.jpg", source: "instagram" }],
    external_links: [],
    evidence: [],
    missing_information: [],
    errors: [],
  };
  const website = {
    url: "https://organicfarm.in",
    domain: "organicfarm.in",
    status: "accessible",
    company: { name: "Organic Farm", email: "care@organicfarm.in", phone: null, address: null },
    product: { name: "Honey", brand: "Farm", price: null, description: null },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const coverage = calculateEvidenceCoverage(evidence, website);
  assert.ok(coverage >= 40);
  assert.ok(coverage <= 100);
});

// ===========================================================================
// FEATURE 7 & 8: HTML REPORT & WHATSAPP UX INTEGRATION
// ===========================================================================

test("FEATURE 7 & 8: WhatsApp formatting includes Post-Purchase prompt and structured badges", () => {
  const result = {
    product: { name: "Running Shoes", brand: "FastTrack" },
    seller: { username: "joota_vyapari" },
    risk: {
      risk_level: "MEDIUM",
      confidence: 78,
      score: 55,
      evidence_coverage: 82,
      positive_signals: ["Seller account identified: @joota_vyapari"],
      risk_signals: ["Seller identity inconsistency", "Extreme discount claim", "Product information mismatch"],
      missing_information: [],
      consistency_checks: [],
      recommendation: "Check seller reviews before purchasing.",
    },
    evidence: { source: { platform: "instagram", url: "https://instagram.com/p/1" }, account: { username: "joota_vyapari" }, post: {}, media: [], external_links: [], evidence: [], missing_information: [], errors: [] },
    status: "EVIDENCE_COLLECTED",
  };

  const text = formatVerificationResult(result, "REP-TEST-888");
  assert.ok(text.includes("🔍 VERIQOO TRUST CHECK"));
  assert.ok(text.includes("DID YOU RECEIVE THE PRODUCT?"));
  assert.ok(text.includes("Evidence Coverage: 82%"));
  assert.ok(text.includes("Report ID: REP-TEST-888"));
});

// ===========================================================================
// ADVERTISING INTELLIGENCE MODULE TESTS
// ===========================================================================

test("ADVERTISING INTELLIGENCE: Normalizes Apify and Meta Ad Library datasets without fabricating dates", () => {
  const apifyItem = {
    ad_id: "APIFY_123456",
    page_name: "Apex Footwear",
    page_id: "987654321",
    startDate: "2025-03-15T00:00:00Z",
    endDate: "2025-08-30T00:00:00Z",
    body: "Get 40% off on all Apex Pro Runners! Free Shipping worldwide.",
    title: "Apex Pro Runners",
    description: "Official Running Footwear",
    link_url: "https://shop.apexfootwear.com/pro-runner",
    is_active: false,
    publisher_platforms: ["INSTAGRAM", "FACEBOOK"],
  };

  const normalized = normalizeApifyOrMetaRecord(apifyItem, "apify");
  assert.equal(normalized.adId, "APIFY_123456");
  assert.equal(normalized.advertiserName, "Apex Footwear");
  assert.equal(normalized.advertiserPageId, "987654321");
  assert.equal(normalized.deliveryStart, "2025-03-15");
  assert.equal(normalized.deliveryEnd, "2025-08-30");
  assert.equal(normalized.adStatus, "INACTIVE");
  assert.equal(normalized.destinationDomain, "shop.apexfootwear.com");
  assert.deepEqual(normalized.publisherPlatforms, ["INSTAGRAM", "FACEBOOK"]);
  assert.equal(normalized.evidenceSource, "apify");
});

test("ADVERTISING INTELLIGENCE: Missing historical data returns HISTORY_UNAVAILABLE (not NO_HISTORY)", () => {
  const adWithoutDates = {
    libraryId: "AD_UNDATED_1",
    advertiserName: "NewBrand",
    advertiserPageId: "123",
    publisherPlatforms: ["INSTAGRAM"],
    deliveryStart: null,
    deliveryEnd: null,
    adText: "Sample ad copy",
    linkTitle: "Title",
    linkDescription: null,
    adSnapshotUrl: null,
    destinationUrl: "https://newbrand.com",
    evidenceSource: "meta_ad_library",
  };

  const timeline = buildAdvertisingTimeline([adWithoutDates]);
  assert.equal(timeline.firstObserved, "HISTORY_UNAVAILABLE");
  assert.notEqual(timeline.firstObserved, "NO_HISTORY");
  assert.equal(timeline.advertisingSpan, "HISTORY_UNAVAILABLE");
  assert.notEqual(timeline.advertisingSpan, "NO_HISTORY");

  const spanRes = calculateAdvertisingSpan(null, null);
  assert.equal(spanRes.span, "HISTORY_UNAVAILABLE");
  assert.equal(spanRes.firstObserved, "HISTORY_UNAVAILABLE");
});

test("ADVERTISING INTELLIGENCE: Advertising timeline tree & span calculations across years", () => {
  const ads = [
    {
      libraryId: "AD_2025_1",
      advertiserName: "Lumina Skin",
      advertiserPageId: "555",
      publisherPlatforms: ["INSTAGRAM"],
      deliveryStart: "2025-01-10",
      deliveryEnd: "2025-04-10",
      adText: "Lumina Glow Serum 2025 Campaign",
      linkTitle: "Lumina Glow",
      linkDescription: null,
      adSnapshotUrl: null,
      destinationUrl: "https://luminaskin.com",
      evidenceSource: "meta_ad_library",
    },
    {
      libraryId: "AD_2025_2",
      advertiserName: "Lumina Skin",
      advertiserPageId: "555",
      publisherPlatforms: ["INSTAGRAM"],
      deliveryStart: "2025-06-01",
      deliveryEnd: "2025-09-01",
      adText: "Lumina Summer Sale",
      linkTitle: "Lumina Summer",
      linkDescription: null,
      adSnapshotUrl: null,
      destinationUrl: "https://luminaskin.com",
      evidenceSource: "meta_ad_library",
    },
    {
      libraryId: "AD_2026_1",
      advertiserName: "Lumina Skin",
      advertiserPageId: "555",
      publisherPlatforms: ["INSTAGRAM"],
      deliveryStart: "2026-02-15",
      deliveryEnd: "Active",
      adText: "Lumina Current Active Ad",
      linkTitle: "Lumina 2026",
      linkDescription: null,
      adSnapshotUrl: null,
      destinationUrl: "https://luminaskin.com",
      evidenceSource: "meta_ad_library",
    },
  ];

  const timeline = buildAdvertisingTimeline(ads);
  assert.equal(timeline.activeAdCount, 1);
  assert.equal(timeline.historicalAdCount, 2);
  assert.equal(timeline.firstObserved, "2025-01-10");
  assert.equal(timeline.lastObserved, "Active");
  assert.ok(timeline.advertisingSpan.includes("year") || timeline.advertisingSpan.includes("month"));
  assert.equal(timeline.timelineTree.length, 2); // 2025 and 2026
  assert.equal(timeline.timelineTree[0].year, 2025);
  assert.equal(timeline.timelineTree[0].entries.length, 2);
  assert.equal(timeline.timelineTree[1].year, 2026);
  assert.equal(timeline.timelineTree[1].entries.length, 1);
});

test("ADVERTISING INTELLIGENCE: Ad Evidence Ledger EV-AD-xxx generation & format", () => {
  const metaAdEvidence = {
    status: "found",
    queryTerms: ["luminaskin"],
    country: "IN",
    source: "meta_ad_library",
    collectedAt: "2026-10-06T10:00:00Z",
    totalFound: 2,
    ads: [
      {
        libraryId: "998877",
        advertiserName: "Lumina Skin Care",
        advertiserPageId: "12345",
        publisherPlatforms: ["INSTAGRAM"],
        deliveryStart: "2025-05-01",
        deliveryEnd: "Active",
        adText: "100% Organic Glow Serum with Vitamin C",
        linkTitle: "Lumina Glow Serum",
        linkDescription: "Natural Skin Care",
        adSnapshotUrl: "https://www.facebook.com/ads/library/?id=998877",
        destinationUrl: "https://luminaskin.com/serum",
        destinationDomain: "luminaskin.com",
        evidenceSource: "meta_ad_library",
      },
    ],
  };

  const ledger = buildAdEvidenceLedger(metaAdEvidence);
  assert.equal(ledger.length, 1);
  const item = ledger[0];
  assert.equal(item.id, "EV-AD-001");
  assert.equal(item.advertiser, "Lumina Skin Care");
  assert.equal(item.adId, "998877");
  assert.equal(item.status, "ACTIVE");
  assert.equal(item.observed, "Active since 2025-05-01");
  assert.equal(item.evidenceType, "META_AD");
  assert.equal(item.confidence, 90);
  assert.equal(item.destinationDomain, "luminaskin.com");
  assert.ok(item.sourceUrl?.includes("facebook.com"));
});

test("ADVERTISING INTELLIGENCE: Advertiser identity matching across Instagram, Meta, and Domain", () => {
  const igEvidence = {
    source: { platform: "instagram", url: "https://instagram.com/luminaskin" },
    account: { username: "luminaskin", display_name: "Lumina Skin" },
    post: { caption: "Discover Lumina Glow" },
    media: [],
    external_links: ["https://luminaskin.com"],
    evidence: [],
    missing_information: [],
    errors: [],
  };
  const seller = { username: "luminaskin", name: "Lumina Skin", website: "https://luminaskin.com", contact: null };

  const matchMetaAd = {
    status: "found",
    queryTerms: ["luminaskin"],
    country: "IN",
    source: "meta_ad_library",
    collectedAt: "2026-10-06T10:00:00Z",
    totalFound: 1,
    advertiserName: "Lumina Skin",
    advertiserPageId: "999",
    destinationUrl: "https://luminaskin.com",
    ads: [],
  };

  const matchRes = matchAdvertiserIdentity(igEvidence, seller, matchMetaAd, "luminaskin.com");
  assert.equal(matchRes.rating, "MATCH");
  assert.ok(matchRes.verdict.includes("IDENTITY MATCH"));
  assert.equal(matchRes.confidence, 95);

  const mismatchMetaAd = {
    status: "found",
    queryTerms: ["luminaskin"],
    country: "IN",
    source: "meta_ad_library",
    collectedAt: "2026-10-06T10:00:00Z",
    totalFound: 1,
    advertiserName: "Totally Unrelated Crypto LLC",
    advertiserPageId: "777",
    destinationUrl: "https://unrelatedcrypto.com",
    ads: [],
  };

  const mismatchRes = matchAdvertiserIdentity(igEvidence, seller, mismatchMetaAd, "unrelatedcrypto.com");
  assert.equal(mismatchRes.rating, "MISMATCH");
  assert.ok(mismatchRes.verdict.includes("IDENTITY MISMATCH"));
});

test("ADVERTISING INTELLIGENCE: Destination domain analysis & DOMAIN_ANOMALY detection (NOT SCAM)", () => {
  const adsConsistent = [
    { libraryId: "1", destinationUrl: "https://brand.com/1", evidenceSource: "meta_ad_library", publisherPlatforms: [] },
    { libraryId: "2", destinationUrl: "https://shop.brand.com/2", evidenceSource: "meta_ad_library", publisherPlatforms: [] },
    { libraryId: "3", destinationUrl: "https://brand.com/3", evidenceSource: "meta_ad_library", publisherPlatforms: [] },
  ];

  const analysisConsistent = analyzeDestinationDomains(adsConsistent, "brand.com");
  assert.equal(analysisConsistent.domainConsistency, "HIGH");
  assert.equal(analysisConsistent.hasDomainAnomaly, false);

  const adsWithAnomaly = [
    { libraryId: "1", destinationUrl: "https://brand.com", evidenceSource: "meta_ad_library", publisherPlatforms: [] },
    { libraryId: "2", destinationUrl: "https://randomredirect99.xyz", evidenceSource: "meta_ad_library", publisherPlatforms: [] },
    { libraryId: "3", destinationUrl: "https://fastwirepayments.io", evidenceSource: "meta_ad_library", publisherPlatforms: [] },
  ];

  const analysisAnomaly = analyzeDestinationDomains(adsWithAnomaly, "brand.com");
  assert.equal(analysisAnomaly.hasDomainAnomaly, true);
  assert.ok(analysisAnomaly.anomalyDetails?.includes("DOMAIN_ANOMALY"));
  assert.ok(!analysisAnomaly.anomalyDetails?.includes("SCAM")); // MUST NOT be labeled SCAM
});

test("ADVERTISING INTELLIGENCE: Creative history consistency score & patterns", () => {
  const ads = [
    {
      libraryId: "1",
      advertiserName: "Nordic Warmth",
      linkTitle: "Nordic Thermal Jacket",
      adText: "Get 50% off on all Nordic jackets! Free shipping on all orders.",
      deliveryStart: "2025-02-01",
      evidenceSource: "meta_ad_library",
      publisherPlatforms: ["INSTAGRAM"],
    },
    {
      libraryId: "2",
      advertiserName: "Nordic Warmth",
      linkTitle: "Nordic Winter Gear",
      adText: "50% off seasonal winter collection. Free shipping guaranteed.",
      deliveryStart: "2025-11-01",
      evidenceSource: "meta_ad_library",
      publisherPlatforms: ["INSTAGRAM"],
    },
  ];

  const creativeRes = analyzeCreativeHistory(ads);
  assert.equal(creativeRes.brandConsistency, "CONSISTENT");
  assert.equal(creativeRes.creativeConsistency, "HIGH");
  assert.ok(creativeRes.creativeConsistencyScore >= 75);
  assert.ok(creativeRes.repeatedCreativePatterns.some((p) => p.includes("50% off") || p.includes("Free shipping")));
});

test("ADVERTISING INTELLIGENCE: Ad <-> Instagram correlation (CONTENT_AD_MATCH & PROFILE_AD_MISMATCH)", () => {
  const igEvidence = {
    source: { platform: "instagram", url: "https://instagram.com/nordic" },
    account: { username: "nordic_wear" },
    post: { caption: "Winter thermal jacket for cold weather trekking #nordic" },
    media: [],
    external_links: [],
    evidence: [],
    missing_information: [],
    errors: [],
  };
  const product = { name: "Thermal Jacket", brand: "Nordic", category: "Apparel", price: "2499" };

  const matchingMetaAd = {
    status: "found",
    queryTerms: ["nordic"],
    country: "IN",
    source: "meta_ad_library",
    collectedAt: "2026-10-06T10:00:00Z",
    totalFound: 1,
    ads: [
      {
        libraryId: "AD1",
        advertiserName: "Nordic",
        linkTitle: "Nordic Thermal Jacket",
        adText: "Thermal trekking jacket",
        evidenceSource: "meta_ad_library",
        publisherPlatforms: ["INSTAGRAM"],
      },
    ],
  };

  const corrMatch = correlateAdWithInstagram(igEvidence, product, matchingMetaAd);
  assert.equal(corrMatch.result, "CONTENT_AD_MATCH");
  assert.equal(corrMatch.isAnomaly, false);
  assert.equal(corrMatch.instagramEvidenceId, "EV-POST-001");
  assert.equal(corrMatch.adEvidenceId, "EV-AD-001");

  const mismatchingMetaAd = {
    status: "found",
    queryTerms: ["nordic"],
    country: "IN",
    source: "meta_ad_library",
    collectedAt: "2026-10-06T10:00:00Z",
    totalFound: 1,
    ads: [
      {
        libraryId: "AD2",
        advertiserName: "Forex Fast",
        linkTitle: "Crypto Trading Investment",
        adText: "Guaranteed return forex trading crypto platform",
        evidenceSource: "meta_ad_library",
        publisherPlatforms: ["INSTAGRAM"],
      },
    ],
  };

  const corrMismatch = correlateAdWithInstagram(igEvidence, product, mismatchingMetaAd);
  assert.equal(corrMismatch.result, "PROFILE_AD_MISMATCH");
  assert.equal(corrMismatch.isAnomaly, true);
});

test("ADVERTISING INTELLIGENCE: Full Master Analyzer generates complete intelligence structure & signals", () => {
  const igEvidence = {
    source: { platform: "instagram", url: "https://instagram.com/nordic" },
    account: { username: "nordic_wear", display_name: "Nordic Wear" },
    post: { caption: "Official Nordic Winter Thermal Jacket" },
    media: [],
    external_links: ["https://nordicwear.com"],
    evidence: [],
    missing_information: [],
    errors: [],
  };
  const product = { name: "Thermal Jacket", brand: "Nordic", category: "Apparel", price: "2499" };
  const seller = { username: "nordic_wear", name: "Nordic Wear", website: "https://nordicwear.com", contact: null };
  const website = {
    url: "https://nordicwear.com",
    domain: "nordicwear.com",
    status: "accessible",
    company: { name: "Nordic Wear", email: "care@nordicwear.com", phone: null, address: null },
    product: { name: "Thermal Jacket", brand: "Nordic", price: "2499", description: null },
    policies: { refund: true, return: true, shipping: true, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const metaAd = {
    status: "found",
    queryTerms: ["nordic"],
    country: "IN",
    source: "meta_ad_library",
    collectedAt: "2026-10-06T10:00:00Z",
    totalFound: 2,
    advertiserName: "Nordic Wear",
    ads: [
      {
        libraryId: "AD_1",
        advertiserName: "Nordic Wear",
        advertiserPageId: "111",
        publisherPlatforms: ["INSTAGRAM"],
        deliveryStart: "2025-01-15",
        deliveryEnd: "Active",
        adText: "Official Nordic Thermal Jacket - 20% off",
        linkTitle: "Nordic Thermal Jacket",
        destinationUrl: "https://nordicwear.com/jacket",
        destinationDomain: "nordicwear.com",
        evidenceSource: "meta_ad_library",
      },
    ],
  };

  const intelligence = analyzeAdvertisingIntelligence(metaAd, igEvidence, product, seller, website, null);

  assert.equal(intelligence.status, "FOUND");
  assert.equal(intelligence.advertiserIdentity, "Nordic Wear");
  assert.equal(intelligence.activeAdCount, 1);
  assert.equal(intelligence.advertiserMatch.rating, "MATCH");
  assert.equal(intelligence.destinationAnalysis.domainConsistency, "HIGH");
  assert.equal(intelligence.instagramCorrelation.result, "CONTENT_AD_MATCH");
  assert.equal(intelligence.websiteCorrelation.result, "CROSS_SOURCE_IDENTITY_MATCH");
  assert.equal(intelligence.evidenceLedger.length, 1);
  assert.equal(intelligence.evidenceLedger[0].id, "EV-AD-001");
  assert.ok(intelligence.trustSignals.length > 0);
  assert.equal(intelligence.riskSignals.length, 0);
});

test("ADVERTISING INTELLIGENCE: HTML report includes Advertising Intelligence section and Side Panel", () => {
  const result = {
    product: { name: "Aero Drone", brand: "AeroTech" },
    seller: { username: "aerotech_official", name: "AeroTech Official", website: "https://aerotech.io" },
    risk: {
      risk_level: "LOW",
      confidence: 88,
      score: 15,
      evidence_coverage: 90,
      positive_signals: ["Seller matches website", "Meta ad corroborated"],
      risk_signals: [],
      missing_information: [],
      consistency_checks: [],
      recommendation: "Standard checkout precaution.",
    },
    meta_ad_evidence: {
      status: "found",
      queryTerms: ["aerotech"],
      country: "IN",
      source: "meta_ad_library",
      collectedAt: "2026-10-06T10:00:00Z",
      totalFound: 3,
      advertiserName: "AeroTech Official",
      ads: [
        {
          libraryId: "AERO_1",
          advertiserName: "AeroTech Official",
          deliveryStart: "2025-06-01",
          deliveryEnd: "Active",
          adText: "Aero Drone 4K Ultra HD",
          linkTitle: "Aero Drone 4K",
          destinationUrl: "https://aerotech.io/drone",
          destinationDomain: "aerotech.io",
          evidenceSource: "meta_ad_library",
          publisherPlatforms: ["INSTAGRAM"],
        },
      ],
    },
    advertising_intelligence: {
      status: "FOUND",
      source: "Meta Ad Library / Apify",
      advertiserIdentity: "AeroTech Official",
      pageId: "4444",
      totalAdsDiscovered: 3,
      activeAdCount: 1,
      historicalAdCount: 2,
      firstObserved: "2025-06-01",
      lastObserved: "Active",
      advertisingSpan: "~1.3 years (16 months) (ongoing)",
      platforms: ["INSTAGRAM", "FACEBOOK"],
      uniqueCreativeCount: 3,
      destinationDomains: ["aerotech.io"],
      timeline: {
        advertisingSpan: "~1.3 years (16 months) (ongoing)",
        firstObserved: "2025-06-01",
        lastObserved: "Active",
        activeAdCount: 1,
        historicalAdCount: 2,
        uniqueCreativeCount: 3,
        uniqueDestinationDomainCount: 1,
        timelineTree: [
          {
            year: 2025,
            entries: [
              {
                adId: "AERO_1",
                date: "2025-06-01",
                year: 2025,
                status: "ACTIVE",
                label: "Current ad observed",
                evidenceId: "EV-AD-001",
                advertiserName: "AeroTech Official",
                destinationDomain: "aerotech.io",
                snippet: "Aero Drone 4K Ultra HD",
              },
            ],
          },
        ],
        allEntries: [],
      },
      advertiserMatch: {
        instagramUsername: "aerotech_official",
        instagramDisplayName: "AeroTech Official",
        instagramBio: "Drone gear",
        instagramExternalLinks: ["https://aerotech.io"],
        metaAdvertiserIdentity: "AeroTech Official",
        metaPageIdentity: "4444",
        destinationDomain: "aerotech.io",
        rating: "MATCH",
        verdict: "IDENTITY MATCH: Meta advertiser matches Instagram seller",
        confidence: 95,
        evidenceItemId: "EV-AD-ID-001",
      },
      destinationAnalysis: {
        primaryDomain: "aerotech.io",
        domainCount: 1,
        domains: [{ domain: "aerotech.io", count: 3, percentage: 100 }],
        domainConsistency: "HIGH",
        hasDomainAnomaly: false,
        anomalyDetails: null,
      },
      creativeHistory: {
        brandConsistency: "CONSISTENT",
        productConsistency: "CONSISTENT",
        messagingConsistency: "CONSISTENT",
        visualIdentityConsistency: "CONSISTENT",
        repeatedCreativePatterns: ["4K Ultra HD"],
        changesOverTime: ["Consistent product focus across campaigns"],
        creativeConsistencyScore: 90,
        creativeConsistency: "HIGH",
        variations: [
          {
            creativeId: "AERO_1",
            headline: "Aero Drone 4K",
            bodySnippet: "Aero Drone 4K Ultra HD",
            destinationUrl: "https://aerotech.io/drone",
            deliveryDate: "2025-06-01",
          },
        ],
      },
      instagramCorrelation: {
        instagramContent: "Aero Drone",
        metaAdContent: "Aero Drone 4K",
        result: "CONTENT_AD_MATCH",
        isAnomaly: false,
        explanation: "Ad promotes the verified Instagram product offering",
        instagramEvidenceId: "EV-POST-001",
        adEvidenceId: "EV-AD-001",
      },
      websiteCorrelation: {
        instagramBioDomain: "aerotech.io",
        instagramLinks: ["https://aerotech.io"],
        metaDestinationDomains: ["aerotech.io"],
        websiteIdentity: "aerotech.io",
        result: "CROSS_SOURCE_IDENTITY_MATCH",
        explanation: "Meta ad destination domain matches verified website",
      },
      evidenceLedger: [
        {
          id: "EV-AD-001",
          source: "Meta Ad Library / Apify",
          advertiser: "AeroTech Official",
          adId: "AERO_1",
          status: "ACTIVE",
          observed: "Active since 2025-06-01",
          firstObserved: "2025-06-01",
          lastObserved: "Active",
          sourceUrl: "https://facebook.com/ads/library/?id=AERO_1",
          captured: "2026-10-06T10:00:00Z",
          evidenceType: "META_AD",
          confidence: 90,
          destinationUrl: "https://aerotech.io/drone",
          destinationDomain: "aerotech.io",
          platforms: ["INSTAGRAM"],
        },
      ],
      trustSignals: [],
      riskSignals: [],
      riskFactors: [],
      summary: "Advertising intelligence complete.",
    },
    evidence: {
      source: { platform: "instagram", url: "https://instagram.com/p/drone" },
      account: { username: "aerotech_official" },
      post: { caption: "Aero Drone" },
      media: [],
      external_links: ["https://aerotech.io"],
      evidence: [],
      missing_information: [],
      errors: [],
    },
    status: "EVIDENCE_COLLECTED",
  };

  const report = generateVerificationReport(result);
  const html = report.html;

  // Verify Side Panel
  assert.ok(html.includes("side-panel"));
  assert.ok(html.includes("📢 Advertising"));
  assert.ok(html.includes("View Ad History"));
  assert.ok(html.includes("#section-advertising-intelligence"));

  // Verify Advertising Intelligence Section & Subsections
  assert.ok(html.includes("id=\"section-advertising-intelligence\""));
  assert.ok(html.includes("📅 Advertising Timeline"));
  assert.ok(html.includes("🔗 Advertiser Identity Matching"));
  assert.ok(html.includes("🌐 Destination Domain Analysis"));
  assert.ok(html.includes("🎨 Creative History &amp; Consistency"));
  assert.ok(html.includes("🔄 Instagram &harr; Meta Ad Correlation"));
  assert.ok(html.includes("📚 Ad Evidence Ledger"));
  assert.ok(html.includes("EV-AD-001"));
  assert.ok(html.includes("AeroTech Official"));
});

// ===========================================================================
// PHASE 2 — DEEP INSTAGRAM PROFILE INVESTIGATION TESTS
// ===========================================================================

test("PHASE 2 - TEST 1: Raw bio preservation and normalization", () => {
  const rawBio = "Software Engineer | Founder @AIStartup | Pune\nBuilding intelligent tools ↓\nexample.ai";
  const normalized = normalizeBioText(rawBio);
  assert.equal(normalized, rawBio.trim());
});

test("PHASE 2 - TEST 2: Structured bio claim extraction across all claim types", () => {
  const bio = `
    Alex Rivers | Software Engineer & AI Builder
    Founder @DevCraft | Ex-Google
    📍 Pune, India | IIT Bombay Alum
    Building tools at devcraft.io
    DM for consulting | contact@devcraft.io | +91 98765 43210
    Twitter: @alexrivers_dev
    50% off launch week with code LAUNCH50
    Registered Pvt Ltd in India
  `;

  const claims = extractBioClaims(bio, "https://www.instagram.com/alexrivers/", "alexrivers");

  const types = claims.map((c) => c.claimType);
  assert.ok(types.includes("OCCUPATION"), "Extracts OCCUPATION");
  assert.ok(types.includes("FOUNDER"), "Extracts FOUNDER");
  assert.ok(types.includes("COMPANY"), "Extracts COMPANY");
  assert.ok(types.includes("LOCATION"), "Extracts LOCATION");
  assert.ok(types.includes("EDUCATION"), "Extracts EDUCATION");
  assert.ok(types.includes("WEBSITE"), "Extracts WEBSITE");
  assert.ok(types.includes("CONTACT"), "Extracts CONTACT");
  assert.ok(types.includes("SOCIAL_HANDLE"), "Extracts SOCIAL_HANDLE");
  assert.ok(types.includes("PROMOTIONAL_CLAIM"), "Extracts PROMOTIONAL_CLAIM");
  assert.ok(types.includes("BUSINESS_CLAIM"), "Extracts BUSINESS_CLAIM");

  // Verify stable evidence ID format
  assert.ok(claims[0].evidenceId.startsWith("EV-BIO-001"));
  assert.equal(claims[0].status, "OBSERVED");
});

test("PHASE 2 - TEST 3: Bio claim verification marks independent corroboration as SUPPORTED", () => {
  const claims = [
    {
      claimId: "BIO-1",
      claimType: "FOUNDER",
      claimText: "Founder @NexusAI",
      normalizedValue: "NexusAI",
      source: "Instagram Profile Bio",
      evidenceId: "EV-BIO-001",
      status: "OBSERVED",
      confidence: 90,
    },
    {
      claimId: "BIO-2",
      claimType: "WEBSITE",
      claimText: "nexusai.dev",
      normalizedValue: "nexusai.dev",
      source: "Instagram Profile Bio",
      evidenceId: "EV-BIO-002",
      status: "OBSERVED",
      confidence: 95,
    },
  ];

  const externalLinks = [
    {
      originalUrl: "https://nexusai.dev",
      normalizedUrl: "https://nexusai.dev",
      domain: "nexusai.dev",
      platform: "company_website",
      source: "Instagram Bio",
      evidenceId: "EV-LINK-001",
    },
  ];

  const websiteEvidence = {
    url: "https://nexusai.dev",
    domain: "nexusai.dev",
    status: "accessible",
    company: { name: "NexusAI Technologies", email: "info@nexusai.dev", phone: null, address: null },
    product: { name: "Nexus Engine", brand: "NexusAI", price: null, description: null },
    policies: { refund: true, return: false, shipping: false, privacy: true, terms: true },
    evidence: [],
    missing_information: [],
    errors: [],
  };

  const results = verifyBioClaims(claims, externalLinks, websiteEvidence);

  const websiteClaimResult = results.find((r) => r.claim.claimType === "WEBSITE");
  assert.equal(websiteClaimResult?.status, "SUPPORTED");
  assert.ok(websiteClaimResult?.matchingEvidenceIds.includes("EV-LINK-001"));

  const founderClaimResult = results.find((r) => r.claim.claimType === "FOUNDER");
  assert.equal(founderClaimResult?.status, "SUPPORTED");
});

test("PHASE 2 - TEST 4: Bio claim without independent corroboration is UNVERIFIED (NOT scam or fraud)", () => {
  const claims = [
    {
      claimId: "BIO-1",
      claimType: "FOUNDER",
      claimText: "Founder @InvisibleVentures",
      normalizedValue: "InvisibleVentures",
      source: "Instagram Profile Bio",
      evidenceId: "EV-BIO-001",
      status: "OBSERVED",
      confidence: 85,
    },
  ];

  const results = verifyBioClaims(claims, [], null, [], []);

  assert.equal(results[0].status, "UNVERIFIED");
  assert.ok(!results[0].explanation.toLowerCase().includes("fraud"));
  assert.ok(!results[0].explanation.toLowerCase().includes("scam"));
  assert.ok(results[0].explanation.includes("No independent multi-source verification data found"));
});

test("PHASE 2 - TEST 5: External link extraction and platform classification", () => {
  const rawLinks = [
    "https://github.com/johndoe/project",
    "https://www.linkedin.com/in/johndoe/",
    "https://youtube.com/@johndoe",
    "https://x.com/johndoe",
    "https://linktr.ee/johndoe",
    "https://johndoe.dev",
  ];

  const links = extractExternalLinks(rawLinks);
  assert.equal(links.length, 6);

  const platforms = links.map((l) => l.platform);
  assert.ok(platforms.includes("github"));
  assert.ok(platforms.includes("linkedin"));
  assert.ok(platforms.includes("youtube"));
  assert.ok(platforms.includes("twitter_x"));
  assert.ok(platforms.includes("linktree"));
  assert.ok(platforms.includes("portfolio") || platforms.includes("personal_website"));

  assert.equal(links[0].evidenceId, "EV-LINK-001");
  assert.equal(links[1].evidenceId, "EV-LINK-002");
});

test("PHASE 2 - TEST 6: Highlights categorization and unavailable handling", () => {
  const rawHighlights = [
    { title: "Client Reviews", stories: ["Great work!", "5 stars"] },
    { title: "My Projects", stories: ["App demo", "Architecture"] },
    { title: "Services & Pricing", stories: ["Consulting plans"] },
  ];

  const accessibleHls = extractProfileHighlights(rawHighlights, true);
  assert.equal(accessibleHls.length, 3);
  assert.equal(accessibleHls[0].category, "Reviews");
  assert.equal(accessibleHls[1].category, "Work");
  assert.equal(accessibleHls[2].category, "Services");
  assert.ok(accessibleHls[0].evidenceIds[0].startsWith("EV-HIGHLIGHT-"));

  // Unavailable highlights
  const unavailableHls = extractProfileHighlights(null, false);
  assert.equal(unavailableHls.length, 1);
  assert.equal(unavailableHls[0].status, "HIGHLIGHTS_UNAVAILABLE");
});

test("PHASE 2 - TEST 7: Bounded content sampling and Content vs Bio consistency", () => {
  const rawPosts = Array.from({ length: 20 }).map((_, i) => ({
    url: `https://instagram.com/p/post_${i}`,
    caption: i % 2 === 0 ? "Writing typescript code and building open source AI tools #coding #ai" : "Weekend hike in the mountains",
    mediaType: "image",
    likes: 150,
  }));

  const sampled = sampleProfileContent(rawPosts, 12);
  assert.equal(sampled.length, 12, "Enforces 12-item bounded sampling limit");

  const bioClaims = [
    {
      claimId: "BIO-1",
      claimType: "OCCUPATION",
      claimText: "Software Engineer",
      normalizedValue: "SOFTWARE ENGINEER",
      source: "Instagram Profile Bio",
      evidenceId: "EV-BIO-001",
      status: "OBSERVED",
      confidence: 85,
    },
  ];

  const consistency = evaluateContentBioConsistency(bioClaims, sampled);
  assert.equal(consistency.status, "SUPPORTED");
  assert.ok(consistency.evidenceIds.length > 0);
  assert.ok(consistency.explanation.includes("aligns consistently"));
});

test("PHASE 2 - TEST 8: 8-Dimension Profile Scoring with explainability and evidence IDs", () => {
  const bioVerifications = [
    {
      claim: {
        claimId: "BIO-1",
        claimType: "OCCUPATION",
        claimText: "Software Engineer",
        normalizedValue: "SOFTWARE ENGINEER",
        source: "Bio",
        evidenceId: "EV-BIO-001",
        status: "SUPPORTED",
        confidence: 90,
      },
      status: "SUPPORTED",
      checkedSources: ["GitHub", "Posts"],
      matchingEvidenceIds: ["EV-LINK-001", "EV-POST-001"],
      explanation: "Corroborated by GitHub profile.",
    },
  ];

  const externalLinks = [
    {
      originalUrl: "https://github.com/developer",
      normalizedUrl: "https://github.com/developer",
      domain: "github.com",
      platform: "github",
      source: "Bio",
      evidenceId: "EV-LINK-001",
    },
  ];

  const posts = [
    {
      postId: "POST-1",
      postUrl: "https://instagram.com/p/1",
      mediaType: "image",
      caption: "Building cool tech",
      hashtags: ["coding"],
      mentions: [],
      productServiceClaims: [],
      businessClaims: [],
      topics: ["software_engineering"],
      commercialSignals: [],
      evidenceIds: ["EV-POST-001"],
    },
  ];

  const evidenceLedger = [
    {
      id: "EV-PROFILE-001",
      source: "Instagram",
      sourceType: "instagram_profile",
      sourceLocation: "Account",
      observedText: "@developer",
      evidenceType: "ACCOUNT",
      status: "OBSERVED",
      confidence: 95,
      capturedAt: new Date().toISOString(),
      trustImpact: 5,
      riskImpact: 0,
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
    },
    {
      id: "EV-BIO-001",
      source: "Bio",
      sourceType: "instagram_bio",
      sourceLocation: "Bio",
      observedText: "Software Engineer",
      evidenceType: "BIO_CLAIM",
      status: "SUPPORTED",
      confidence: 90,
      capturedAt: new Date().toISOString(),
      trustImpact: 5,
      riskImpact: 0,
      supportingEvidenceIds: ["EV-LINK-001"],
      contradictingEvidenceIds: [],
    },
    {
      id: "EV-LINK-001",
      source: "Links",
      sourceType: "external_link",
      sourceLocation: "Bio Links",
      observedText: "github.com/developer",
      evidenceType: "LINK",
      status: "OBSERVED",
      confidence: 90,
      capturedAt: new Date().toISOString(),
      trustImpact: 3,
      riskImpact: 0,
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
    },
    {
      id: "EV-POST-001",
      source: "Posts",
      sourceType: "instagram_post",
      sourceLocation: "Post",
      observedText: "Coding snippet",
      evidenceType: "POST",
      status: "OBSERVED",
      confidence: 85,
      capturedAt: new Date().toISOString(),
      trustImpact: 2,
      riskImpact: 0,
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
    },
  ];

  const scoring = calculateProfileScore({
    username: "developer",
    displayName: "Dev River",
    rawBio: "Software Engineer | Building tools",
    verifiedStatus: "UNVERIFIED",
    followerCount: 500,
    postCount: 25,
    externalLinks,
    bioVerifications,
    posts,
    highlights: [],
    contentConsistency: {
      status: "SUPPORTED",
      matchingTopics: ["OCCUPATION: Software Engineer"],
      discrepancies: [],
      evidenceIds: ["EV-POST-001"],
      explanation: "Topics match.",
    },
    evidenceLedger,
  });

  assert.equal(scoring.dimensions.length, 8, "Evaluates all 8 dimensions");
  assert.ok(scoring.overallScore > 50, "Earns positive trust score");
  assert.equal(scoring.riskLevel, "LOW");

  // Ensure every dimension with earned score references evidence IDs
  const dimensionsWithScore = scoring.dimensions.filter((d) => d.earnedScore > 0);
  for (const dim of dimensionsWithScore) {
    assert.ok(dim.evidenceIds.length > 0, `Dimension ${dim.name} has traceable evidence IDs`);
  }
});

test("PHASE 2 - TEST 9: Missing data does not penalize score or increase risk", () => {
  const scoring = calculateProfileScore({
    username: "minimal_user",
    displayName: null,
    rawBio: null,
    verifiedStatus: "UNVERIFIED",
    followerCount: null,
    postCount: null,
    externalLinks: [],
    bioVerifications: [],
    posts: [],
    highlights: [],
    contentConsistency: { status: "UNKNOWN", matchingTopics: [], discrepancies: [], evidenceIds: [], explanation: "No data." },
    sellerIdentityGraph: null,
    advertisingIntelligence: null,
    evidenceLedger: [],
  });

  // Neutral dimensions should have isNeutral = true
  const adDim = scoring.dimensions.find((d) => d.category === "Advertising");
  assert.equal(adDim?.isNeutral, true);
  assert.equal(adDim?.earnedScore, 0);

  const hlDim = scoring.dimensions.find((d) => d.category === "Highlights");
  assert.equal(hlDim?.isNeutral, true);
  assert.equal(hlDim?.earnedScore, 0);
});

test("PHASE 2 - TEST 10: Side Panel payload structure matches future Chrome extension specification", () => {
  const investigation = investigateInstagramProfile({
    username: "techcreator",
    displayName: "Tech Creator",
    rawBio: "Software Developer | Creator @TechLab\ntechlab.dev",
    externalLinks: ["https://techlab.dev", "https://github.com/techcreator"],
    posts: [
      { caption: "New software release #coding", mediaType: "image" },
    ],
  });

  const sidePanel = investigation.sidePanelData;
  assert.equal(sidePanel.profile.username, "@techcreator");
  assert.ok(typeof sidePanel.score === "number");
  assert.ok(typeof sidePanel.confidence === "number");
  assert.ok(typeof sidePanel.evidenceCoverage === "number");

  assert.ok(sidePanel.dimensions.identity);
  assert.ok(sidePanel.dimensions.bio);
  assert.ok(sidePanel.dimensions.content);
  assert.ok(sidePanel.dimensions.externalIdentity);
  assert.ok(sidePanel.dimensions.advertising);

  assert.ok(Array.isArray(sidePanel.evidence));
  assert.ok(Array.isArray(sidePanel.unknowns));
});

test("PHASE 2 - TEST 11: Full 18 sections rendered in exact order in generated HTML report", () => {
  const investigation = investigateInstagramProfile({
    username: "testbrand",
    displayName: "Test Brand",
    rawBio: "Handcrafted Bags | Pune\ntestbrand.in",
    externalLinks: ["https://testbrand.in"],
    posts: [
      { caption: "Genuine leather handcrafted bags #shop", mediaType: "image" },
    ],
  });

  const result = {
    evidence: {
      source: { platform: "instagram", url: "https://instagram.com/testbrand" },
      account: { username: "testbrand", display_name: "Test Brand" },
      post: { caption: "Genuine leather handcrafted bags #shop" },
      media: [],
      external_links: ["https://testbrand.in"],
      evidence: [],
      missing_information: [],
      errors: [],
    },
    profile_investigation: investigation,
    status: "EVIDENCE_COLLECTED",
  };

  const report = generateVerificationReport(result);
  const html = report.html;

  const expectedSections = [
    "1. Investigation Summary",
    "2. Profile Overview",
    "3. Raw Bio",
    "4. Bio Claim Extraction",
    "5. Bio Claim Verification",
    "6. External Links",
    "7. Identity Graph",
    "8. Highlights Investigation",
    "9. Content Investigation",
    "10. Cross-Source Consistency",
    "11. Advertising Intelligence",
    "12. Trust Signals",
    "13. Risk Signals",
    "14. Unknown / Unavailable Information",
    "15. Evidence Ledger",
    "16. Score Calculation",
    "17. Final Risk Assessment",
    "18. Investigation Limitations",
  ];

  let lastIndex = -1;
  for (const sec of expectedSections) {
    const idx = html.indexOf(sec);
    assert.ok(idx !== -1, `HTML contains section "${sec}"`);
    assert.ok(idx > lastIndex, `Section "${sec}" appears in correct sequential order`);
    lastIndex = idx;
  }
});

// =========================================================================
// PHASE 3.1 TESTS — CHROME EXTENSION PROFILE DETECTION
// =========================================================================

test("PHASE 3.1 - TEST 1: Detects public profile from standard URL", () => {
  const result = detectInstagramProfileFromUrl("https://www.instagram.com/dasandcode/");
  assert.ok(result !== null);
  assert.equal(result.username, "dasandcode");
  assert.equal(result.profileUrl, "https://www.instagram.com/dasandcode/");
  assert.ok(result.detectedAt.length > 0);
});

test("PHASE 3.1 - TEST 2: Detects profile with underscore and numbers", () => {
  const result = detectInstagramProfileFromUrl("https://www.instagram.com/example_user_123/");
  assert.ok(result !== null);
  assert.equal(result.username, "example_user_123");
  assert.equal(result.profileUrl, "https://www.instagram.com/example_user_123/");
});

test("PHASE 3.1 - TEST 3: Ignores /p/ post URLs", () => {
  const result = detectInstagramProfileFromUrl("https://www.instagram.com/p/ABC123/");
  assert.equal(result, null);
});

test("PHASE 3.1 - TEST 4: Ignores /reel/ and /reels/ URLs", () => {
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/reel/ABC123/"), null);
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/reels/C8XYZ/"), null);
});

test("PHASE 3.1 - TEST 5: Ignores /explore/ URLs", () => {
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/explore/"), null);
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/explore/tags/fashion/"), null);
});

test("PHASE 3.1 - TEST 6: Ignores /direct/ and other reserved routes", () => {
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/direct/"), null);
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/direct/t/12345/"), null);
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/stories/dasandcode/"), null);
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/accounts/login/"), null);
});

test("PHASE 3.1 - TEST 7: Ignores non-Instagram hostnames", () => {
  assert.equal(detectInstagramProfileFromUrl("https://example.com/user/"), null);
  assert.equal(detectInstagramProfileFromUrl("https://twitter.com/dasandcode"), null);
  assert.equal(detectInstagramProfileFromUrl("https://facebook.com/dasandcode"), null);
});

test("PHASE 3.1 - TEST 8: Normalizes trailing slashes and handles query parameters", () => {
  const withoutSlash = detectInstagramProfileFromUrl("https://www.instagram.com/dasandcode");
  assert.ok(withoutSlash !== null);
  assert.equal(withoutSlash.username, "dasandcode");
  assert.equal(withoutSlash.profileUrl, "https://www.instagram.com/dasandcode/");

  const withQueryParams = detectInstagramProfileFromUrl("https://www.instagram.com/dasandcode?igshid=xyz123&utm_source=ig_web_copy_link");
  assert.ok(withQueryParams !== null);
  assert.equal(withQueryParams.username, "dasandcode");
  assert.equal(withQueryParams.profileUrl, "https://www.instagram.com/dasandcode/");
});

test("PHASE 3.1 - TEST 9: Rejects malformed and invalid usernames", () => {
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/.invalid/"), null);
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/invalid./"), null);
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/in..valid/"), null);
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/@invalid/"), null);
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/invalid user/"), null);
  assert.equal(detectInstagramProfileFromUrl("https://www.instagram.com/"), null);
  assert.equal(detectInstagramProfileFromUrl(""), null);
});

// =========================================================================
// PHASE 3.2 TESTS — SAFE INSTAGRAM DOM EXTRACTION & METADATA COLLECTION
// =========================================================================

test("PHASE 3.2 - TEST 1: parseCount correctly normalizes valid counts with K, M, B and commas", () => {
  assert.equal(parseCount("1,234"), 1234);
  assert.equal(parseCount("12.4K"), 12400);
  assert.equal(parseCount("2.5k"), 2500);
  assert.equal(parseCount("1.2M"), 1200000);
  assert.equal(parseCount("100m"), 100000000);
  assert.equal(parseCount("1.5B"), 1500000000);
  assert.equal(parseCount("500"), 500);
  assert.equal(parseCount("0"), 0);
  assert.equal(parseCount("  42k  "), 42000);
});

test("PHASE 3.2 - TEST 2: parseCount returns null for invalid or ambiguous count strings", () => {
  assert.equal(parseCount(""), null);
  assert.equal(parseCount("   "), null);
  assert.equal(parseCount(null), null);
  assert.equal(parseCount(undefined), null);
  assert.equal(parseCount("abc"), null);
  assert.equal(parseCount("K"), null);
  assert.equal(parseCount("12.4.5K"), null);
  assert.equal(parseCount("-100"), null);
});

test("PHASE 3.2 - TEST 3: extractExternalUrl safely decodes Instagram redirect linkshim", () => {
  const redirected = extractExternalUrl("https://l.instagram.com/?u=https%3A%2F%2Fbrandstore.com%2Fshop%3Fref%3Dig&e=AT0abc");
  assert.equal(redirected, "https://brandstore.com/shop?ref=ig");

  const standard = extractExternalUrl("https://dasandcode.com");
  assert.equal(standard, "https://dasandcode.com");

  const withoutProtocol = extractExternalUrl("store.mybrand.in/collection");
  assert.equal(withoutProtocol, "https://store.mybrand.in/collection");

  assert.equal(extractExternalUrl(null), null);
  assert.equal(extractExternalUrl(""), null);
});

test("PHASE 3.2 - TEST 4: extractProfileFromDocument extracts complete profile metadata safely", () => {
  // Build a lightweight mock Document node structure
  function createMockElement(tagName, attrs = {}, textContent = "", innerHTML = "") {
    return {
      tagName: tagName.toUpperCase(),
      textContent,
      innerHTML: innerHTML || textContent,
      getAttribute(name) {
        return attrs[name] || null;
      },
      querySelector(selector) {
        if (selector.includes("img") && attrs.src) return this;
        if (selector.includes("span[title]") && attrs.title) return this;
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
  }

  const mockBioHtml = "Handmade leather goods 👜\nCrafted with passion in Pune 🇮🇳\nWorldwide shipping 🌍";

  const mockDoc = {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        innerHTML: "",
        get textContent() {
          return this.innerHTML.replace(/<[^>]*>/g, "");
        },
      };
    },
    querySelector(selector) {
      if (selector === "header" || selector === "main") {
        return {
          querySelector(sub) {
            if (sub.includes("span[dir='auto']") || sub.includes("last-child")) {
              return createMockElement("span", {}, "Handmade leather goods 👜\nCrafted with passion in Pune 🇮🇳\nWorldwide shipping 🌍", "Handmade leather goods 👜<br>Crafted with passion in Pune 🇮🇳<br>Worldwide shipping 🌍");
            }
            if (sub.includes("section h1") || sub === "header h1" || sub.includes("section h1, section span")) {
              return createMockElement("h1", {}, "Artisan Leather Co");
            }
            if (sub.includes("img")) {
              return createMockElement("img", { src: "https://instagram.com/pfp.jpg", alt: "artisan_leather profile picture" });
            }
            if (sub.includes("aria-label*='Verified'")) {
              return createMockElement("svg", { "aria-label": "Verified" });
            }
            if (sub.includes("category")) {
              return createMockElement("div", { class: "category" }, "Bags & Luggage");
            }
            return null;
          },
          querySelectorAll(sub) {
            if (sub.includes("ul > li") || sub.includes("followers")) {
              return [
                createMockElement("li", {}, "45 posts"),
                createMockElement("li", { title: "12,450" }, "12.4K followers"),
                createMockElement("li", {}, "180 following"),
              ];
            }
            if (sub.includes("l.instagram.com") || sub.includes("target='_blank'")) {
              return [
                createMockElement("a", { href: "https://l.instagram.com/?u=https%3A%2F%2Fartisanleather.in" }, "artisanleather.in"),
              ];
            }
            return [];
          },
        };
      }
      if (selector.includes("og:title")) {
        return createMockElement("meta", { content: "Artisan Leather Co (@artisan_leather) • Instagram photos" });
      }
      if (selector.includes("og:image")) {
        return createMockElement("meta", { content: "https://instagram.com/pfp.jpg" });
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes("highlight")) {
        return [
          createMockElement("li", {}, "Reviews"),
          createMockElement("li", {}, "Workshop"),
        ];
      }
      return [];
    },
  };

  const profileData = extractProfileFromDocument(mockDoc, "https://www.instagram.com/artisan_leather/");

  assert.equal(profileData.username, "artisan_leather");
  assert.equal(profileData.profileUrl, "https://www.instagram.com/artisan_leather/");
  assert.equal(profileData.displayName, "Artisan Leather Co");
  assert.ok(profileData.bio?.includes("Handmade leather goods 👜"));
  assert.ok(profileData.bio?.includes("Crafted with passion in Pune 🇮🇳"));
  assert.equal(profileData.profileImageUrl, "https://instagram.com/pfp.jpg");
  assert.equal(profileData.followerCount, 12450);
  assert.equal(profileData.followingCount, 180);
  assert.equal(profileData.postCount, 45);
  assert.equal(profileData.verified, true);
  assert.equal(profileData.accountCategory, "Bags & Luggage");
  assert.equal(profileData.externalLinks.length, 1);
  assert.equal(profileData.externalLinks[0].url, "https://artisanleather.in");
  assert.equal(profileData.highlights.length, 2);
  assert.equal(profileData.highlights[0].title, "Reviews");
  assert.equal(profileData.highlights[0].position, 0);
  assert.equal(profileData.collectionStatus, "COMPLETE");
  assert.equal(profileData.unavailableFields.length, 0);
});

test("PHASE 3.2 - TEST 5: extractProfileFromDocument correctly tags PARTIAL status when fields are missing", () => {
  const emptyDoc = {
    createElement(tag) {
      return { tagName: tag.toUpperCase(), innerHTML: "", textContent: "" };
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  const profileData = extractProfileFromDocument(emptyDoc, "https://www.instagram.com/minimal_profile/");

  assert.equal(profileData.username, "minimal_profile");
  assert.equal(profileData.profileUrl, "https://www.instagram.com/minimal_profile/");
  assert.equal(profileData.displayName, null);
  assert.equal(profileData.bio, null);
  assert.equal(profileData.followerCount, null);
  assert.equal(profileData.collectionStatus, "PARTIAL");
  assert.ok(profileData.unavailableFields.includes("displayName"));
  assert.ok(profileData.unavailableFields.includes("bio"));
  assert.ok(profileData.unavailableFields.includes("followerCount"));
});

test("PHASE 3.2 - TEST 6: extractProfileFromDocument returns UNAVAILABLE status for non-profile URLs", () => {
  const emptyDoc = {
    createElement(tag) { return { tagName: tag.toUpperCase() }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };

  const exploreData = extractProfileFromDocument(emptyDoc, "https://www.instagram.com/explore/");
  assert.equal(exploreData.username, null);
  assert.equal(exploreData.collectionStatus, "UNAVAILABLE");

  const postData = extractProfileFromDocument(emptyDoc, "https://www.instagram.com/p/ABC123/");
  assert.equal(postData.username, null);
  assert.equal(postData.collectionStatus, "UNAVAILABLE");
});

// =========================================================================
// PHASE 3.3 TESTS — PUBLIC POSTS & REELS COLLECTION
// =========================================================================

test("PHASE 3.3 - TEST 1: extractHashtags extracts clean tag names without #", () => {
  const sample = "Building the future of #AI and #startup in #coding! Check out #AI again.";
  const tags = extractHashtags(sample);
  assert.deepEqual(tags, ["AI", "startup", "coding"]);

  assert.deepEqual(extractHashtags(null), []);
  assert.deepEqual(extractHashtags(""), []);
  assert.deepEqual(extractHashtags("No tags here"), []);
});

test("PHASE 3.3 - TEST 2: extractMentions extracts valid handles without @", () => {
  const sample = "Collaboration with @companyname and @partner.co! Reach out to @official_user.";
  const mentions = extractMentions(sample);
  assert.deepEqual(mentions, ["companyname", "partner.co", "official_user"]);

  assert.deepEqual(extractMentions(null), []);
  assert.deepEqual(extractMentions(""), []);
  assert.deepEqual(extractMentions("No mentions here"), []);
});

test("PHASE 3.3 - TEST 3: extractPostShortcodeAndType parses /p/ and /reel/ URLs accurately", () => {
  const post = extractPostShortcodeAndType("https://www.instagram.com/p/DF123xyz/?utm_source=ig_web_copy_link");
  assert.equal(post.shortcode, "DF123xyz");
  assert.equal(post.mediaType, "POST");
  assert.equal(post.canonicalUrl, "https://www.instagram.com/p/DF123xyz/");

  const reel = extractPostShortcodeAndType("/reel/C987abc/");
  assert.equal(reel.shortcode, "C987abc");
  assert.equal(reel.mediaType, "REEL");
  assert.equal(reel.canonicalUrl, "https://www.instagram.com/reel/C987abc/");

  const reelsPlural = extractPostShortcodeAndType("https://instagram.com/reels/XYZ555");
  assert.equal(reelsPlural.shortcode, "XYZ555");
  assert.equal(reelsPlural.mediaType, "REEL");
  assert.equal(reelsPlural.canonicalUrl, "https://www.instagram.com/reel/XYZ555/");

  const invalid = extractPostShortcodeAndType("https://www.instagram.com/explore/");
  assert.equal(invalid.shortcode, null);
  assert.equal(invalid.mediaType, "UNKNOWN");
  assert.equal(invalid.canonicalUrl, null);
});

test("PHASE 3.3 - TEST 4: extractPostSamplesFromDocument respects bounded sample limit and visible ordering", () => {
  function createMockAnchor(href, alt, likeText, timeIso) {
    return {
      getAttribute(name) {
        if (name === "href") return href;
        return null;
      },
      querySelector(selector) {
        if (selector === "img") {
          return {
            getAttribute(name) {
              if (name === "src") return `https://instagram.com/media_${href.replace(/\W/g, "")}.jpg`;
              if (name === "alt") return alt;
              return null;
            },
          };
        }
        if (selector === "time") {
          return timeIso ? {
            getAttribute(name) {
              if (name === "datetime") return timeIso;
              return null;
            },
          } : null;
        }
        return null;
      },
      querySelectorAll(selector) {
        if (selector.includes("ul > li, span")) {
          return [
            { textContent: likeText, getAttribute() { return null; } },
            { textContent: "15 comments", getAttribute() { return null; } },
          ];
        }
        return [];
      },
    };
  }

  // Create 15 post anchors
  const mockAnchors = [];
  for (let i = 0; i < 15; i++) {
    const isReel = i % 3 === 0;
    const type = isReel ? "reel" : "p";
    mockAnchors.push(
      createMockAnchor(
        `https://www.instagram.com/${type}/POST_${i}/`,
        `Amazing handcrafted bag #${i} with #leather @leathercraft`,
        "1.2K likes",
        "2026-03-01T12:00:00.000Z"
      )
    );
  }

  const mockDoc = {
    querySelectorAll(selector) {
      if (selector.includes("/p/") || selector.includes("/reel/")) {
        return mockAnchors;
      }
      return [];
    },
  };

  // Test default bounded limit of 12
  const defaultSample = extractPostSamplesFromDocument(mockDoc);
  assert.equal(defaultSample.length, DEFAULT_POST_SAMPLE_LIMIT);
  assert.equal(defaultSample.length, 12);
  assert.equal(defaultSample[0].position, 0);
  assert.equal(defaultSample[0].id, "POST_0");
  assert.equal(defaultSample[0].mediaType, "REEL");
  assert.equal(defaultSample[0].likeCount, 1200);
  assert.equal(defaultSample[0].commentCount, 15);
  assert.equal(defaultSample[0].timestamp, "2026-03-01T12:00:00.000Z");
  assert.ok(defaultSample[0].hashtags.includes("leather"));
  assert.ok(defaultSample[0].mentions.includes("leathercraft"));

  // Test custom configured limit of 5
  const customSample = extractPostSamplesFromDocument(mockDoc, 5);
  assert.equal(customSample.length, 5);
  assert.equal(customSample[4].position, 4);
  assert.equal(customSample[4].id, "POST_4");
});

test("PHASE 3.3 - TEST 5: Deduplicates multiple links pointing to the same post URL", () => {
  function createMockAnchor(href) {
    return {
      getAttribute(name) { return name === "href" ? href : null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
  }

  const mockDoc = {
    querySelectorAll() {
      return [
        createMockAnchor("https://www.instagram.com/p/DUP_123/"),
        createMockAnchor("https://www.instagram.com/p/DUP_123/?utm_source=ig_web"),
        createMockAnchor("https://www.instagram.com/reel/REEL_999/"),
      ];
    },
  };

  const samples = extractPostSamplesFromDocument(mockDoc);
  assert.equal(samples.length, 2);
  assert.equal(samples[0].id, "DUP_123");
  assert.equal(samples[1].id, "REEL_999");
});

// =========================================================================
// PHASE 3.4 TESTS — PUBLIC HIGHLIGHTS & STORY COLLECTION
// =========================================================================

test("PHASE 3.4 - TEST 1: extractHighlightsFromDocument extracts titles and preserves visible ordering", () => {
  function createMockHighlightItem(title, href, imgSrc) {
    return {
      textContent: title,
      querySelector(selector) {
        if (selector.includes("span") || selector.includes("div[dir='auto']")) {
          return { textContent: title };
        }
        if (selector === "a") {
          return href ? { getAttribute(name) { return name === "href" ? href : null; } } : null;
        }
        if (selector === "img") {
          return imgSrc ? { getAttribute(name) { return name === "src" ? imgSrc : null; } } : null;
        }
        return null;
      },
      closest(selector) {
        if (selector === "a" && href) {
          return { getAttribute(name) { return name === "href" ? href : null; } };
        }
        return null;
      },
    };
  }

  const titles = ["About", "Work", "Projects", "Reviews", "Clients", "Contact"];
  const mockItems = titles.map((t, idx) =>
    createMockHighlightItem(t, `https://www.instagram.com/stories/highlights/1800${idx}/`, `https://instagram.com/cover_${idx}.jpg`)
  );

  const mockDoc = {
    querySelector() { return null; }, // No active open story viewer
    querySelectorAll(selector) {
      if (selector.includes("highlight") || selector.includes("menu")) {
        return mockItems;
      }
      return [];
    },
  };

  const highlights = extractHighlightsFromDocument(mockDoc);
  assert.equal(highlights.length, 6);
  assert.equal(highlights[0].title, "About");
  assert.equal(highlights[0].position, 0);
  assert.equal(highlights[0].url, "https://www.instagram.com/stories/highlights/18000/");
  assert.equal(highlights[0].coverImageUrl, "https://instagram.com/cover_0.jpg");
  assert.equal(highlights[0].collectionStatus, "PARTIAL"); // Stories not active

  assert.equal(highlights[1].title, "Work");
  assert.equal(highlights[1].position, 1);
  assert.equal(highlights[5].title, "Contact");
  assert.equal(highlights[5].position, 5);
});

test("PHASE 3.4 - TEST 2: Deduplicates duplicate highlight references", () => {
  function createMockItem(title) {
    return {
      textContent: title,
      querySelector(selector) {
        if (selector.includes("span")) return { textContent: title };
        return null;
      },
      closest() { return null; },
    };
  }

  const mockDoc = {
    querySelector() { return null; },
    querySelectorAll() {
      return [
        createMockItem("Reviews"),
        createMockItem("reviews"), // Case-insensitive duplicate
        createMockItem("Work"),
        createMockItem("Reviews"),
      ];
    },
  };

  const highlights = extractHighlightsFromDocument(mockDoc);
  assert.equal(highlights.length, 2);
  assert.equal(highlights[0].title, "Reviews");
  assert.equal(highlights[1].title, "Work");
});

test("PHASE 3.4 - TEST 3: extractActiveStoriesFromDocument normalizes IMAGE and VIDEO media types and timestamps", () => {
  const mockDoc = {
    querySelector(selector) {
      if (selector.includes("dialog") || selector.includes("story")) {
        return {
          querySelectorAll(sub) {
            if (sub.includes("img") || sub.includes("video")) {
              return [
                {
                  tagName: "IMG",
                  getAttribute(name) {
                    return name === "src" ? "https://instagram.com/story_image_1.jpg" : null;
                  },
                },
                {
                  tagName: "VIDEO",
                  getAttribute(name) {
                    return name === "src" ? "https://instagram.com/story_video_2.mp4" : null;
                  },
                },
              ];
            }
            if (sub.includes("span[dir='auto']") || sub.includes("h1") || sub.includes("p")) {
              return [
                { textContent: "New project launched 🚀" },
              ];
            }
            return [];
          },
          querySelector(sub) {
            if (sub === "time") {
              return {
                getAttribute(name) {
                  return name === "datetime" ? "2026-03-01T15:30:00.000Z" : null;
                },
              };
            }
            return null;
          },
        };
      }
      return null;
    },
  };

  const stories = extractActiveStoriesFromDocument(mockDoc);
  assert.equal(stories.length, 2);
  assert.equal(stories[0].mediaType, "IMAGE");
  assert.equal(stories[0].mediaUrl, "https://instagram.com/story_image_1.jpg");
  assert.equal(stories[0].visibleText, "New project launched 🚀");
  assert.equal(stories[0].timestamp, "2026-03-01T15:30:00.000Z");
  assert.equal(stories[0].collectionStatus, "COMPLETE");

  assert.equal(stories[1].mediaType, "VIDEO");
  assert.equal(stories[1].mediaUrl, "https://instagram.com/story_video_2.mp4");
});

test("PHASE 3.4 - TEST 4: Respects bounded highlight and story limits", () => {
  function createMockItem(title) {
    return {
      textContent: title,
      querySelector(selector) {
        if (selector.includes("span")) return { textContent: title };
        return null;
      },
      closest() { return null; },
    };
  }

  // Create 30 highlight items
  const items = [];
  for (let i = 0; i < 30; i++) {
    items.push(createMockItem(`Highlight_${i}`));
  }

  const mockDoc = {
    querySelector() { return null; },
    querySelectorAll() { return items; },
  };

  // Test default limit of 20
  const defaultHighlights = extractHighlightsFromDocument(mockDoc);
  assert.equal(defaultHighlights.length, DEFAULT_HIGHLIGHT_LIMIT);
  assert.equal(defaultHighlights.length, 20);

  // Test custom limit of 8
  const customHighlights = extractHighlightsFromDocument(mockDoc, 8);
  assert.equal(customHighlights.length, 8);
  assert.equal(customHighlights[7].position, 7);
});

test("PHASE 3.4 - TEST 5: Missing optional story and highlight fields safely recorded as null without crash", () => {
  const mockDoc = {
    querySelector(selector) {
      if (selector.includes("dialog")) {
        return {
          querySelectorAll(sub) {
            if (sub.includes("img")) {
              return [
                {
                  tagName: "DIV", // Unknown tag
                  getAttribute() { return null; },
                },
              ];
            }
            return [];
          },
          querySelector() { return null; }, // No time element
        };
      }
      return null;
    },
    querySelectorAll(sub) {
      if (sub.includes("highlight")) {
        return [
          {
            textContent: "Minimal Highlight",
            querySelector() { return null; },
            closest() { return null; },
          },
        ];
      }
      return [];
    },
  };

  const highlights = extractHighlightsFromDocument(mockDoc);
  assert.equal(highlights.length, 1);
  assert.equal(highlights[0].title, "Minimal Highlight");
  assert.equal(highlights[0].url, null);
  assert.equal(highlights[0].coverImageUrl, null);
  assert.ok(highlights[0].unavailableFields.includes("url"));
  assert.ok(highlights[0].unavailableFields.includes("coverImageUrl"));

  const stories = extractActiveStoriesFromDocument(mockDoc);
  assert.equal(stories.length, 1);
  assert.equal(stories[0].mediaType, "UNKNOWN");
  assert.equal(stories[0].mediaUrl, null);
  assert.equal(stories[0].visibleText, null);
  assert.equal(stories[0].timestamp, null);
  assert.equal(stories[0].collectionStatus, "PARTIAL");
});

/* =========================================================================
   PHASE 3.5A: BACKEND API BOUNDARY & CLIENT TESTS
   ========================================================================= */

test("Phase 3.5A: validateProfileInvestigationRequest validates well-formed payload", () => {
  const validPayload = {
    schemaVersion: "1.0",
    profile: {
      username: "generic_shop_test",
      fullName: "Generic Test Shop",
      bio: "Official generic test store https://generic-shop.com",
      profileUrl: "https://www.instagram.com/generic_shop_test/",
      externalUrl: "https://generic-shop.com",
      externalLinks: ["https://generic-shop.com"],
      isVerified: false,
      isPrivate: false,
      isBusinessAccount: true,
      category: "Shopping & Retail",
      profilePicUrl: "https://cdn.instagram.com/p.jpg",
      postsCount: 50,
      followersCount: 12000,
      followingCount: 150,
      highlightsCount: 3,
      highlightTitles: ["Reviews", "Products"],
      highlights: [{ title: "Reviews", url: null, coverImageUrl: null, unavailableFields: ["url", "coverImageUrl"] }],
      posts: [{
        shortcode: "C8XYZ123",
        postUrl: "https://www.instagram.com/p/C8XYZ123/",
        caption: "Check out our newest collection!",
        mediaType: "IMAGE",
        likesCount: 50,
        commentsCount: 5,
        timestamp: "2026-09-01T00:00:00Z",
        hashtags: ["#shop"],
        mentions: [],
        taggedProducts: [],
      }],
      stories: [],
      capturedAt: "2026-10-06T12:00:00Z",
    },
  };

  const validated = validateProfileInvestigationRequest(validPayload);
  assert.equal(validated.valid, true);
  if (validated.valid) {
    assert.equal(validated.request.profile.username, "generic_shop_test");
    assert.equal(validated.request.profile.posts.length, 1);
    assert.equal(validated.request.profile.highlights.length, 1);
  }
});

test("Phase 3.5A: validateProfileInvestigationRequest rejects invalid payloads with predictable errors", () => {
  const r1 = validateProfileInvestigationRequest(null);
  assert.equal(r1.valid, false);
  assert.ok(r1.errors.some((e) => e.includes("Request body must be a valid JSON object")));

  const r2 = validateProfileInvestigationRequest({});
  assert.equal(r2.valid, false);
  assert.ok(r2.errors.some((e) => e.includes("profile")));

  const r3 = validateProfileInvestigationRequest({ profile: { username: "invalid space!", profileUrl: "https://instagram.com/abc" } });
  assert.equal(r3.valid, false);
  assert.ok(r3.errors.some((e) => e.includes("username")));

  const r4 = validateProfileInvestigationRequest({ profile: { username: "valid_user", profileUrl: "http://not-instagram.com/valid_user" } });
  assert.equal(r4.valid, false);
  assert.ok(r4.errors.some((e) => e.includes("profileUrl")));
});

test("Phase 3.5A: executeProfileInvestigation preserves evidence IDs and score dimensions", () => {
  const request = {
    schemaVersion: "1.0",
    profile: {
      username: "artisan_crafts_co",
      fullName: "Artisan Crafts Co",
      bio: "Handmade leather goods since 2018. Visit us at https://artisancrafts.co or contact support@artisancrafts.co",
      profileUrl: "https://www.instagram.com/artisan_crafts_co/",
      externalUrl: "https://artisancrafts.co",
      externalLinks: ["https://artisancrafts.co"],
      isVerified: false,
      isPrivate: false,
      isBusinessAccount: true,
      category: "Artisan Goods",
      profilePicUrl: "https://cdn.instagram.com/profile.jpg",
      postsCount: 120,
      followersCount: 25000,
      followingCount: 340,
      highlightsCount: 2,
      highlightTitles: ["Crafting", "Workshops"],
      highlights: [{ title: "Crafting", url: null, coverImageUrl: null, unavailableFields: [] }],
      posts: [{
        shortcode: "C9ARTISAN",
        postUrl: "https://www.instagram.com/p/C9ARTISAN/",
        caption: "Fresh batch of leather wallets crafted in our workshop!",
        mediaType: "IMAGE",
        likesCount: 120,
        commentsCount: 14,
        timestamp: "2026-09-15T00:00:00Z",
        hashtags: ["#leatherwork", "#artisan"],
        mentions: [],
        taggedProducts: [],
      }],
      stories: [],
      capturedAt: "2026-10-06T12:00:00Z",
    },
  };

  const response = executeProfileInvestigation(request);

  // Response contract structure
  assert.equal(response.schemaVersion, "1.0");
  assert.ok(response.investigationId.startsWith("INV-"));
  assert.equal(response.profile.username, "artisan_crafts_co");
  assert.ok(typeof response.score.trustScore === "number");
  assert.ok(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(response.score.riskLevel));
  assert.ok(typeof response.score.confidence === "number");
  assert.ok(typeof response.score.evidenceCoverage === "number");

  // Preserves all 8 score dimensions
  const dims = response.score.dimensions;
  assert.ok(dims.identityConsistency !== undefined);
  assert.ok(dims.profileCompleteness !== undefined);
  assert.ok(dims.bioEvidence !== undefined);
  assert.ok(dims.externalIdentity !== undefined);
  assert.ok(dims.contentConsistency !== undefined);
  assert.ok(dims.highlights !== undefined);
  assert.ok(dims.advertising !== undefined);
  assert.ok(dims.behaviouralSignals !== undefined);

  // Advertising is UNKNOWN / null because no ad data was provided, does NOT fabricate risk
  assert.equal(dims.advertising, null);

  // Preserves Evidence Ledger with IDs
  assert.ok(response.evidence.length > 0);
  const evidenceIds = response.evidence.map(e => e.evidenceId);
  assert.ok(evidenceIds.some(id => id.startsWith("EV-PROFILE-")));
  assert.ok(evidenceIds.some(id => id.startsWith("EV-BIO-")));

  // Checks each evidence item fields
  const firstEvidence = response.evidence[0];
  assert.ok(firstEvidence.evidenceId);
  assert.ok(firstEvidence.source);
  assert.ok(firstEvidence.claim);
  assert.ok(firstEvidence.status);
  assert.ok(typeof firstEvidence.confidence === "number");
  assert.ok(firstEvidence.capturedAt);
});

test("Phase 3.5A: HTTP Server /api/health and /api/investigate/profile endpoints work over real HTTP", async () => {
  const server = createVeriqooServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, "ok");
    assert.equal(healthJson.service, "veriqoo");

    // 2. CORS Preflight
    const optionsRes = await fetch(`${baseUrl}/api/investigate/profile`, {
      method: "OPTIONS",
      headers: {
        "Origin": "chrome-extension://abcdefghijklmnop",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert.equal(optionsRes.status, 204);
    assert.equal(optionsRes.headers.get("access-control-allow-origin"), "chrome-extension://abcdefghijklmnop");

    // 3. Valid Investigation Request
    const validPayload = {
      schemaVersion: "1.0",
      profile: {
        username: "http_test_user",
        fullName: "HTTP Test User",
        bio: "Testing HTTP endpoint https://httptest.example.com",
        profileUrl: "https://www.instagram.com/http_test_user/",
        externalUrl: "https://httptest.example.com",
        externalLinks: ["https://httptest.example.com"],
        isVerified: false,
        isPrivate: false,
        isBusinessAccount: false,
        category: null,
        profilePicUrl: null,
        postsCount: 10,
        followersCount: 500,
        followingCount: 200,
        highlightsCount: 0,
        highlightTitles: [],
        highlights: [],
        posts: [],
        stories: [],
        capturedAt: "2026-10-06T12:00:00Z",
      },
    };

    const investigateRes = await fetch(`${baseUrl}/api/investigate/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    assert.equal(investigateRes.status, 200);
    const investigateJson = await investigateRes.json();
    assert.equal(investigateJson.schemaVersion, "1.0");
    assert.ok(investigateJson.investigationId.startsWith("INV-"));
    assert.equal(investigateJson.profile.username, "http_test_user");
    assert.ok(typeof investigateJson.score.trustScore === "number");

    // 4. Invalid Investigation Request -> 400
    const invalidRes = await fetch(`${baseUrl}/api/investigate/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: { username: "invalid user with spaces", profileUrl: "invalid" } }),
    });
    assert.equal(invalidRes.status, 400);
    const errorJson = await invalidRes.json();
    assert.equal(errorJson.error.code, "INVALID_REQUEST");
    assert.ok(errorJson.error.message);

    // 5. 404 Route
    const notFoundRes = await fetch(`${baseUrl}/api/non_existent_route`);
    assert.equal(notFoundRes.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Phase 3.5A: Extension apiClient handles health, successful response, 400 errors, and timeouts", async () => {
  const server = createVeriqooServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. checkBackendHealth
    const health = await checkBackendHealth(baseUrl);
    assert.equal(health.status, "ok");
    assert.equal(health.service, "veriqoo");

    // 2. requestProfileInvestigation success
    const result = await requestProfileInvestigation({
      username: "client_test_user",
      fullName: "Client Test User",
      bio: "Client bio test",
      profileUrl: "https://www.instagram.com/client_test_user/",
      externalUrl: null,
      externalLinks: [],
      isVerified: false,
      isPrivate: false,
      isBusinessAccount: false,
      category: null,
      profilePicUrl: null,
      postsCount: 0,
      followersCount: 100,
      followingCount: 50,
      highlightsCount: 0,
      highlightTitles: [],
      highlights: [],
      posts: [],
      stories: [],
      capturedAt: "2026-10-06T12:00:00Z",
    }, { baseUrl, timeoutMs: 5000 });

    assert.ok(result.investigationId.startsWith("INV-"));
    assert.equal(result.profile.username, "client_test_user");
    assert.ok(typeof result.score.trustScore === "number");

    // 3. requestProfileInvestigation 400 error
    await assert.rejects(async () => {
      await requestProfileInvestigation({
        username: "bad username",
        fullName: "Bad",
        bio: null,
        profileUrl: "https://instagram.com/bad username",
        externalUrl: null,
        externalLinks: [],
        isVerified: false,
        isPrivate: false,
        isBusinessAccount: false,
        category: null,
        profilePicUrl: null,
        postsCount: 0,
        followersCount: 0,
        followingCount: 0,
        highlightsCount: 0,
        highlightTitles: [],
        highlights: [],
        posts: [],
        stories: [],
        capturedAt: "2026-10-06T12:00:00Z",
      }, { baseUrl, timeoutMs: 5000 });
    }, (err) => {
      assert.ok(err instanceof VeriqooApiError);
      assert.equal(err.status, 400);
      assert.equal(err.code, "INVALID_REQUEST");
      return true;
    });

    // 4. Timeout handling (using 1ms timeout)
    await assert.rejects(async () => {
      await requestProfileInvestigation({
        username: "timeout_test_user",
        fullName: "Timeout",
        bio: null,
        profileUrl: "https://www.instagram.com/timeout_test_user/",
        externalUrl: null,
        externalLinks: [],
        isVerified: false,
        isPrivate: false,
        isBusinessAccount: false,
        category: null,
        profilePicUrl: null,
        postsCount: 0,
        followersCount: 0,
        followingCount: 0,
        highlightsCount: 0,
        highlightTitles: [],
        highlights: [],
        posts: [],
        stories: [],
        capturedAt: "2026-10-06T12:00:00Z",
      }, { baseUrl, timeoutMs: 1 });
    }, (err) => {
      assert.ok(err instanceof VeriqooApiError);
      assert.equal(err.code, "TIMEOUT");
      return true;
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});








