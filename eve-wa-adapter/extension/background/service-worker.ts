import type {
  ExtensionMessage,
  ExtensionState,
  DetectedInstagramProfile,
} from "../shared/types.ts";
import { detectInstagramProfileFromUrl } from "../shared/profileDetector.ts";

let currentState: ExtensionState = {
  status: "IDLE",
  profile: null,
  data: null,
  error: null,
};

/**
 * Configure Side Panel to automatically open when the user clicks the extension action icon.
 */
function setupSidePanel() {
  if (chrome?.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn("[Veriqoo Service Worker] Failed to set side panel behavior:", err);
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.info("[Veriqoo Service Worker] Veriqoo Extension installed successfully.");
  setupSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  console.info("[Veriqoo Service Worker] Veriqoo Extension initialized on browser startup.");
  setupSidePanel();
});

/**
 * Update internal state and sync to local storage for side panel hydration.
 */
async function updateState(newState: Partial<ExtensionState>) {
  currentState = { ...currentState, ...newState };
  try {
    await chrome.storage.local.set({ veriqooState: currentState });
  } catch (err) {
    console.warn("[Veriqoo Service Worker] Failed to persist state:", err);
  }
}

/**
 * Message listener for extension communication between Content Script, Service Worker, and Side Panel.
 */
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => {
    if (!message || typeof message !== "object") return;

    switch (message.type) {
      case "PROFILE_DETECTED": {
        const detectedProfile: DetectedInstagramProfile = message.payload.profile;
        const profileData = message.payload.data || null;
        console.info(`[Veriqoo Service Worker] Profile detected: @${detectedProfile.username} (${detectedProfile.profileUrl})`);
        updateState({
          status: "PROFILE_DETECTED",
          profile: detectedProfile,
          data: profileData,
          error: null,
        });
        sendResponse({ success: true });
        break;
      }

      case "PROFILE_DATA_UPDATED": {
        console.info(`[Veriqoo Service Worker] Profile metadata refreshed for @${message.payload.username}`);
        updateState({
          data: message.payload.data,
        });
        sendResponse({ success: true });
        break;
      }

      case "HIGHLIGHTS_UPDATED": {
        console.info(`[Veriqoo Service Worker] Highlights updated for @${message.payload.username} (${message.payload.collectedCount} items)`);
        if (currentState.data && currentState.profile?.username === message.payload.username) {
          updateState({
            data: {
              ...currentState.data,
              highlights: message.payload.highlights,
            },
          });
        }
        sendResponse({ success: true });
        break;
      }

      case "GET_CURRENT_STATE": {
        sendResponse({ state: currentState });
        break;
      }

      case "START_INVESTIGATION": {
        console.info(`[Veriqoo Service Worker] Received START_INVESTIGATION for @${message.payload.username}`);
        // For Phase 3.2, acknowledgment. Full pipeline connects in Phase 3.5.
        updateState({
          status: "INVESTIGATING",
          error: null,
        });
        sendResponse({ success: true, message: "Investigation queued (Pipeline connection in Phase 3.5)" });
        break;
      }

      default:
        break;
    }

    return true; // Keep message channel open for async response
  },
);

/**
 * Listen for active tab URL changes to update profile detection state dynamically.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    const profile = detectInstagramProfileFromUrl(tab.url);
    if (profile) {
      updateState({
        status: "PROFILE_DETECTED",
        profile,
        error: null,
      });
    } else if (tab.url.includes("instagram.com")) {
      // User navigated to a non-profile Instagram page (e.g. /explore/)
      updateState({
        status: "IDLE",
        profile: null,
        error: null,
      });
    }
  }
});
