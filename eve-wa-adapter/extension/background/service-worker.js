             
                   
                 
                           
                            
import { detectInstagramProfileFromUrl } from "../shared/profileDetector.js";
import { requestProfileInvestigation } from "../shared/apiClient.js";

let currentState                 = {
  status: "IDLE",
  profile: null,
  data: null,
  investigationResult: null,
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
async function updateState(newState                         ) {
  currentState = { ...currentState, ...newState };
  try {
    await chrome.storage.local.set({ veriqooState: currentState });
    // Broadcast state update to any open side panels or extension views
    chrome.runtime.sendMessage({
      type: "STATE_UPDATED",
      payload: currentState,
    }).catch(() => {
      // Ignore when no listener is active
    });
  } catch (err) {
    console.warn("[Veriqoo Service Worker] Failed to persist state:", err);
  }
}

/**
 * Updates browser action badge reflecting Instagram detection status.
 */
function updateTabBadge(tabId        , isProfile         , username         ) {
  if (!chrome.action) return;

  if (isProfile && username) {
    chrome.action.setBadgeText({ text: "ON", tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: "#2563eb", tabId }).catch(() => {});
    chrome.action.setTitle({ title: `Veriqoo: Click to investigate @${username}`, tabId }).catch(() => {});
  } else {
    chrome.action.setBadgeText({ text: "", tabId }).catch(() => {});
    chrome.action.setTitle({ title: "Veriqoo: Navigate to an Instagram profile to investigate", tabId }).catch(() => {});
  }
}

/**
 * Message listener for extension communication between Content Script, Service Worker, and Side Panel.
 */
chrome.runtime.onMessage.addListener(
  (
    message                  ,
    sender                              ,
    sendResponse                          ,
  ) => {
    if (!message || typeof message !== "object") return;

    switch (message.type) {
      case "PROFILE_DETECTED": {
        const detectedProfile                           = message.payload.profile;
        const profileData = message.payload.data || null;
        console.info(`[Veriqoo Service Worker] Profile detected: @${detectedProfile.username} (${detectedProfile.profileUrl})`);
        
        if (sender.tab?.id) {
          updateTabBadge(sender.tab.id, true, detectedProfile.username);
        }

        updateState({
          status: "PROFILE_DETECTED",
          profile: detectedProfile,
          data: profileData,
          investigationResult: null,
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

      case "OPEN_SIDE_PANEL": {
        if (sender.tab?.id && chrome.sidePanel?.open) {
          chrome.sidePanel.open({ tabId: sender.tab.id }).catch((err) => {
            console.warn("[Veriqoo Service Worker] Could not open side panel:", err);
          });
        }
        sendResponse({ success: true });
        break;
      }

      case "START_INVESTIGATION": {
        const { username, profileData } = message.payload;
        console.info(`[Veriqoo Service Worker] Executing investigation for @${username}`);

        updateState({
          status: "INVESTIGATING",
          error: null,
        });

        // Execute genuine backend investigation pipeline & PDF generation
        const payloadToSend = profileData || currentState.data || {
          username,
          profileUrl: `https://www.instagram.com/${username}/`,
          displayName: username,
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

        requestProfileInvestigation(payloadToSend)
          .then((result) => {
            console.info(`[Veriqoo Service Worker] Investigation finished for @${username}: Trust Score ${result.score.trustScore}/100`);
            updateState({
              status: "COMPLETE",
              investigationResult: result,
              error: null,
            });

            chrome.runtime.sendMessage({
              type: "INVESTIGATION_COMPLETE",
              payload: {
                username,
                result,
              },
            }).catch(() => {});

            sendResponse({ success: true, result });
          })
          .catch((err) => {
            console.error(`[Veriqoo Service Worker] Investigation error:`, err);
            updateState({
              status: "ERROR",
              error: err.message,
            });

            chrome.runtime.sendMessage({
              type: "INVESTIGATION_ERROR",
              payload: {
                username,
                error: err.message,
              },
            }).catch(() => {});

            sendResponse({ success: false, error: err.message });
          });

        return true; // Keep async response channel open
      }

      default:
        break;
    }

    return true;
  },
);

/**
 * Handle active tab switching: analyze if the active tab is Instagram and update state.
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab?.url) {
      updateTabBadge(activeInfo.tabId, false);
      return;
    }

    const profile = detectInstagramProfileFromUrl(tab.url);
    if (profile) {
      updateTabBadge(activeInfo.tabId, true, profile.username);
      if (!currentState.profile || currentState.profile.username !== profile.username) {
        updateState({
          status: "PROFILE_DETECTED",
          profile,
          error: null,
        });
      }
    } else {
      updateTabBadge(activeInfo.tabId, false);
      if (currentState.status !== "IDLE") {
        updateState({
          status: "IDLE",
          profile: null,
          data: null,
          investigationResult: null,
          error: null,
        });
      }
    }
  } catch (err) {
    // Tab might have closed
  }
});

/**
 * Listen for active tab URL changes to update profile detection state dynamically.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    const profile = detectInstagramProfileFromUrl(tab.url);
    if (profile) {
      updateTabBadge(tabId, true, profile.username);
      updateState({
        status: "PROFILE_DETECTED",
        profile,
        error: null,
      });
    } else {
      updateTabBadge(tabId, false);
      if (tab.url.includes("instagram.com")) {
        // User navigated to a non-profile Instagram page (e.g. /explore/)
        updateState({
          status: "IDLE",
          profile: null,
          data: null,
          investigationResult: null,
          error: null,
        });
      }
    }
  }
});
