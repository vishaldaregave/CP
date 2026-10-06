import type { DetectedInstagramProfile } from "./types.ts";

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
export function isInstagramHostname(hostname: string): boolean {
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
export function isValidInstagramUsername(username: string): boolean {
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
export function detectInstagramProfileFromUrl(rawUrl: string): DetectedInstagramProfile | null {
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
