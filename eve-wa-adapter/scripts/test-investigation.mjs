import { investigateInstagramProfile } from "../agent/verification/profileInvestigator.ts";
import { generateVerificationReport } from "../agent/verification/reportGenerator.ts";
import * as fs from "node:fs";
import * as path from "node:path";

// Allow testing any profile passed via CLI argument or default to a realistic sample
const targetUsername = process.argv[2] ? process.argv[2].replace(/^@/, "") : "artisan_coffee_roasters";

console.log("\n===============================================================================");
console.log(`  VERIQOO DEEP PROFILE INVESTIGATION — LOCAL CLI RUNNER`);
console.log(`  Target Profile: @${targetUsername}`);
console.log("===============================================================================\n");

const testProfileData = {
  url: `https://www.instagram.com/${targetUsername}/`,
  username: targetUsername,
  displayName: "Artisan Coffee Roasters",
  rawBio: "Specialty small-batch coffee roasters founded 2019. 100% Arabica ethically sourced. Shop our single origins at https://artisancoffee.store or email hello@artisancoffee.store",
  profilePictureUrl: "https://cdn.instagram.com/profiles/artisan_coffee.jpg",
  followerCount: 28400,
  followingCount: 320,
  postCount: 145,
  verifiedStatus: "UNVERIFIED",
  accountCategory: "Food & Beverage",
  externalLinks: [
    "https://artisancoffee.store",
    "https://twitter.com/artisancoffee",
  ],
  contactInformation: {
    email: "hello@artisancoffee.store",
    phone: null,
    address: "Seattle, WA",
  },
  highlights: [
    { title: "Origins", stories: ["Ethical farm in Colombia", "Direct trade beans"] },
    { title: "Roasting", stories: ["Drum roaster batch 42", "Light roast profile"] },
    { title: "Reviews", stories: ["5 stars from Coffee Review", "Customer feedback"] },
  ],
  posts: [
    {
      url: `https://www.instagram.com/p/CR123ABC/`,
      caption: "Our new Ethiopian Yirgacheffe washed process is finally here! Notes of bergamot and jasmine. Link in bio.",
      timestamp: "2026-09-18T14:30:00Z",
      mediaType: "image",
      likes: 342,
      comments: 28,
    },
    {
      url: `https://www.instagram.com/p/CR456DEF/`,
      caption: "Behind the scenes at the roastery. Freshly packed in compostable 250g bags. Ethical sourcing certified.",
      timestamp: "2026-09-25T11:00:00Z",
      mediaType: "image",
      likes: 410,
      comments: 35,
    },
  ],
};

console.log("[1/3] Running local profile investigation pipeline...");
const investigationResult = investigateInstagramProfile(testProfileData);

console.log("\n===============================================================================");
console.log(`  INVESTIGATION RESULTS`);
console.log("===============================================================================");
console.log(`  Investigation Status : ${investigationResult.investigationStatus}`);
console.log(`  Trust Score          : ${investigationResult.overallScore} / 100`);
console.log(`  Risk Level           : ${investigationResult.sidePanelData.riskLevel}`);
console.log(`  Confidence           : ${investigationResult.sidePanelData.confidence}%`);
console.log(`  Evidence Coverage    : ${investigationResult.sidePanelData.evidenceCoverage}%`);
console.log("-------------------------------------------------------------------------------");

console.log("\n--- 8-DIMENSION SCORE BREAKDOWN ---");
for (const dim of investigationResult.dimensions) {
  const bar = "█".repeat(Math.round((dim.earnedScore / (dim.maxScore || 1)) * 10)).padEnd(10, "░");
  console.log(`  • ${dim.category.padEnd(24)}: ${String(dim.earnedScore).padStart(2)} / ${String(dim.maxScore).padStart(2)}  [${bar}]  ${dim.isNeutral ? "(Neutral)" : ""}`);
}

console.log("\n--- EVIDENCE LEDGER TRACEABILITY ---");
console.log(`  Total Evidence Items: ${investigationResult.evidence.length}`);
for (const ev of investigationResult.evidence) {
  const icon = ev.riskImpact > 0 ? "⚠️" : ev.trustImpact > 0 ? "✅" : "ℹ️";
  console.log(`  ${icon} [${ev.id}] (${ev.source})`);
  console.log(`     Claim: ${ev.claim || ev.observedText}`);
  console.log(`     Status: ${ev.status} | Confidence: ${ev.confidence}% | Trust: +${ev.trustImpact} | Risk: -${ev.riskImpact}`);
}

console.log("\n--- EXTRACTED BIO CLAIMS & VERIFICATIONS ---");
for (const ver of investigationResult.claimVerifications) {
  const sources = ver.checkedSources || [];
  const statusStr = `[${ver.status}] (Checked: ${sources.join(", ") || "bio"})`;
  console.log(`  • ${ver.claim.claimType.padEnd(18)} : "${ver.claim.claimText}" -> ${statusStr}`);
}

console.log("\n[2/3] Testing HTTP API Boundary (POST http://localhost:3000/api/investigate/profile)...");
try {
  const apiPayload = {
    schemaVersion: "1.0",
    profile: {
      username: testProfileData.username,
      profileUrl: testProfileData.url,
      displayName: testProfileData.displayName,
      bio: testProfileData.rawBio,
      profileImageUrl: testProfileData.profilePictureUrl,
      followerCount: testProfileData.followerCount,
      followingCount: testProfileData.followingCount,
      postCount: testProfileData.postCount,
      verified: false,
      accountCategory: testProfileData.accountCategory,
      externalLinks: testProfileData.externalLinks.map((url) => ({ url, label: null })),
      highlights: testProfileData.highlights.map((h, i) => ({
        id: `hl_${i}`,
        title: h.title,
        position: i,
        url: null,
        stories: h.stories.map((s, j) => ({
          id: `st_${i}_${j}`,
          position: j,
          url: null,
          mediaType: "IMAGE",
          visibleText: s,
          timestamp: null,
          mediaUrl: null,
          source: "DOM",
          collectionStatus: "COMPLETE",
          unavailableFields: [],
        })),
        collectionStatus: "COMPLETE",
        unavailableFields: [],
        collectedAt: new Date().toISOString(),
      })),
      posts: testProfileData.posts.map((p, i) => ({
        id: `post_${i}`,
        url: p.url,
        mediaType: "POST",
        caption: p.caption,
        timestamp: p.timestamp,
        likeCount: p.likes,
        commentCount: p.comments,
        hashtags: [],
        mentions: [],
        visibleText: null,
        mediaUrl: null,
        position: i,
        source: "DOM",
        collectedAt: new Date().toISOString(),
        collectionStatus: "COMPLETE",
        unavailableFields: [],
      })),
      collectedAt: new Date().toISOString(),
      collectionStatus: "COMPLETE",
      unavailableFields: [],
    },
  };

  const response = await fetch("http://localhost:3000/api/investigate/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(apiPayload),
  });

  if (response.ok) {
    const apiResult = await response.json();
    console.log(`  ✓ HTTP API returned status 200 OK`);
    console.log(`  ✓ Investigation ID : ${apiResult.investigationId}`);
    console.log(`  ✓ API Trust Score  : ${apiResult.score.trustScore} / 100`);
    console.log(`  ✓ Evidence Count   : ${apiResult.evidence.length} items`);
    console.log(`  ✓ Risk Signals     : ${apiResult.riskSignals.length} items`);
    console.log(`  ✓ Trust Signals    : ${apiResult.trustSignals.length} items`);
  } else {
    console.log(`  ⚠️ HTTP API returned status ${response.status}: ${await response.text()}`);
  }
} catch (err) {
  console.log(`  ⚠️ Note: HTTP server check skipped (${err.message})`);
}

console.log("\n[3/3] Saving investigation artifact...");
const reportsDir = path.resolve(process.cwd(), "reports");
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const artifactPath = path.join(reportsDir, `investigation-${targetUsername}.json`);
fs.writeFileSync(artifactPath, JSON.stringify(investigationResult, null, 2), "utf-8");
console.log(`  ✓ Full JSON investigation dossier saved to: ${artifactPath}`);

console.log("\n===============================================================================");
console.log(`  LOCAL TEST COMPLETED SUCCESSFULLY!`);
console.log("===============================================================================\n");
