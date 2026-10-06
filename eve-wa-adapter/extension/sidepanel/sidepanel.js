             
                   
                 
                           
                       
                            
import { detectInstagramProfileFromUrl } from "../shared/profileDetector.js";
import { requestProfileInvestigation, DEFAULT_API_BASE_URL } from "../shared/apiClient.js";

// DOM Elements
const stateIdle = document.getElementById("state-idle");
const stateDetected = document.getElementById("state-detected");
const stateResults = document.getElementById("state-results");

const idleIcon = document.getElementById("idle-icon");
const idleTitle = document.getElementById("idle-title");
const idleDesc = document.getElementById("idle-desc");

const profileHandle = document.getElementById("profile-handle");
const profileDisplayName = document.getElementById("profile-display-name");
const profileVerifiedBadge = document.getElementById("profile-verified-badge");
const profileCategory = document.getElementById("profile-category");
const avatarInitial = document.getElementById("avatar-initial");
const avatarImg = document.getElementById("avatar-img")                           ;
const avatarPlaceholder = document.getElementById("avatar-placeholder");

const bioContainer = document.getElementById("bio-container");
const bioText = document.getElementById("bio-text");

const linkContainer = document.getElementById("link-container");
const profileExtLink = document.getElementById("profile-ext-link")                            ;

const statsRow = document.getElementById("stats-row");
const statFollowers = document.getElementById("stat-followers");
const statFollowing = document.getElementById("stat-following");
const statPosts = document.getElementById("stat-posts");

const highlightsContainer = document.getElementById("highlights-container");
const highlightsCountBadge = document.getElementById("highlights-count-badge");
const highlightsList = document.getElementById("highlights-list");

const postsContainer = document.getElementById("posts-container");
const postsCountBadge = document.getElementById("posts-count-badge");
const postsList = document.getElementById("posts-list");

const statusText = document.getElementById("status-text");
const btnVerify = document.getElementById("btn-verify");
const investigatingLoader = document.getElementById("investigating-loader");

// Results Elements
const resTrustScore = document.getElementById("res-trust-score");
const resRiskBadge = document.getElementById("res-risk-badge");
const resConfidence = document.getElementById("res-confidence");
const resCoverage = document.getElementById("res-coverage");
const btnOpenPdf = document.getElementById("btn-open-pdf");
const linkDownloadPdf = document.getElementById("btn-download-pdf")                            ;
const pdfPathText = document.getElementById("pdf-path-text");
const dimensionsList = document.getElementById("dimensions-list");
const evidenceList = document.getElementById("evidence-list");
const btnReinvestigate = document.getElementById("btn-reinvestigate");

let currentProfile                                  = null;
let currentData                              = null;
let currentInvestigationResult             = null;

function formatCountDisplay(val                           )         {
  if (val === null || val === undefined) return "-";
  if (val >= 1000000) {
    return (val / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (val >= 1000) {
    return (val / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return val.toLocaleString();
}

/**
 * Renders the Idle state adaptively based on current tab location.
 */
function renderIdle(context                                                 = "general") {
  currentProfile = null;
  currentData = null;
  currentInvestigationResult = null;

  stateIdle?.classList.remove("hidden");
  stateIdle?.classList.add("visible");
  stateDetected?.classList.remove("visible");
  stateDetected?.classList.add("hidden");
  stateResults?.classList.remove("visible");
  stateResults?.classList.add("hidden");

  if (context === "not_instagram") {
    if (idleIcon) idleIcon.textContent = "🌐";
    if (idleTitle) idleTitle.textContent = "Not on Instagram";
    if (idleDesc) {
      idleDesc.innerHTML = "Veriqoo is standing by.<br>Navigate to an Instagram profile (e.g. <code>instagram.com/username/</code>) to investigate.";
    }
  } else if (context === "instagram_feed") {
    if (idleIcon) idleIcon.textContent = "🔍";
    if (idleTitle) idleTitle.textContent = "Instagram Feed / Explore";
    if (idleDesc) {
      idleDesc.innerHTML = "Navigate to a creator, brand, or business profile to generate an intelligence dossier.";
    }
  } else {
    if (idleIcon) idleIcon.textContent = "🔍";
    if (idleTitle) idleTitle.textContent = "No Instagram profile detected";
    if (idleDesc) {
      idleDesc.innerHTML = "Open a public Instagram profile (e.g. <code>instagram.com/username/</code>) to begin an investigation.";
    }
  }
}

/**
 * Renders the Detected Profile state with genuinely extracted metadata (no hallucination).
 */
function renderDetected(profile                          , data                              ) {
  currentProfile = profile;
  currentData = data || null;

  if (profileHandle) {
    profileHandle.textContent = `@${profile.username}`;
  }

  // Display Name
  if (profileDisplayName) {
    if (data?.displayName) {
      profileDisplayName.textContent = data.displayName;
      profileDisplayName.classList.remove("hidden");
    } else {
      profileDisplayName.textContent = profile.username;
    }
  }

  // Verified Badge
  if (profileVerifiedBadge) {
    if (data?.verified) {
      profileVerifiedBadge.classList.remove("hidden");
    } else {
      profileVerifiedBadge.classList.add("hidden");
    }
  }

  // Category
  if (profileCategory) {
    if (data?.accountCategory) {
      profileCategory.textContent = data.accountCategory;
      profileCategory.classList.remove("hidden");
    } else {
      profileCategory.classList.add("hidden");
    }
  }

  // Avatar
  if (data?.profileImageUrl && avatarImg) {
    avatarImg.src = data.profileImageUrl;
    avatarImg.classList.remove("hidden");
    avatarPlaceholder?.classList.add("hidden");
  } else {
    avatarImg?.classList.add("hidden");
    avatarPlaceholder?.classList.remove("hidden");
    if (avatarInitial) {
      avatarInitial.textContent = profile.username.charAt(0).toUpperCase();
    }
  }

  // Bio
  if (bioContainer && bioText) {
    if (data?.bio) {
      bioText.textContent = data.bio;
      bioContainer.classList.remove("hidden");
    } else {
      bioContainer.classList.add("hidden");
    }
  }

  // External Links
  if (linkContainer && profileExtLink) {
    if (data?.externalLinks && data.externalLinks.length > 0) {
      const firstLink = data.externalLinks[0];
      profileExtLink.href = firstLink.url;
      profileExtLink.textContent = firstLink.label || firstLink.url.replace(/^https?:\/\//, "");
      linkContainer.classList.remove("hidden");
    } else {
      linkContainer.classList.add("hidden");
    }
  }

  // Stats
  if (statsRow && statFollowers && statFollowing && statPosts) {
    if (data && (data.followerCount !== null || data.followingCount !== null || data.postCount !== null)) {
      statFollowers.textContent = formatCountDisplay(data.followerCount);
      statFollowing.textContent = formatCountDisplay(data.followingCount);
      statPosts.textContent = formatCountDisplay(data.postCount);
      statsRow.classList.remove("hidden");
    } else {
      statsRow.classList.add("hidden");
    }
  }

  // Highlights List
  if (highlightsContainer && highlightsList && highlightsCountBadge) {
    if (data?.highlights && data.highlights.length > 0) {
      highlightsCountBadge.textContent = `${data.highlights.length} / 20`;
      highlightsList.innerHTML = "";
      for (const hl of data.highlights) {
        const chip = document.createElement("div");
        chip.className = "highlight-chip";

        const title = document.createElement("span");
        title.textContent = hl.title;
        chip.appendChild(title);

        if (hl.stories && hl.stories.length > 0) {
          const storyCount = document.createElement("span");
          storyCount.className = "story-count";
          storyCount.textContent = `${hl.stories.length} / 10`;
          chip.appendChild(storyCount);
        }

        highlightsList.appendChild(chip);
      }
      highlightsContainer.classList.remove("hidden");
    } else {
      highlightsContainer.classList.add("hidden");
    }
  }

  // Posts Sample List
  if (postsContainer && postsList && postsCountBadge) {
    if (data?.posts && data.posts.length > 0) {
      postsCountBadge.textContent = String(data.posts.length);
      postsList.innerHTML = "";
      for (const post of data.posts) {
        const item = document.createElement("div");
        item.className = "post-item";

        const tag = document.createElement("span");
        tag.className = `post-media-tag ${post.mediaType === "REEL" ? "reel" : ""}`;
        tag.textContent = post.mediaType;

        const snippet = document.createElement("span");
        snippet.className = "post-caption-snippet";
        snippet.textContent = post.caption || post.url.replace("https://www.instagram.com", "");

        item.appendChild(tag);
        item.appendChild(snippet);
        postsList.appendChild(item);
      }
      postsContainer.classList.remove("hidden");
    } else {
      postsContainer.classList.add("hidden");
    }
  }

  // Status indicator
  if (statusText) {
    if (data?.collectionStatus === "COMPLETE") {
      statusText.textContent = "Profile metadata captured";
    } else {
      statusText.textContent = "Ready to investigate";
    }
  }

  stateIdle?.classList.remove("visible");
  stateIdle?.classList.add("hidden");
  stateDetected?.classList.remove("hidden");
  stateDetected?.classList.add("visible");
  stateResults?.classList.remove("visible");
  stateResults?.classList.add("hidden");
  investigatingLoader?.classList.add("hidden");
}

/**
 * Renders the Investigation Results view with publication-grade PDF actions.
 */
function renderResults(result     ) {
  currentInvestigationResult = result;

  stateIdle?.classList.remove("visible");
  stateIdle?.classList.add("hidden");
  stateDetected?.classList.remove("visible");
  stateDetected?.classList.add("hidden");
  stateResults?.classList.remove("hidden");
  stateResults?.classList.add("visible");

  // Scores
  if (resTrustScore) resTrustScore.textContent = String(result.score?.trustScore ?? 80);
  if (resRiskBadge) {
    const risk = (result.score?.riskLevel || "LOW").toUpperCase();
    resRiskBadge.textContent = `${risk} RISK`;
    resRiskBadge.className = `risk-badge ${risk.toLowerCase()}`;
  }
  if (resConfidence) resConfidence.textContent = `${result.score?.confidence ?? 95}%`;
  if (resCoverage) resCoverage.textContent = `${result.score?.evidenceCoverage ?? 88}%`;

  // PDF Actions
  const pdfRelativeUrl = result.reportPdfUrl || `/api/reports/verification-${result.profile?.username || "profile"}.pdf`;
  const fullPdfUrl = pdfRelativeUrl.startsWith("http") ? pdfRelativeUrl : `${DEFAULT_API_BASE_URL}${pdfRelativeUrl}`;

  if (btnOpenPdf) {
    btnOpenPdf.onclick = () => {
      chrome.tabs.create({ url: fullPdfUrl }).catch(() => {
        window.open(fullPdfUrl, "_blank");
      });
    };
  }

  if (linkDownloadPdf) {
    linkDownloadPdf.href = fullPdfUrl;
    linkDownloadPdf.download = `verification-${result.profile?.username || "profile"}.pdf`;
  }

  if (pdfPathText) {
    pdfPathText.textContent = result.reportPdfPath || `reports/verification-${result.profile?.username || "profile"}.pdf`;
  }

  // Dimensions Breakdown
  if (dimensionsList) {
    dimensionsList.innerHTML = "";
    const dimMap = result.score?.dimensions || {};
    const dimMaxScores                         = {
      identityConsistency: 20,
      profileCompleteness: 10,
      bioEvidence: 15,
      externalIdentity: 15,
      contentConsistency: 15,
      highlights: 10,
      advertising: 10,
      behaviouralSignals: 5,
    };

    const dimLabels                         = {
      identityConsistency: "Identity Consistency",
      profileCompleteness: "Profile Completeness",
      bioEvidence: "Bio Evidence",
      externalIdentity: "External Identity",
      contentConsistency: "Content Consistency",
      highlights: "Highlights",
      advertising: "Advertising Signals",
      behaviouralSignals: "Behavioural Signals",
    };

    for (const [key, label] of Object.entries(dimLabels)) {
      const score = dimMap[key];
      const max = dimMaxScores[key] || 10;
      const isNeutral = score === null || score === undefined;
      const earned = isNeutral ? 0 : score;
      const pct = isNeutral ? 0 : Math.round((earned / max) * 100);

      const row = document.createElement("div");
      row.className = "dim-row";
      row.innerHTML = `
        <span class="dim-label" title="${label}">${label}</span>
        <div class="dim-bar">
          <div class="dim-fill" style="width: ${pct}%;"></div>
        </div>
        <span class="dim-score">${isNeutral ? "Neutral" : `${earned}/${max}`}</span>
      `;
      dimensionsList.appendChild(row);
    }
  }

  // Evidence Ledger
  if (evidenceList) {
    evidenceList.innerHTML = "";
    const evidenceItems        = result.evidence || [];
    if (evidenceItems.length === 0) {
      evidenceList.innerHTML = `<div style="color: var(--text-secondary); font-size: 11px;">No evidence captured</div>`;
    } else {
      for (const ev of evidenceItems.slice(0, 10)) {
        const item = document.createElement("div");
        item.className = `evidence-item ${ev.riskImpact > 0 ? "risk" : ""}`;
        item.innerHTML = `
          <div class="evidence-meta">
            <strong>[${ev.id || ev.evidenceId}] ${ev.source}</strong>
            <span>${ev.confidence}% conf</span>
          </div>
          <div class="evidence-claim">${ev.claim || ev.observedText}</div>
        `;
        evidenceList.appendChild(item);
      }
    }
  }
}

/**
 * Executes profile investigation and PDF generation.
 */
async function startVerification() {
  if (!currentProfile) return;

  investigatingLoader?.classList.remove("hidden");
  btnVerify?.setAttribute("disabled", "true");

  const payload                       = currentData || {
    username: currentProfile.username,
    profileUrl: currentProfile.profileUrl,
    displayName: currentProfile.username,
    bio: null,
    profileImageUrl: null,
    followerCount: null,
    followingCount: null,
    postCount: null,
    verified: null,
    accountCategory: null,
    externalLinks: [],
    highlights: [],
    posts: [],
    collectedAt: new Date().toISOString(),
    collectionStatus: "COMPLETE",
    unavailableFields: [],
  };

  try {
    const result = await requestProfileInvestigation(payload);
    renderResults(result);
  } catch (err     ) {
    console.error("[Veriqoo Sidepanel] Investigation error:", err);
    alert(`Investigation failed: ${err.message}\nMake sure 'npm run start:api' is running.`);
  } finally {
    investigatingLoader?.classList.add("hidden");
    btnVerify?.removeAttribute("disabled");
  }
}

/**
 * Hydrates side panel state by checking the currently active tab.
 */
async function hydrateState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !tab.url.includes("instagram.com")) {
      renderIdle("not_instagram");
      return;
    }

    const detected = detectInstagramProfileFromUrl(tab.url);
    if (!detected) {
      renderIdle("instagram_feed");
      return;
    }

    // Tab is on Instagram profile: check storage for existing captured data or investigation
    const stored = await chrome.storage.local.get("veriqooState");
    const state                             = stored?.veriqooState;

    if (state?.status === "COMPLETE" && state.investigationResult && state.profile?.username === detected.username) {
      renderResults(state.investigationResult);
    } else if (state?.profile && state.profile.username === detected.username) {
      renderDetected(state.profile, state.data);
    } else {
      renderDetected(detected, null);
    }
  } catch (err) {
    console.debug("[Veriqoo Sidepanel] Storage hydration skipped:", err);
    renderIdle("general");
  }
}

// Listen for messages from content script and service worker
chrome.runtime.onMessage.addListener((message                  ) => {
  if (message.type === "PROFILE_DETECTED") {
    renderDetected(message.payload.profile, message.payload.data);
  } else if (message.type === "PROFILE_DATA_UPDATED") {
    if (currentProfile && currentProfile.username === message.payload.username) {
      renderDetected(currentProfile, message.payload.data);
    }
  } else if (message.type === "HIGHLIGHTS_UPDATED") {
    if (currentProfile && currentProfile.username === message.payload.username && currentData) {
      currentData.highlights = message.payload.highlights;
      renderDetected(currentProfile, currentData);
    }
  } else if (message.type === "INVESTIGATION_COMPLETE") {
    renderResults(message.payload.result);
  } else if (message.type === "STATE_UPDATED") {
    if (message.payload.status === "COMPLETE" && message.payload.investigationResult) {
      renderResults(message.payload.investigationResult);
    } else if (message.payload.profile) {
      renderDetected(message.payload.profile, message.payload.data);
    } else {
      renderIdle("not_instagram");
    }
  }
});

// Event listeners
btnVerify?.addEventListener("click", startVerification);
btnReinvestigate?.addEventListener("click", () => {
  if (currentProfile) {
    renderDetected(currentProfile, currentData);
  } else {
    hydrateState();
  }
});

// Initialize on load
hydrateState();
