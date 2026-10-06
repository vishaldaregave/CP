import { detectInstagramProfileFromUrl } from "../shared/profileDetector.ts";
import { extractProfileFromDocument } from "../shared/domExtractor.ts";
import type { DetectedInstagramProfile, InstagramProfileData } from "../shared/types.ts";

let lastDetectedUsername: string | null = null;
let hydrationTimer: any = null;

/**
 * Checks current page URL, collects public profile metadata safely from the DOM,
 * and notifies the service worker.
 */
function checkCurrentPage() {
  const currentUrl = window.location.href;
  const profile: DetectedInstagramProfile | null = detectInstagramProfileFromUrl(currentUrl);

  if (profile) {
    const isNewProfile = profile.username !== lastDetectedUsername;
    lastDetectedUsername = profile.username;

    // Collect initial DOM snapshot
    const profileData: InstagramProfileData = extractProfileFromDocument(document, currentUrl);

    try {
      chrome.runtime.sendMessage({
        type: isNewProfile ? "PROFILE_DETECTED" : "PROFILE_DATA_UPDATED",
        payload: isNewProfile
          ? { profile, data: profileData }
          : { username: profile.username, data: profileData },
      });
    } catch (err) {
      console.debug("[Veriqoo Extension] Message send deferred:", err);
    }

    // If initial collection was PARTIAL, schedule a delayed pass for asynchronous DOM hydration
    if (profileData.collectionStatus === "PARTIAL") {
      clearTimeout(hydrationTimer);
      hydrationTimer = setTimeout(() => {
        if (window.location.href.includes(profile.username)) {
          const hydratedData = extractProfileFromDocument(document, window.location.href);
          try {
            chrome.runtime.sendMessage({
              type: "PROFILE_DATA_UPDATED",
              payload: { username: profile.username, data: hydratedData },
            });
          } catch {
            // Background worker may be idle
          }
        }
      }, 700);
    }
  } else {
    if (lastDetectedUsername !== null) {
      console.info("[Veriqoo Extension] Left profile page, resetting profile state");
      try {
        chrome.runtime.sendMessage({
          type: "STATE_UPDATED",
          payload: {
            status: "IDLE",
            profile: null,
            data: null,
            error: null,
          },
        });
      } catch {
        // Ignore disconnect
      }
    }
    lastDetectedUsername = null;
    clearTimeout(hydrationTimer);
  }
}

// Initial check on document load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkCurrentPage);
} else {
  checkCurrentPage();
}

// Observe client-side SPA navigation on Instagram
let lastHref = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    checkCurrentPage();
  }
});

observer.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true,
});

window.addEventListener("popstate", checkCurrentPage);

