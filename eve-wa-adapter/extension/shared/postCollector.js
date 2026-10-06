                                                      
import { parseCount } from "./domExtractor.js";

export const DEFAULT_POST_SAMPLE_LIMIT = 12;

/**
 * Extracts hashtags from a caption or text string, returning an array of lowercase tag names without '#'.
 */
export function extractHashtags(text                           )           {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(/#([\w\u0080-\uffff]+)/g);
  if (!matches) return [];
  
  const tags = new Set        ();
  for (const m of matches) {
    const clean = m.slice(1).replace(/[.,!?;:]+$/, "").trim();
    if (clean) {
      tags.add(clean);
    }
  }
  return Array.from(tags);
}

/**
 * Extracts account mentions from a caption or text string, returning an array of usernames without '@'.
 */
export function extractMentions(text                           )           {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(/@([a-zA-Z0-9._]+)/g);
  if (!matches) return [];

  const mentions = new Set        ();
  for (const m of matches) {
    const clean = m.slice(1).replace(/[.,!?;:]+$/, "").trim();
    if (clean && clean.length <= 30 && !clean.startsWith(".") && !clean.endsWith(".")) {
      mentions.add(clean);
    }
  }
  return Array.from(mentions);
}

/**
 * Parses a post/reel URL to extract the canonical shortcode and media type.
 */
export function extractPostShortcodeAndType(url                           )   
                           
                                         
                              
  {
  if (!url || typeof url !== "string") {
    return { shortcode: null, mediaType: "UNKNOWN", canonicalUrl: null };
  }

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://www.instagram.com${url.startsWith("/") ? "" : "/"}${url}`);
    const pathname = parsed.pathname;

    const postMatch = pathname.match(/\/p\/([a-zA-Z0-9_-]+)/);
    if (postMatch) {
      const shortcode = postMatch[1];
      return {
        shortcode,
        mediaType: "POST",
        canonicalUrl: `https://www.instagram.com/p/${shortcode}/`,
      };
    }

    const reelMatch = pathname.match(/\/(?:reel|reels)\/([a-zA-Z0-9_-]+)/);
    if (reelMatch) {
      const shortcode = reelMatch[1];
      return {
        shortcode,
        mediaType: "REEL",
        canonicalUrl: `https://www.instagram.com/reel/${shortcode}/`,
      };
    }

    return { shortcode: null, mediaType: "UNKNOWN", canonicalUrl: null };
  } catch {
    return { shortcode: null, mediaType: "UNKNOWN", canonicalUrl: null };
  }
}

/**
 * Collects a bounded sample of publicly visible posts/reels from an Instagram profile page Document.
 */
export function extractPostSamplesFromDocument(
  doc          ,
  sampleLimit         = DEFAULT_POST_SAMPLE_LIMIT,
)                        {
  if (!doc) return [];

  const postSamples                        = [];
  const seenUrls = new Set        ();

  // Select all links matching post (/p/) or reel (/reel/) paths
  const links = doc.querySelectorAll("article a[href*='/p/'], article a[href*='/reel/'], main a[href*='/p/'], main a[href*='/reel/'], a[href*='/p/'], a[href*='/reel/']");

  for (const anchor of Array.from(links)) {
    if (postSamples.length >= sampleLimit) {
      break;
    }

    const rawHref = anchor.getAttribute("href");
    const { shortcode, mediaType, canonicalUrl } = extractPostShortcodeAndType(rawHref);

    if (!canonicalUrl || !shortcode || seenUrls.has(canonicalUrl)) {
      continue;
    }
    seenUrls.add(canonicalUrl);

    // Caption & visible text extraction
    let caption                = null;
    let mediaUrl                = null;

    // Check <img> element inside anchor
    const img = anchor.querySelector("img");
    if (img) {
      mediaUrl = img.getAttribute("src") || null;
      const alt = img.getAttribute("alt")?.trim();
      if (alt) {
        // Instagram often formats alt text like "Photo by @user on Date. May be an image of..."
        // Or directly caption text
        caption = alt;
      }
    }

    // Check visible text or aria-label
    let visibleText                = caption || anchor.textContent?.trim() || null;
    if (visibleText === "") visibleText = null;

    // Engagement count extraction (Likes, Comments from overlay / aria / spans)
    let likeCount                = null;
    let commentCount                = null;

    const overlayItems = anchor.querySelectorAll("ul > li, span");
    for (const item of Array.from(overlayItems)) {
      const text = item.textContent || "";
      const aria = item.getAttribute("aria-label") || "";
      const combined = `${text} ${aria}`.toLowerCase();

      if (combined.includes("like")) {
        likeCount = parseCount(text.replace(/likes?/i, "").trim());
      } else if (combined.includes("comment")) {
        commentCount = parseCount(text.replace(/comments?/i, "").trim());
      }
    }

    // Timestamp extraction
    let timestamp                = null;
    const timeElem = anchor.querySelector("time");
    if (timeElem) {
      const datetime = timeElem.getAttribute("datetime") || timeElem.getAttribute("title");
      if (datetime) {
        const parsedDate = new Date(datetime);
        if (!isNaN(parsedDate.getTime())) {
          timestamp = parsedDate.toISOString();
        }
      }
    }

    // Extract hashtags and mentions
    const hashtags = extractHashtags(caption);
    const mentions = extractMentions(caption);

    // Unavailable fields tracking
    const unavailableFields           = [];
    if (!caption) unavailableFields.push("caption");
    if (!timestamp) unavailableFields.push("timestamp");
    if (likeCount === null) unavailableFields.push("likeCount");
    if (commentCount === null) unavailableFields.push("commentCount");
    if (!mediaUrl) unavailableFields.push("mediaUrl");

    const collectionStatus                                         =
      unavailableFields.length === 0 ? "COMPLETE" : "PARTIAL";

    postSamples.push({
      id: shortcode,
      url: canonicalUrl,
      mediaType,
      caption,
      timestamp,
      likeCount,
      commentCount,
      hashtags,
      mentions,
      visibleText,
      mediaUrl,
      position: postSamples.length,
      source: "DOM",
      collectedAt: new Date().toISOString(),
      collectionStatus,
      unavailableFields,
    });
  }

  return postSamples;
}
