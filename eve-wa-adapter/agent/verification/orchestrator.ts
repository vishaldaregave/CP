import { collectInstagramEvidence, parseInstagramUrl } from "./instagramEvidence.ts";
import { extractProductAndSeller } from "./extractor.ts";
import { collectMetaAdEvidence } from "./metaAdEvidence.ts";
import { collectWebsiteEvidence } from "./websiteEvidence.ts";
import { downloadMedia } from "./mediaUtils.ts";
import { performOCR } from "./ocrEngine.ts";
import { extractPackagingInfo } from "./packagingExtractor.ts";
import { analyzeAdClaims } from "./adClaimAnalyzer.ts";
import {
  compareInstagramAndWebsite,
  compareImageWithInstagramAndWebsite,
  compareAdvertiserIdentity,
} from "./consistency.ts";
import { buildSellerIdentityGraph } from "./sellerIdentity.ts";
import { evaluateProductConsistency } from "./productConsistency.ts";
import { buildEvidenceTimeline } from "./evidenceTimeline.ts";
import { normalizeEvidence } from "./evidenceNormalizer.ts";
import { buildTrustMatrix } from "./trustMatrix.ts";
import { evaluateRisk } from "./riskEngine.ts";
import { formatVerificationResult } from "./formatter.ts";
import { generateVerificationReport } from "./reportGenerator.ts";
import {
  storePostPurchaseSession,
  getPostPurchaseSession,
  compareAdvertisedVsReceived,
} from "./productComparison.ts";
import { analyzeReceivedProductImage } from "./receivedProductAnalyzer.ts";
import type {
  VerificationResult,
  WebsiteEvidence,
  ConsistencyResult,
  MediaEvidence,
  ImageCrossCheckResult,
  MetaAdEvidence,
  AdClaimAnalysis,
  SellerIdentityGraph,
  ProductConsistencyReport,
  EvidenceTimeline,
  PostPurchaseComparisonResult,
} from "./types.ts";

/**
 * Runs the complete Instagram + Meta Ad + Website + Media/OCR verification pipeline for a given Instagram URL.
 */
export async function verifyInstagramProduct(
  url: string,
  contextText?: string,
): Promise<VerificationResult> {
  console.info(`[VERIFY LIVE 010] ORCHESTRATOR_ENTER: url="${url}"`);
  const parsed = parseInstagramUrl(url);
  console.info(`[WA] VERIFICATION_START: canonical_url="${parsed.canonicalUrl}" shortcode="${parsed.shortcode || "N/A"}" type="${parsed.type}"`);
  console.info(`[VERIFY] URL_RECEIVED: detected="${url}" canonical="${parsed.canonicalUrl}" shortcode="${parsed.shortcode || "N/A"}" type="${parsed.type}"`);

  // 1. Instagram Evidence Collection
  const tInstaStart = Date.now();
  console.info(`[VERIFY TIMING] INSTAGRAM_COLLECTION_START`);
  console.info(`[VERIFY LIVE 011] INSTAGRAM_COLLECTION_START`);
  const evidence = await collectInstagramEvidence(url, contextText);
  const tInstaDuration = Date.now() - tInstaStart;
  console.info(`[VERIFY LIVE 012] INSTAGRAM_COLLECTION_END: username="${evidence.account.username || "N/A"}" caption_length=${evidence.post.caption?.length || 0} media_count=${evidence.media.length}`);
  console.info(`[VERIFY TIMING] INSTAGRAM_COLLECTION_END duration_ms=${tInstaDuration}`);
  console.info(
    `[VERIFY] INSTAGRAM_EVIDENCE: username="${evidence.account.username || "N/A"}" caption_length=${evidence.post.caption?.length || 0} media_count=${evidence.media.length} external_links=[${evidence.external_links.join(", ")}] facts_count=${evidence.evidence.length}`,
  );

  // 2. Product & Seller Extraction
  const { product, seller, claims } = extractProductAndSeller(evidence);

  // 3. External Website Evidence Investigation
  let website_evidence: WebsiteEvidence | null = null;
  let consistency: ConsistencyResult | null = null;

  const targetWebsiteUrl = evidence.external_links[0] || seller.website;
  const tWebStart = Date.now();
  console.info(`[VERIFY TIMING] WEBSITE_COLLECTION_START`);
  console.info(`[VERIFY LIVE 013] WEBSITE_COLLECTION_START: targetUrl="${targetWebsiteUrl || "none"}"`);
  if (targetWebsiteUrl) {
    website_evidence = await collectWebsiteEvidence(targetWebsiteUrl);
    const policyCount = Object.values(website_evidence.policies).filter(Boolean).length;
    console.info(
      `[VERIFY] WEBSITE_EVIDENCE: url="${targetWebsiteUrl}" domain="${website_evidence.domain}" status="${website_evidence.status}" company="${website_evidence.company.name || "N/A"}" policies_found=${policyCount}`,
    );

    consistency = compareInstagramAndWebsite(evidence, product, seller, website_evidence);
  } else {
    console.info(`[VERIFY] WEBSITE_EVIDENCE: url=null status="not_available" reason="no external store link found"`);
  }
  const tWebDuration = Date.now() - tWebStart;
  console.info(`[VERIFY LIVE 014] WEBSITE_COLLECTION_END: status="${website_evidence?.status || "not_available"}"`);
  console.info(`[VERIFY TIMING] WEBSITE_COLLECTION_END duration_ms=${tWebDuration}`);

  // 4. Product Image / Media Download & OCR Analysis
  let media_evidence: MediaEvidence | null = null;
  let image_cross_check: ImageCrossCheckResult | null = null;

  const tMediaStart = Date.now();
  console.info(`[VERIFY TIMING] MEDIA_COLLECTION_START`);
  console.info(`[VERIFY LIVE 015] MEDIA_COLLECTION_START: media_count=${evidence.media.length}`);
  if (evidence.media.length > 0) {
    const targetImage = evidence.media[0];
    const imageBuffer = await downloadMedia(targetImage.url);
    const downloadSuccess = Boolean(imageBuffer);
    const imageSize = imageBuffer ? imageBuffer.byteLength : 0;
    const tMediaDuration = Date.now() - tMediaStart;

    console.info(`[VERIFY LIVE 016] MEDIA_COLLECTION_END: url_available=${downloadSuccess} size_bytes=${imageSize}`);
    console.info(`[VERIFY TIMING] MEDIA_COLLECTION_END duration_ms=${tMediaDuration}`);
    console.info(
      `[VERIFY] MEDIA_EVIDENCE: url_available=true media_url="${targetImage.url.slice(0, 80)}..." download_success=${downloadSuccess} size_bytes=${imageSize}`,
    );

    if (imageBuffer) {
      const tOcrStart = Date.now();
      console.info(`[VERIFY TIMING] OCR_START`);
      console.info(`[VERIFY LIVE 017] OCR_START`);
      const ocrResult = await performOCR(imageBuffer);
      const tOcrDuration = Date.now() - tOcrStart;
      console.info(`[VERIFY LIVE 018] OCR_END: status="${ocrResult.status}" confidence=${ocrResult.confidence}% text_length=${ocrResult.text.length}`);
      console.info(`[VERIFY TIMING] OCR_END duration_ms=${tOcrDuration}`);
      console.info(
        `[VERIFY] OCR_RESULT: status="${ocrResult.status}" confidence=${ocrResult.confidence}% text_length=${ocrResult.text.length}`,
      );

      const packagingInfo = extractPackagingInfo(ocrResult.text);
      console.info(
        `[VERIFY] PACKAGING_RESULT: brand="${packagingInfo.product.brand || "N/A"}" mrp="${packagingInfo.product.mrp || "N/A"}" licenses=${packagingInfo.regulatory.license_numbers.length} facts_extracted=${packagingInfo.facts.length}`,
      );

      image_cross_check = compareImageWithInstagramAndWebsite(
        packagingInfo,
        evidence,
        product,
        seller,
        website_evidence,
      );

      media_evidence = {
        media: evidence.media,
        ocr: ocrResult,
        packaging: packagingInfo,
        video_analysis: evidence.video_analysis || null,
        status: "analyzed",
        evidence: [
          `OCR extracted ${ocrResult.text.length} characters from product packaging`,
          ...packagingInfo.facts.map((f) => f.fact),
        ],
        errors: [],
      };
    } else {
      console.info(`[VERIFY LIVE 017] OCR_START (skipped - download failed)`);
      console.info(`[VERIFY LIVE 018] OCR_END: status="failed"`);
      console.info(`[VERIFY] OCR_RESULT: status="failed" reason="image download failed or timed out" text_length=0`);
      console.info(`[VERIFY] PACKAGING_RESULT: facts_extracted=0`);
      media_evidence = {
        media: evidence.media,
        ocr: null,
        packaging: null,
        video_analysis: evidence.video_analysis || null,
        status: "not_available",
        evidence: [],
        errors: ["Image download failed or timed out"],
      };
    }
  } else {
    const tMediaDuration = Date.now() - tMediaStart;
    console.info(`[VERIFY LIVE 016] MEDIA_COLLECTION_END: url_available=false media_count=0`);
    console.info(`[VERIFY TIMING] MEDIA_COLLECTION_END duration_ms=${tMediaDuration}`);
    console.info(`[VERIFY LIVE 017] OCR_START (skipped - no media)`);
    console.info(`[VERIFY LIVE 018] OCR_END: status="not_available"`);
    console.info(`[VERIFY] MEDIA_EVIDENCE: url_available=false media_count=0`);
    console.info(`[VERIFY] OCR_RESULT: status="not_available" text_length=0`);
    console.info(`[VERIFY] PACKAGING_RESULT: facts_extracted=0`);
    media_evidence = {
      media: [],
      ocr: null,
      packaging: null,
      video_analysis: evidence.video_analysis || null,
      status: "not_available",
      evidence: [],
      errors: [],
    };
  }

  // 5. Meta Ad Library Evidence Collection (First-Class Collector)
  let meta_ad_evidence: MetaAdEvidence | null = null;
  const tMetaStart = Date.now();
  console.info(`[VERIFY TIMING] META_AD_COLLECTION_START`);
  console.info(`[VERIFY LIVE 026] META_AD_COLLECTION_START`);
  try {
    meta_ad_evidence = await collectMetaAdEvidence(
      {
        instagramUrl: url,
        instagramHandle: evidence.account.username,
        sellerName: seller.name,
        brand: product.brand,
        product: product.name,
      },
      product,
      seller,
    );
  } catch (metaErr) {
    console.warn(`[VERIFY] META_AD_COLLECTION_EXCEPTION:`, metaErr);
    meta_ad_evidence = {
      status: "unavailable",
      queryTerms: [],
      country: process.env.META_AD_LIBRARY_COUNTRY || "IN",
      ads: [],
      totalFound: 0,
      source: "meta_ad_library",
      collectedAt: new Date().toISOString(),
      error: "Meta Ad Library collection encountered an error",
      limitation: "Meta Ad Library collection encountered an unexpected error.",
      evidenceSource: "Meta Ad Library",
    };
  }
  const tMetaDuration = Date.now() - tMetaStart;
  console.info(`[VERIFY LIVE 027] META_AD_COLLECTION_END: status="${meta_ad_evidence?.status || "unavailable"}"`);
  console.info(`[VERIFY TIMING] META_AD_COLLECTION_END duration_ms=${tMetaDuration}`);
  console.info(
    `[VERIFY] META_AD_EVIDENCE: status="${meta_ad_evidence?.status}" library_id="${meta_ad_evidence?.libraryId || "N/A"}" advertiser="${meta_ad_evidence?.advertiserName || "N/A"}"`,
  );

  // If website wasn't available before, but Meta Ad has a destination URL, fetch website evidence
  if (!website_evidence && meta_ad_evidence?.destinationUrl) {
    website_evidence = await collectWebsiteEvidence(meta_ad_evidence.destinationUrl);
    consistency = compareInstagramAndWebsite(evidence, product, seller, website_evidence);
  }

  // 6. Ad Claim & Pressure Analysis
  const tClaimStart = Date.now();
  console.info(`[VERIFY TIMING] AD_CLAIM_ANALYSIS_START`);
  console.info(`[VERIFY LIVE 028] AD_CLAIM_ANALYSIS_START`);
  const adTexts = (meta_ad_evidence?.ads || []).map((a) => [a.creative.primary_text, a.creative.headline, a.creative.description].filter(Boolean).join("\n"));
  const textForClaimAnalysis = [
    evidence.post.caption,
    ...adTexts,
    meta_ad_evidence?.adText,
    meta_ad_evidence?.linkTitle,
    meta_ad_evidence?.linkDescription,
  ]
    .filter(Boolean)
    .join("\n");
  const claimSource = meta_ad_evidence?.status === "found" ? "meta_ad" : "instagram";
  const ad_claim_analysis = analyzeAdClaims(textForClaimAnalysis, claimSource);
  const tClaimDuration = Date.now() - tClaimStart;
  console.info(
    `[VERIFY LIVE 029] AD_CLAIM_ANALYSIS_END: claims_count=${ad_claim_analysis.claims_detected.length} pressure_signals=${ad_claim_analysis.ad_pressure_signals.length}`,
  );
  console.info(`[VERIFY TIMING] AD_CLAIM_ANALYSIS_END duration_ms=${tClaimDuration}`);
  console.info(
    `[VERIFY] AD_CLAIM_ANALYSIS: detected=${ad_claim_analysis.claims_detected.length} pressure_signals=${ad_claim_analysis.ad_pressure_signals.length}`,
  );

  // Compute Advertiser Identity Comparison
  const advertiserIdentity = compareAdvertiserIdentity(
    seller.username || evidence.account.username || seller.name,
    meta_ad_evidence?.advertiserName || null,
    website_evidence?.company.name || null,
  );
  if (consistency) {
    consistency.advertiser_identity = advertiserIdentity;
  } else {
    consistency = {
      seller_consistency: "UNKNOWN",
      product_consistency: "UNKNOWN",
      brand_consistency: "UNKNOWN",
      price_consistency: "UNKNOWN",
      advertiser_identity: advertiserIdentity,
      details: [],
    };
  }

  // 7. Seller Identity Graph (Feature 1)
  const seller_identity_graph: SellerIdentityGraph = buildSellerIdentityGraph(
    evidence,
    seller,
    meta_ad_evidence,
    website_evidence,
  );

  // 8. Cross-Source Product Consistency (Feature 2)
  const product_consistency: ProductConsistencyReport = evaluateProductConsistency(
    evidence,
    product,
    seller,
    website_evidence,
    media_evidence,
    meta_ad_evidence,
    ad_claim_analysis,
  );

  // 9. Multi-Source Evidence Normalization & Cross-Source Trust Matrix
  const tNormStart = Date.now();
  console.info(`[VERIFY TIMING] NORMALIZATION_START`);
  console.info(`[VERIFY LIVE 019] NORMALIZATION_START`);
  const normalized_evidence = normalizeEvidence(
    evidence,
    product,
    seller,
    website_evidence,
    media_evidence,
    meta_ad_evidence,
  );
  const normalizedCount = Object.values(normalized_evidence).reduce(
    (acc, curr) => acc + (Array.isArray(curr) ? curr.length : 0),
    0,
  );
  const tNormDuration = Date.now() - tNormStart;
  console.info(`[VERIFY LIVE 020] NORMALIZATION_END: mapped_fields_count=${normalizedCount}`);
  console.info(`[VERIFY TIMING] NORMALIZATION_END duration_ms=${tNormDuration}`);
  console.info(`[VERIFY] NORMALIZED_EVIDENCE: mapped_fields_count=${normalizedCount}`);

  const trust_matrix = buildTrustMatrix(
    normalized_evidence,
    evidence,
    website_evidence,
    media_evidence,
    meta_ad_evidence,
    ad_claim_analysis,
  );

  const fieldResults = Object.values(trust_matrix.fields).map((f) => f.result);
  const matchCount = fieldResults.filter((r) => r === "MATCH").length;
  const partialCount = fieldResults.filter((r) => r === "PARTIAL").length;
  const mismatchCount = fieldResults.filter((r) => r === "MISMATCH").length;
  const unknownCount = fieldResults.filter((r) => r === "UNKNOWN").length;

  console.info(
    `[VERIFY] TRUST_MATRIX: MATCH=${matchCount} PARTIAL=${partialCount} MISMATCH=${mismatchCount} UNKNOWN=${unknownCount} trust_signals=${trust_matrix.trust_signals.length} risk_signals=${trust_matrix.risk_signals.length} missing_info=${trust_matrix.missing_information.length}`,
  );

  // 10. Evidence Timeline (Feature 4)
  const evidence_timeline: EvidenceTimeline = buildEvidenceTimeline({
    evidence,
    website: website_evidence,
    media: media_evidence,
    metaAd: meta_ad_evidence,
  });

  // 11. Comprehensive Multi-Source Risk Evaluation (Feature 5 & 6)
  const tRiskStart = Date.now();
  console.info(`[VERIFY TIMING] RISK_ENGINE_START`);
  console.info(`[VERIFY LIVE 021] RISK_ENGINE_START`);
  const risk = evaluateRisk(
    evidence,
    product,
    seller,
    claims,
    website_evidence,
    consistency,
    media_evidence,
    image_cross_check,
    trust_matrix,
    meta_ad_evidence,
    ad_claim_analysis,
    seller_identity_graph,
    product_consistency,
    null,
  );
  const tRiskDuration = Date.now() - tRiskStart;
  console.info(`[VERIFY LIVE 022] RISK_ENGINE_END: risk="${risk.risk_level}" confidence=${risk.confidence}% coverage=${risk.evidence_coverage}%`);
  console.info(`[VERIFY TIMING] RISK_ENGINE_END duration_ms=${tRiskDuration}`);
  console.info(
    `[VERIFY] RISK_RESULT: final_risk="${risk.risk_level}" confidence=${risk.confidence}% score=${risk.score} coverage=${risk.evidence_coverage}% recommendation="${risk.recommendation.slice(0, 60)}..."`,
  );

  const hasAnyMeaningfulData = Boolean(
    evidence.post.caption ||
    evidence.account.username ||
    website_evidence?.status === "accessible" ||
    meta_ad_evidence?.status === "found" ||
    media_evidence?.packaging ||
    product.name ||
    seller.username
  );

  const status = hasAnyMeaningfulData ? "EVIDENCE_COLLECTED" : "INSUFFICIENT_EVIDENCE";
  const failure_reason = hasAnyMeaningfulData
    ? undefined
    : evidence.errors[0] || evidence.missing_information[0] || "Instagram post details could not be retrieved.";

  console.info(`[VERIFY LIVE 025] ORCHESTRATOR_EXIT: status="${status}"`);
  return {
    evidence,
    meta_ad_evidence,
    website_evidence,
    media_evidence,
    image_cross_check,
    consistency,
    ad_claim_analysis,
    seller_identity_graph,
    product_consistency,
    evidence_timeline,
    trust_matrix,
    product,
    seller,
    risk,
    status,
    failure_reason,
  };
}

/**
 * Executes the verification pipeline asynchronously and delivers the formatted
 * result message back to the same WhatsApp user.
 */
export async function runVerificationPipeline(
  url: string,
  jid: string,
  sendMessage: (jid: string, text: string) => Promise<void>,
  contextText?: string,
  sendDocument?: (jid: string, filePath: string, fileName: string, mimetype: string) => Promise<void>,
): Promise<void> {
  try {
    const result = await verifyInstagramProduct(url, contextText);
    console.info(
      `[WA] VERIFICATION_FINISHED: risk="${result.risk.risk_level}" confidence=${result.risk.confidence}% evidence_count=${result.evidence.evidence.length} missing_info_count=${result.risk.missing_information.length}`,
    );

    let generatedReportPath: string | null = null;
    let generatedReportFileName: string | null = null;
    let reportId = `REP-${Date.now().toString(36).toUpperCase()}`;

    // Generate detailed verification report file
    try {
      const tReportStart = Date.now();
      console.info(`[VERIFY TIMING] REPORT_START`);
      console.info(`[VERIFY LIVE 023] REPORT_START`);
      const report = generateVerificationReport(result);
      const tReportDuration = Date.now() - tReportStart;
      reportId = report.report_id;
      console.info(`[VERIFY LIVE 024] REPORT_END: report_id="${report.report_id}" file_path="${report.file_path}"`);
      console.info(`[VERIFY TIMING] REPORT_END duration_ms=${tReportDuration}`);
      console.info(`[VERIFY] REPORT_RESULT: report_id="${report.report_id}" file_path="${report.file_path}"`);
      generatedReportPath = report.file_path;
      generatedReportFileName = `verification-${report.report_id}.html`;
    } catch (reportErr) {
      console.error(`[VERIFY] REPORT_RESULT: failed to generate report:`, reportErr);
    }

    // Store post-purchase session for this user (Feature 3)
    storePostPurchaseSession(jid, result, reportId);

    const formattedMessage = formatVerificationResult(result, reportId);
    console.info(`[WA] RESULT_FORMATTED: length=${formattedMessage.length}`);

    console.info(`[VERIFY] FINAL_RESPONSE: sending formatted message to jid=${jid} length=${formattedMessage.length}`);
    await sendMessage(jid, formattedMessage);

    // Send the actual HTML report file as a document attachment via WhatsApp
    if (sendDocument && generatedReportPath && generatedReportFileName) {
      try {
        console.info(`[VERIFY] FINAL_RESPONSE: sending document attachment "${generatedReportFileName}" to jid=${jid}`);
        await sendDocument(jid, generatedReportPath, generatedReportFileName, "text/html");
      } catch (docErr) {
        console.error(`[VERIFY] FINAL_RESPONSE: failed to attach report document:`, docErr);
      }
    }

    console.info(`[VERIFY] Pipeline execution completed successfully for jid=${jid}`);
  } catch (err) {
    console.error(`[VERIFY] Unexpected error during verification for jid=${jid}:`, err);
    try {
      const fallbackMessage = [
        "🔍 PRODUCT VERIFICATION",
        "",
        "Status: ⚪ INSUFFICIENT EVIDENCE",
        "",
        "I could not complete the verification at this moment.",
        "",
        "Reason:",
        "An unexpected error occurred while processing the verification.",
        "",
        "Recommendation:",
        "Please verify the seller and website independently before making a purchase.",
      ].join("\n");
      await sendMessage(jid, fallbackMessage);
    } catch (sendErr) {
      console.error(`[VERIFY] Failed to send fallback message to jid=${jid}:`, sendErr);
    }
  }
}

/**
 * Handles post-purchase received product verification when a user sends a photo of their delivered item.
 */
export async function runPostPurchaseVerification(
  jid: string,
  imageBuffer: Buffer,
  imageMimetype: string,
  sendMessage: (jid: string, text: string) => Promise<void>,
  sendDocument?: (jid: string, filePath: string, fileName: string, mimetype: string) => Promise<void>,
): Promise<boolean> {
  const session = getPostPurchaseSession(jid);
  if (!session) {
    return false;
  }

  console.info(`[POST-PURCHASE] Processing received product proof for jid=${jid} investigationId=${session.investigationId}`);

  try {
    await sendMessage(jid, "📦 Analyzing received product proof... Checking brand markings, OCR text, and packaging.");

    // 1. Analyze received product image
    const receivedEvidence = await analyzeReceivedProductImage(imageBuffer);

    // 2. Compare against advertised product
    const comparisonResult = compareAdvertisedVsReceived(
      session.originalResult,
      receivedEvidence,
      session.investigationId,
    );

    // 3. Build updated timeline
    const updatedTimeline = buildEvidenceTimeline({
      evidence: session.originalResult.evidence,
      website: session.originalResult.website_evidence,
      media: session.originalResult.media_evidence,
      metaAd: session.originalResult.meta_ad_evidence,
      postPurchase: comparisonResult,
    });

    // 4. Update overall verification result
    const updatedResult: VerificationResult = {
      ...session.originalResult,
      post_purchase_comparison: comparisonResult,
      evidence_timeline: updatedTimeline,
      risk: {
        ...session.originalResult.risk,
        risk_level: comparisonResult.updatedRiskLevel,
        confidence: comparisonResult.updatedConfidence,
        explanation: comparisonResult.updatedRiskExplanation,
        evidence_coverage: Math.min(100, (session.originalResult.risk.evidence_coverage || 80) + 15),
      },
    };

    // 5. Generate updated report
    let reportPath: string | null = null;
    let reportFileName: string | null = null;
    try {
      const report = generateVerificationReport(updatedResult);
      reportPath = report.file_path;
      reportFileName = `post-purchase-${report.report_id}.html`;
    } catch (err) {
      console.error(`[POST-PURCHASE] Error generating updated report:`, err);
    }

    // 6. Format WhatsApp response
    const statusIcon = comparisonResult.overallRating === "MATCH" ? "🟢" : comparisonResult.overallRating === "MISMATCH" ? "🔴" : "🟠";
    const lines = [
      `🔍 VERIQOO POST-PURCHASE VERIFICATION`,
      ``,
      `Original Investigation: ${session.investigationId}`,
      `Seller: @${session.originalResult.seller.username || "unknown"}`,
      `Advertised: ${session.originalResult.product.name || "N/A"}`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `${statusIcon} COMPARISON VERDICT: ${comparisonResult.overallRating}`,
      `Confidence: ${comparisonResult.updatedConfidence}%`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `📦 RECEIVED PRODUCT ANALYSIS`,
      `• Brand Extracted: ${receivedEvidence.brand || "Uncertain / None"}`,
      `• Product Label: ${receivedEvidence.product || "Detected from visual text"}`,
      `• Quantity / Pack: ${receivedEvidence.net_quantity || receivedEvidence.pack_size || "N/A"}`,
      `• MRP / Price: ${receivedEvidence.mrp || receivedEvidence.price || "N/A"}`,
      ``,
    ];

    if (comparisonResult.mismatchesDetected.length > 0) {
      lines.push(`⚠️ DETECTED DISCREPANCIES`);
      for (const m of comparisonResult.mismatchesDetected) {
        lines.push(`• ${m}`);
      }
      lines.push(``);
    }

    lines.push(
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `💡 ASSESSMENT:`,
      comparisonResult.summary,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `📄 Updated Evidence Pack Attached Below`,
    );

    await sendMessage(jid, lines.join("\n"));

    if (sendDocument && reportPath && reportFileName) {
      try {
        await sendDocument(jid, reportPath, reportFileName, "text/html");
      } catch (err) {
        console.error(`[POST-PURCHASE] Error sending updated report document:`, err);
      }
    }

    return true;
  } catch (err) {
    console.error(`[POST-PURCHASE] Failed to process post-purchase proof:`, err);
    await sendMessage(jid, "⚠️ An error occurred while analyzing the received product proof. Please ensure the image is clear and well-lit.");
    return false;
  }
}
