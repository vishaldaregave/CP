import { detectInstagramProfileFromUrl } from "../shared/profileDetector.ts";
import { extractProfileFromDocument } from "../shared/domExtractor.ts";
import type { DetectedInstagramProfile, InstagramProfileData } from "../shared/types.ts";

let lastDetectedUsername: string | null = null;
let hydrationTimer: any = null;
let badgeDismissedForProfile: string | null = null;

const FLOATING_BADGE_ID = "veriqoo-inpage-badge";

/**
 * Removes the in-page floating widget if present.
 */
function removeInPageBadge() {
  const existing = document.getElementById(FLOATING_BADGE_ID);
  if (existing) {
    existing.remove();
  }
}

/**
 * Renders or updates a sleek floating badge on Instagram profile pages.
 * Only appears on genuine public profile pages and can be easily dismissed.
 */
function renderInPageBadge(username: string, isVerified: boolean = false) {
  if (badgeDismissedForProfile === username) {
    return;
  }

  let badge = document.getElementById(FLOATING_BADGE_ID);
  if (!badge) {
    badge = document.createElement("div");
    badge.id = FLOATING_BADGE_ID;
    badge.style.position = "fixed";
    badge.style.bottom = "20px";
    badge.style.right = "20px";
    badge.style.zIndex = "999999";
    badge.style.display = "flex";
    badge.style.alignItems = "center";
    badge.style.gap = "8px";
    badge.style.padding = "8px 14px";
    badge.style.background = "#0c0c1f";
    badge.style.color = "#ffffff";
    badge.style.borderRadius = "9999px";
    badge.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15)";
    badge.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    badge.style.fontSize = "12px";
    badge.style.fontWeight = "600";
    badge.style.cursor = "pointer";
    badge.style.transition = "all 0.2s ease";
    badge.style.userSelect = "none";

    badge.addEventListener("mouseenter", () => {
      badge!.style.transform = "translateY(-2px) scale(1.02)";
      badge!.style.boxShadow = "0 12px 28px rgba(0, 0, 0, 0.5), 0 0 0 1.5px #38bdf8";
    });

    badge.addEventListener("mouseleave", () => {
      badge!.style.transform = "translateY(0) scale(1)";
      badge!.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15)";
    });

    document.body.appendChild(badge);
  }

  badge.innerHTML = `
    <span style="font-size: 14px;">🛡️</span>
    <span style="color: #38bdf8; font-weight: 700;">Veriqoo</span>
    <span style="color: #94a3b8;">&middot;</span>
    <span style="color: #ffffff;">@${username}</span>
    ${isVerified ? '<span style="color: #38bdf8;">✓</span>' : ""}
    <span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 2px 7px; border-radius: 9999px; font-size: 10px; margin-left: 2px;">PDF REPORT</span>
    <span id="veriqoo-close-btn" style="color: #94a3b8; margin-left: 6px; font-size: 13px; padding: 2px 4px;" title="Dismiss">&times;</span>
  `;

  // Close button handler
  const closeBtn = badge.querySelector("#veriqoo-close-btn");
  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    badgeDismissedForProfile = username;
    removeInPageBadge();
  });

  // Badge click opens side panel
  badge.onclick = (e) => {
    if ((e.target as HTMLElement)?.id === "veriqoo-close-btn") return;
    try {
      chrome.runtime.sendMessage({
        type: "OPEN_SIDE_PANEL",
      });
    } catch {
      // Ignore background communication disconnect
    }
  };
}

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

    // Collect genuine DOM snapshot
    const profileData: InstagramProfileData = extractProfileFromDocument(document, currentUrl);

    // Render in-page badge only for this profile
    renderInPageBadge(profile.username, Boolean(profileData.verified));

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
    // Current page is NOT an Instagram profile (e.g. /explore, /reels, /direct, /)
    removeInPageBadge();

    if (lastDetectedUsername !== null) {
      console.info("[Veriqoo Extension] Navigated away from profile page, resetting profile state");
      try {
        chrome.runtime.sendMessage({
          type: "STATE_UPDATED",
          payload: {
            status: "IDLE",
            profile: null,
            data: null,
            investigationResult: null,
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
