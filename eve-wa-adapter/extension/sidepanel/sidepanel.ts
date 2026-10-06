import type {
  ExtensionMessage,
  ExtensionState,
  DetectedInstagramProfile,
  InstagramProfileData,
} from "../shared/types.ts";

// DOM Elements
const stateIdle = document.getElementById("state-idle");
const stateDetected = document.getElementById("state-detected");

const profileHandle = document.getElementById("profile-handle");
const profileDisplayName = document.getElementById("profile-display-name");
const profileVerifiedBadge = document.getElementById("profile-verified-badge");
const profileCategory = document.getElementById("profile-category");
const avatarInitial = document.getElementById("avatar-initial");
const avatarImg = document.getElementById("avatar-img") as HTMLImageElement | null;
const avatarPlaceholder = document.getElementById("avatar-placeholder");

const bioContainer = document.getElementById("bio-container");
const bioText = document.getElementById("bio-text");

const linkContainer = document.getElementById("link-container");
const profileExtLink = document.getElementById("profile-ext-link") as HTMLAnchorElement | null;

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
const phaseNotice = document.getElementById("phase-notice");

let currentProfile: DetectedInstagramProfile | null = null;
let currentData: InstagramProfileData | null = null;

function formatCountDisplay(val: number | null | undefined): string {
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
 * Renders the Idle state (No profile detected).
 */
function renderIdle() {
  currentProfile = null;
  currentData = null;
  stateIdle?.classList.remove("hidden");
  stateIdle?.classList.add("visible");
  stateDetected?.classList.remove("visible");
  stateDetected?.classList.add("hidden");
  phaseNotice?.classList.add("hidden");
}

/**
 * Renders the Detected Profile state with genuine username and extracted metadata.
 */
function renderDetected(profile: DetectedInstagramProfile, data?: InstagramProfileData | null) {
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
  phaseNotice?.classList.add("hidden");
}

/**
 * Hydrates side panel state from local storage or service worker.
 */
async function hydrateState() {
  try {
    const data = await chrome.storage.local.get("veriqooState");
    const state: ExtensionState | undefined = data?.veriqooState;
    if (state?.status === "PROFILE_DETECTED" && state.profile) {
      renderDetected(state.profile, state.data);
    } else {
      renderIdle();
    }
  } catch (err) {
    console.debug("[Veriqoo Sidepanel] Storage hydration skipped:", err);
    renderIdle();
  }
}

// Listen for messages from content script and service worker
chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
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
  } else if (message.type === "STATE_UPDATED") {
    if (message.payload.profile) {
      renderDetected(message.payload.profile, message.payload.data);
    } else {
      renderIdle();
    }
  }
});

// Action button click handler
btnVerify?.addEventListener("click", () => {
  if (currentProfile) {
    console.info(`[Veriqoo Sidepanel] User requested verification for @${currentProfile.username}`);
    // Notify background worker
    try {
      chrome.runtime.sendMessage({
        type: "START_INVESTIGATION",
        payload: {
          username: currentProfile.username,
          profileUrl: currentProfile.profileUrl,
          profileData: currentData,
        },
      });
    } catch {
      // Ignore background communication disconnect
    }

    // Display Phase 3.5 connection notice
    phaseNotice?.classList.remove("hidden");
  }
});

// Initialize on load
hydrateState();

