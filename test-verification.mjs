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
} from "./agent/verification/index.ts";
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


