
// Inlined profile detector utility


/**
 * List of reserved Instagram top-level path segments that do not represent user profiles.
 */
const RESERVED_INSTAGRAM_ROUTES = new Set([
  "explore",
  "reels",
  "reel",
  "p",
  "tv",
  "stories",
  "direct",
  "accounts",
  "developer",
  "about",
  "legal",
  "terms",
  "privacy",
  "api",
  "graphql",
  "oauth",
  "support",
  "settings",
  "emails",
  "directory",
  "tag",
  "tags",
  "login",
  "challenge",
  "session",
  "download",
  "static",
  "media",
  "help",
]);

/**
 * Validates if the hostname belongs to Instagram.
 */
function isInstagramHostname(hostname        )          {
  if (!hostname || typeof hostname !== "string") return false;
  const host = hostname.toLowerCase().trim();
  return (
    host === "instagram.com" ||
    host.endsWith(".instagram.com") ||
    host === "instagr.am" ||
    host.endsWith(".instagr.am")
  );
}

/**
 * Validates standard Instagram username format.
 * - 1 to 30 characters
 * - Alphanumeric, underscores, periods
 * - Cannot start with period or underscore
 * - Cannot end with period
 * - Cannot contain consecutive periods (..)
 */
function isValidInstagramUsername(username        )          {
  if (!username || typeof username !== "string") return false;
  const clean = username.trim();
  if (clean.length < 1 || clean.length > 30) return false;
  if (!/^[a-zA-Z0-9._]+$/.test(clean)) return false;
  if (clean.startsWith(".") || clean.startsWith("_")) return false;
  if (clean.endsWith(".")) return false;
  if (clean.includes("..")) return false;
  return true;
}

/**
 * Parses a raw URL to determine if it represents a public Instagram profile.
 * If valid, extracts the normalized username and canonical profile URL.
 * Returns null for any non-profile URL, post, reel, explore, or invalid domain.
 */
function detectInstagramProfileFromUrl(rawUrl        )                                  {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  try {
    const urlToParse = rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
      ? rawUrl
      : `https://${rawUrl}`;

    const parsed = new URL(urlToParse);
    if (!isInstagramHostname(parsed.hostname)) {
      return null;
    }

    // Decode URL pathname safely
    const decodedPath = decodeURIComponent(parsed.pathname);
    const segments = decodedPath.split("/").filter(Boolean);

    if (segments.length === 0) {
      return null;
    }

    const firstSegment = segments[0].toLowerCase().trim();

    // Check if the first segment is a known non-profile Instagram route
    if (RESERVED_INSTAGRAM_ROUTES.has(firstSegment)) {
      return null;
    }

    // For a profile URL, the path is typically /username/ or /username/channel/
    // We only accept valid usernames
    if (!isValidInstagramUsername(firstSegment)) {
      return null;
    }

    const username = firstSegment;
    const profileUrl = `https://www.instagram.com/${username}/`;

    return {
      username,
      profileUrl,
      detectedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}


// Inlined highlight collector utility


const DEFAULT_HIGHLIGHT_LIMIT = 20;
const DEFAULT_STORY_SAMPLE_LIMIT = 10;

/**
 * Extracts story items from the active story dialog/viewer if open in the DOM.
 */
function extractActiveStoriesFromDocument(
  doc          ,
  storyLimit         = DEFAULT_STORY_SAMPLE_LIMIT,
)                            {
  if (!doc) return [];

  const stories                            = [];
  const seenStoryIds = new Set        ();

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
    const mediaType                                =
      tagName === "video" ? "VIDEO" : tagName === "img" ? "IMAGE" : "UNKNOWN";

    const mediaUrl = media.getAttribute("src") || null;
    const storyId = `story_${stories.length + 1}_${(mediaUrl || "").slice(-12).replace(/\W/g, "")}`;

    if (seenStoryIds.has(storyId)) continue;
    seenStoryIds.add(storyId);

    // Visible text in story overlay
    let visibleText                = null;
    const textElements = storyContainer.querySelectorAll("h1, h2, span[dir='auto'], p");
    for (const el of Array.from(textElements)) {
      const txt = el.textContent?.trim();
      if (txt && txt.length > 0 && !txt.startsWith("@") && !txt.includes("Following") && !txt.includes("View profile")) {
        visibleText = txt;
        break;
      }
    }

    // Timestamp
    let timestamp                = null;
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

    const unavailableFields           = [];
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
function extractHighlightsFromDocument(
  doc          ,
  highlightLimit         = DEFAULT_HIGHLIGHT_LIMIT,
)                             {
  if (!doc) return [];

  const highlights                             = [];
  const seenTitles = new Set        ();

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
    let url                = null;
    const anchor = (item.closest ? item.closest("a") : null) || (item.querySelector ? item.querySelector("a") : null);
    if (anchor && typeof anchor.getAttribute === "function") {
      const href = anchor.getAttribute("href");
      if (href && href.includes("/stories/highlights/")) {
        url = href.startsWith("http") ? href : `https://www.instagram.com${href}`;
      }
    }

    // Extract cover image
    let coverImageUrl                = null;
    const img = item.querySelector ? item.querySelector("img") : null;
    if (img && typeof img.getAttribute === "function") {
      coverImageUrl = img.getAttribute("src") || null;
    }

    // Check if stories are active/open for this highlight
    const stories = extractActiveStoriesFromDocument(doc);

    const unavailableFields           = [];
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


// Inlined DOM extractor utility





/**
 * Safely parses raw formatted count strings (e.g. "12.4K", "1,234", "1.2M", "500", "100M", "1.5B")
 * into normalized numeric values.
 * Returns null if the value is ambiguous, malformed, or missing.
 */
function parseCount(rawCount                           )                {
  if (!rawCount || typeof rawCount !== "string") return null;

  const clean = rawCount.trim().replace(/,/g, "");
  if (!clean) return null;

  // Exact standard integer or decimal (with at most one period) and optional unit suffix
  const match = clean.match(/^(\d+(?:\.\d+)?)\s*([kKmMbB]?)$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (isNaN(num) || num < 0) return null;

  const unit = match[2].toUpperCase();
  if (unit === "K") {
    return Math.round(num * 1000);
  } else if (unit === "M") {
    return Math.round(num * 1000000);
  } else if (unit === "B") {
    return Math.round(num * 1000000000);
  }

  // Pure integer
  if (/^\d+$/.test(clean)) {
    return parseInt(clean, 10);
  }

  return Math.round(num);
}

/**
 * Safely decodes external links, especially Instagram outbound redirect URLs (e.g. l.instagram.com/?u=https%3A%2F%2Fexample.com).
 */
function extractExternalUrl(rawHref                           )                {
  if (!rawHref || typeof rawHref !== "string") return null;

  try {
    const trimmed = rawHref.trim();
    if (trimmed.includes("l.instagram.com") || trimmed.includes("instagram.com/linkshim")) {
      const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      const targetParam = parsed.searchParams.get("u");
      if (targetParam) {
        return decodeURIComponent(targetParam);
      }
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return `https://${trimmed}`;
  } catch {
    return rawHref.trim();
  }
}

/**
 * Extracts public Instagram profile metadata from a Document object.
 * Designed to work both inside a live Chrome content script and in Node.js test environments.
 */
function extractProfileFromDocument(
  doc          ,
  currentUrl         = "",
)                       {
  const detected = detectInstagramProfileFromUrl(currentUrl);
  const username = detected ? detected.username : null;
  const profileUrl = detected ? detected.profileUrl : null;

  const unavailableFields           = [];

  // 1. Display Name
  let displayName                = null;
  const header = doc.querySelector("header") || doc.querySelector("main");
  
  // Strategy A: Header display name element (typically h1 or specific display name span in header)
  const nameElement = header?.querySelector("section h1, header h1, section h2, header h2, div[class*='_ap3a'] span");
  if (nameElement && nameElement.textContent) {
    const text = nameElement.textContent.trim();
    if (text && text !== username && text !== `@${username}`) {
      displayName = text;
    }
  }

  // Strategy B: OpenGraph Title meta tag (Format usually "Display Name (@username) • Instagram photos and videos")
  if (!displayName) {
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
    if (ogTitle) {
      const match = ogTitle.match(/^([^(@]+)\s*\(@/);
      if (match && match[1]?.trim()) {
        displayName = match[1].trim();
      }
    }
  }

  // 2. Bio Extraction (Preserve linebreaks and emojis exactly)
  let bio                = null;
  // Strategy A: Dedicated bio container in modern Instagram DOM
  const bioElement = header?.querySelector("section > div > span[dir='auto'], div[class*='_ap3a'] span[dir='auto'], header section > div:last-child");
  if (bioElement) {
    // Replace <br> with newlines if present
    const innerHtml = bioElement.innerHTML;
    if (innerHtml && innerHtml.includes("<br")) {
      const tempDiv = doc.createElement("div");
      tempDiv.innerHTML = innerHtml.replace(/<br\s*[\/]?>/gi, "\n");
      bio = tempDiv.textContent || null;
    } else {
      bio = bioElement.textContent || null;
    }
    if (bio) bio = bio.trim();
  }

  // Strategy B: meta description tag fallback if DOM bio element is not hydrated yet
  if (!bio) {
    const metaDesc = doc.querySelector('meta[property="og:description"], meta[name="description"]')?.getAttribute("content");
    if (metaDesc && metaDesc.includes("-")) {
      const parts = metaDesc.split("-");
      if (parts.length > 1) {
        const afterDash = parts.slice(1).join("-").trim();
        // Remove trailing "See Instagram photos and videos from..."
        const cleanBio = afterDash.replace(/See Instagram photos and videos.*$/i, "").trim();
        if (cleanBio && !cleanBio.startsWith("See ")) {
          bio = cleanBio.replace(/^"|"$/g, "").trim();
        }
      }
    }
  }

  // 3. Profile Image URL
  let profileImageUrl                = null;
  const avatarImg = header?.querySelector("img[alt*='profile picture'], img[alt*='Profile picture'], header img");
  if (avatarImg) {
    profileImageUrl = avatarImg.getAttribute("src") || null;
  }
  if (!profileImageUrl) {
    profileImageUrl = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
  }

  // 4. Counts: Followers, Following, Posts
  let followerCount                = null;
  let followingCount                = null;
  let postCount                = null;

  // Strategy A: Header Stats items (usually <ul> with 3 <li>)
  const statItems = header?.querySelectorAll("ul > li, ul > div, a[href*='/followers/'], a[href*='/following/']");
  if (statItems && statItems.length > 0) {
    statItems.forEach((item) => {
      const text = (item.textContent || "").toLowerCase();
      const titleAttr = item.querySelector("span[title]")?.getAttribute("title");
      
      if (text.includes("follower")) {
        followerCount = parseCount(titleAttr || text.replace(/followers?/i, "").trim());
      } else if (text.includes("following")) {
        followingCount = parseCount(titleAttr || text.replace(/following/i, "").trim());
      } else if (text.includes("post")) {
        postCount = parseCount(titleAttr || text.replace(/posts?/i, "").trim());
      }
    });
  }

  // Strategy B: Fallback to og:description / description meta tag (e.g. "12.4K Followers, 150 Following, 45 Posts - ...")
  if (followerCount === null || followingCount === null || postCount === null) {
    const metaDesc = doc.querySelector('meta[property="og:description"], meta[name="description"]')?.getAttribute("content");
    if (metaDesc) {
      const followerMatch = metaDesc.match(/([\d.,]+[kKmMbB]?)\s+Followers/i);
      if (followerMatch && followerCount === null) {
        followerCount = parseCount(followerMatch[1]);
      }

      const followingMatch = metaDesc.match(/([\d.,]+[kKmMbB]?)\s+Following/i);
      if (followingMatch && followingCount === null) {
        followingCount = parseCount(followingMatch[1]);
      }

      const postMatch = metaDesc.match(/([\d.,]+[kKmMbB]?)\s+Posts/i);
      if (postMatch && postCount === null) {
        postCount = parseCount(postMatch[1]);
      }
    }
  }

  // 5. Verified Status
  let verified                 = null;
  const verifiedBadge = header?.querySelector(
    "[aria-label*='Verified'], [aria-label*='verified'], [title*='Verified'], svg[aria-label='Verified'], svg[aria-label='Verified account']"
  );
  if (verifiedBadge) {
    verified = true;
  } else if (header) {
    verified = false;
  }

  // 6. Account Category
  let accountCategory                = null;
  const categoryElem = header?.querySelector("div[class*='category'], div[class*='Category'], div[dir='auto']:has(+ div)");
  if (categoryElem && categoryElem.textContent && categoryElem.textContent !== bio && categoryElem.textContent !== displayName) {
    const catText = categoryElem.textContent.trim();
    if (catText.length > 0 && catText.length < 50 && !catText.includes("@")) {
      accountCategory = catText;
    }
  }

  // 7. External Links
  const externalLinks                          = [];
  const linkElements = header?.querySelectorAll("a[href*='l.instagram.com'], a[rel*='nofollow'], a[target='_blank']");
  if (linkElements) {
    linkElements.forEach((a) => {
      const rawHref = a.getAttribute("href");
      const cleanUrl = extractExternalUrl(rawHref);
      if (cleanUrl && !cleanUrl.includes("instagram.com") && !cleanUrl.includes("facebook.com")) {
        const label = a.textContent?.trim() || null;
        if (!externalLinks.some((l) => l.url === cleanUrl)) {
          externalLinks.push({ url: cleanUrl, label });
        }
      }
    });
  }

  // 8. Highlights Sample
  const highlights = extractHighlightsFromDocument(doc);

  // 9. Public Posts and Reels Sample
  const posts = extractPostSamplesFromDocument(doc);

  // Track missing / unavailable fields
  if (!displayName) unavailableFields.push("displayName");
  if (!bio) unavailableFields.push("bio");
  if (followerCount === null) unavailableFields.push("followerCount");
  if (followingCount === null) unavailableFields.push("followingCount");
  if (postCount === null) unavailableFields.push("postCount");
  if (profileImageUrl === null) unavailableFields.push("profileImageUrl");

  // Determine Collection Status
  let collectionStatus                                         = "COMPLETE";
  if (!username) {
    collectionStatus = "UNAVAILABLE";
  } else if (unavailableFields.length >= 3) {
    collectionStatus = "PARTIAL";
  }

  return {
    username,
    profileUrl,
    displayName,
    bio,
    profileImageUrl,
    followerCount,
    followingCount,
    postCount,
    verified,
    accountCategory,
    externalLinks,
    highlights,
    posts,
    collectedAt: new Date().toISOString(),
    collectionStatus,
    unavailableFields,
  };
}


// Inlined post collector utility



const DEFAULT_POST_SAMPLE_LIMIT = 12;

/**
 * Extracts hashtags from a caption or text string, returning an array of lowercase tag names without '#'.
 */
function extractHashtags(text                           )           {
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
function extractMentions(text                           )           {
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
function extractPostShortcodeAndType(url                           )   
                           
                                         
                              
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
function extractPostSamplesFromDocument(
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


// Content script logic




let lastDetectedUsername                = null;
let hydrationTimer      = null;
let badgeDismissedForProfile                = null;

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
function renderInPageBadge(username        , isVerified          = false) {
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
      badge .style.transform = "translateY(-2px) scale(1.02)";
      badge .style.boxShadow = "0 12px 28px rgba(0, 0, 0, 0.5), 0 0 0 1.5px #38bdf8";
    });

    badge.addEventListener("mouseleave", () => {
      badge .style.transform = "translateY(0) scale(1)";
      badge .style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15)";
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
    if ((e.target               )?.id === "veriqoo-close-btn") return;
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
  const profile                                  = detectInstagramProfileFromUrl(currentUrl);

  if (profile) {
    const isNewProfile = profile.username !== lastDetectedUsername;
    lastDetectedUsername = profile.username;

    // Collect genuine DOM snapshot
    const profileData                       = extractProfileFromDocument(document, currentUrl);

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

