import type {
  InstagramHighlightSample,
  InstagramHighlightStory,
} from "./types.ts";

export const DEFAULT_HIGHLIGHT_LIMIT = 20;
export const DEFAULT_STORY_SAMPLE_LIMIT = 10;

/**
 * Extracts story items from the active story dialog/viewer if open in the DOM.
 */
export function extractActiveStoriesFromDocument(
  doc: Document,
  storyLimit: number = DEFAULT_STORY_SAMPLE_LIMIT,
): InstagramHighlightStory[] {
  if (!doc) return [];

  const stories: InstagramHighlightStory[] = [];
  const seenStoryIds = new Set<string>();

  // Look for open story viewer container / dialog
  const storyContainer = doc.querySelector("section[role='dialog'], div[role='dialog'], section[class*='story'], div[class*='story_viewer']");
  if (!storyContainer) {
    return [];
  }

  // Find media elements (image or video)
  const mediaElements = storyContainer.querySelectorAll("img[decoding='sync'], img[srcset], video, img");

  for (const media of Array.from(mediaElements)) {
    if (stories.length >= storyLimit) break;

    const tagName = media.tagName.toLowerCase();
    const mediaType: "IMAGE" | "VIDEO" | "UNKNOWN" =
      tagName === "video" ? "VIDEO" : tagName === "img" ? "IMAGE" : "UNKNOWN";

    const mediaUrl = media.getAttribute("src") || null;
    const storyId = `story_${stories.length + 1}_${(mediaUrl || "").slice(-12).replace(/\W/g, "")}`;

    if (seenStoryIds.has(storyId)) continue;
    seenStoryIds.add(storyId);

    // Visible text in story overlay
    let visibleText: string | null = null;
    const textElements = storyContainer.querySelectorAll("h1, h2, span[dir='auto'], p");
    for (const el of Array.from(textElements)) {
      const txt = el.textContent?.trim();
      if (txt && txt.length > 0 && !txt.startsWith("@") && !txt.includes("Following") && !txt.includes("View profile")) {
        visibleText = txt;
        break;
      }
    }

    // Timestamp
    let timestamp: string | null = null;
    const timeElem = storyContainer.querySelector("time");
    if (timeElem) {
      const dt = timeElem.getAttribute("datetime") || timeElem.getAttribute("title");
      if (dt) {
        const parsed = new Date(dt);
        if (!isNaN(parsed.getTime())) {
          timestamp = parsed.toISOString();
        }
      }
    }

    const unavailableFields: string[] = [];
    if (!mediaUrl) unavailableFields.push("mediaUrl");
    if (!visibleText) unavailableFields.push("visibleText");
    if (!timestamp) unavailableFields.push("timestamp");

    stories.push({
      id: storyId,
      position: stories.length,
      url: null,
      mediaType,
      visibleText,
      timestamp,
      mediaUrl,
      source: "DOM",
      collectionStatus: unavailableFields.length === 0 ? "COMPLETE" : "PARTIAL",
      unavailableFields,
    });
  }

  return stories;
}

/**
 * Extracts public highlight metadata from the profile page DOM.
 */
export function extractHighlightsFromDocument(
  doc: Document,
  highlightLimit: number = DEFAULT_HIGHLIGHT_LIMIT,
): InstagramHighlightSample[] {
  if (!doc) return [];

  const highlights: InstagramHighlightSample[] = [];
  const seenTitles = new Set<string>();

  // Look for highlight tray elements
  const highlightItems = doc.querySelectorAll(
    "main div[role='menu'] li, main ul[class*='highlight'] li, div[class*='highlight'] div[role='button'], div[role='tablist'] div[role='button'], li[class*='_acaz'], div[class*='_acaz']"
  );

  const fallbackItems = highlightItems.length > 0
    ? highlightItems
    : doc.querySelectorAll("div[role='menu'] li, ul[class*='highlight'] li, div[class*='highlight']");

  for (const item of Array.from(fallbackItems)) {
    if (highlights.length >= highlightLimit) break;

    // Extract title
    const titleElement = item.querySelector ? item.querySelector("span, div[dir='auto'], span[dir='auto']") : null;
    const title = (titleElement ? titleElement.textContent : item.textContent)?.trim();

    if (!title || title.length === 0 || title.length > 50 || seenTitles.has(title.toLowerCase())) {
      continue;
    }
    seenTitles.add(title.toLowerCase());

    // Extract URL if wrapped in anchor or href attribute
    let url: string | null = null;
    const anchor = (item.closest ? item.closest("a") : null) || (item.querySelector ? item.querySelector("a") : null);
    if (anchor && typeof anchor.getAttribute === "function") {
      const href = anchor.getAttribute("href");
      if (href && href.includes("/stories/highlights/")) {
        url = href.startsWith("http") ? href : `https://www.instagram.com${href}`;
      }
    }

    // Extract cover image
    let coverImageUrl: string | null = null;
    const img = item.querySelector ? item.querySelector("img") : null;
    if (img && typeof img.getAttribute === "function") {
      coverImageUrl = img.getAttribute("src") || null;
    }

    // Check if stories are active/open for this highlight
    const stories = extractActiveStoriesFromDocument(doc);

    const unavailableFields: string[] = [];
    if (!url) unavailableFields.push("url");
    if (!coverImageUrl) unavailableFields.push("coverImageUrl");
    if (stories.length === 0) unavailableFields.push("stories");

    const id = url
      ? url.replace(/.*\/stories\/highlights\/([^/]+).*/, "$1")
      : `hl_${highlights.length}_${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

    highlights.push({
      id,
      title,
      position: highlights.length,
      url,
      coverImageUrl,
      stories,
      collectionStatus: stories.length > 0 ? "COMPLETE" : "PARTIAL",
      unavailableFields,
      collectedAt: new Date().toISOString(),
    });
  }

  return highlights;
}
