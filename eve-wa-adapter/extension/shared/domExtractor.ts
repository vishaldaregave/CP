import type {
  InstagramProfileData,
  InstagramExternalLink,
  InstagramHighlightSample,
} from "./types.ts";
import { detectInstagramProfileFromUrl } from "./profileDetector.ts";
import { extractPostSamplesFromDocument } from "./postCollector.ts";
import { extractHighlightsFromDocument } from "./highlightCollector.ts";

/**
 * Safely parses raw formatted count strings (e.g. "12.4K", "1,234", "1.2M", "500", "100M", "1.5B")
 * into normalized numeric values.
 * Returns null if the value is ambiguous, malformed, or missing.
 */
export function parseCount(rawCount: string | null | undefined): number | null {
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
export function extractExternalUrl(rawHref: string | null | undefined): string | null {
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
export function extractProfileFromDocument(
  doc: Document,
  currentUrl: string = "",
): InstagramProfileData {
  const detected = detectInstagramProfileFromUrl(currentUrl);
  const username = detected ? detected.username : null;
  const profileUrl = detected ? detected.profileUrl : null;

  const unavailableFields: string[] = [];

  // 1. Display Name
  let displayName: string | null = null;
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
  let bio: string | null = null;
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
  let profileImageUrl: string | null = null;
  const avatarImg = header?.querySelector("img[alt*='profile picture'], img[alt*='Profile picture'], header img");
  if (avatarImg) {
    profileImageUrl = avatarImg.getAttribute("src") || null;
  }
  if (!profileImageUrl) {
    profileImageUrl = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;
  }

  // 4. Counts: Followers, Following, Posts
  let followerCount: number | null = null;
  let followingCount: number | null = null;
  let postCount: number | null = null;

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
  let verified: boolean | null = null;
  const verifiedBadge = header?.querySelector(
    "[aria-label*='Verified'], [aria-label*='verified'], [title*='Verified'], svg[aria-label='Verified'], svg[aria-label='Verified account']"
  );
  if (verifiedBadge) {
    verified = true;
  } else if (header) {
    verified = false;
  }

  // 6. Account Category
  let accountCategory: string | null = null;
  const categoryElem = header?.querySelector("div[class*='category'], div[class*='Category'], div[dir='auto']:has(+ div)");
  if (categoryElem && categoryElem.textContent && categoryElem.textContent !== bio && categoryElem.textContent !== displayName) {
    const catText = categoryElem.textContent.trim();
    if (catText.length > 0 && catText.length < 50 && !catText.includes("@")) {
      accountCategory = catText;
    }
  }

  // 7. External Links
  const externalLinks: InstagramExternalLink[] = [];
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
  let collectionStatus: "COMPLETE" | "PARTIAL" | "UNAVAILABLE" = "COMPLETE";
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
