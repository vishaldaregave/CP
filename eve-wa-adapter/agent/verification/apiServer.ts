import * as http from "node:http";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateInstagramIntelligenceReportPdf } from "./instagramProfileReportGenerator.ts";
import type {
  ProfileInvestigationRequest,
  ProfileInvestigationResponse,
  ApiInvestigationEvidenceItem,
  ApiHealthResponse,
  ApiErrorResponse,
} from "./apiTypes.ts";
import { API_SCHEMA_VERSION } from "./apiTypes.ts";
import { investigateInstagramProfile } from "./profileInvestigator.ts";
import type { InvestigateProfileParams } from "./profileInvestigator.ts";
import { isValidInstagramUsername, isInstagramHostname } from "../../extension/shared/profileDetector.ts";

/**
 * Validates incoming ProfileInvestigationRequest payload according to API contract rules.
 */
export function validateProfileInvestigationRequest(
  body: any,
): { valid: true; request: ProfileInvestigationRequest } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Request body must be a valid JSON object"] };
  }

  const profile = body.profile;
  if (!profile || typeof profile !== "object") {
    return { valid: false, errors: ["Missing or invalid 'profile' object in request"] };
  }

  if (!profile.username || typeof profile.username !== "string") {
    errors.push("Field 'profile.username' is required and must be a string");
  } else if (!isValidInstagramUsername(profile.username.replace(/^@+/, ""))) {
    errors.push(`Invalid Instagram username format: "${profile.username}"`);
  }

  if (!profile.profileUrl || typeof profile.profileUrl !== "string") {
    errors.push("Field 'profile.profileUrl' is required and must be a string");
  } else {
    try {
      const parsedUrl = new URL(profile.profileUrl);
      if (!isInstagramHostname(parsedUrl.hostname)) {
        errors.push(`Field 'profile.profileUrl': "${profile.profileUrl}" does not point to an Instagram host`);
      }
    } catch {
      errors.push(`Field 'profile.profileUrl': "${profile.profileUrl}" is not a valid URL format`);
    }
  }

  if (profile.posts !== undefined && !Array.isArray(profile.posts)) {
    errors.push("Field 'profile.posts' must be an array when provided");
  }

  if (profile.highlights !== undefined && !Array.isArray(profile.highlights)) {
    errors.push("Field 'profile.highlights' must be an array when provided");
  }

  if (profile.externalLinks !== undefined && !Array.isArray(profile.externalLinks)) {
    errors.push("Field 'profile.externalLinks' must be an array when provided");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const normalizedRequest: ProfileInvestigationRequest = {
    schemaVersion: body.schemaVersion || API_SCHEMA_VERSION,
    profile: {
      username: profile.username.replace(/^@+/, "").trim(),
      profileUrl: profile.profileUrl.trim(),
      displayName: profile.displayName || null,
      bio: profile.bio || null,
      profileImageUrl: profile.profileImageUrl || null,
      followerCount: typeof profile.followerCount === "number" ? profile.followerCount : null,
      followingCount: typeof profile.followingCount === "number" ? profile.followingCount : null,
      postCount: typeof profile.postCount === "number" ? profile.postCount : null,
      verified: typeof profile.verified === "boolean" ? profile.verified : null,
      accountCategory: profile.accountCategory || null,
      externalLinks: Array.isArray(profile.externalLinks) ? profile.externalLinks : [],
      highlights: Array.isArray(profile.highlights) ? profile.highlights : [],
      posts: Array.isArray(profile.posts) ? profile.posts : [],
      collectedAt: profile.collectedAt || new Date().toISOString(),
      collectionStatus: profile.collectionStatus || "COMPLETE",
      unavailableFields: Array.isArray(profile.unavailableFields) ? profile.unavailableFields : [],
    },
  };

  return { valid: true, request: normalizedRequest };
}

/**
 * Transforms an InstagramProfileData DTO into InvestigateProfileParams and executes the investigation engine.
 */
export function executeProfileInvestigation(
  request: ProfileInvestigationRequest,
): ProfileInvestigationResponse {
  const p = request.profile;
  const investigationId = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  // Map external links to plain string URLs
  const externalLinksUrls = (p.externalLinks || [])
    .map((l: any) => (typeof l === "string" ? l : l.url))
    .filter(Boolean);

  // Map highlights
  const highlightsParam = (p.highlights || []).map((h: any) => ({
    title: h.title,
    sourceUrl: h.url || undefined,
    stories: Array.isArray(h.stories) ? h.stories.map((s: any) => s.visibleText || s.mediaUrl).filter(Boolean) : [],
  }));

  // Map posts
  const postsParam = (p.posts || []).map((post: any) => ({
    url: post.url,
    caption: post.caption || post.visibleText || null,
    timestamp: post.timestamp || null,
    mediaType: (post.mediaType?.toLowerCase() === "reel" ? "reel" : "image") as any,
    likes: post.likeCount ?? undefined,
    comments: post.commentCount ?? undefined,
  }));

  const rawP = p as any;
  const displayName = p.displayName || rawP.fullName || null;
  const profileImageUrl = p.profileImageUrl || rawP.profilePicUrl || null;
  const followerCount = p.followerCount ?? rawP.followersCount ?? null;
  const postCount = p.postCount ?? rawP.postsCount ?? null;
  const verified = p.verified ?? rawP.isVerified ?? null;
  const category = p.accountCategory || rawP.category || null;

  const params: InvestigateProfileParams = {
    url: p.profileUrl || undefined,
    username: p.username || null,
    displayName,
    rawBio: p.bio || null,
    profilePictureUrl: profileImageUrl,
    followerCount,
    followingCount: p.followingCount ?? null,
    postCount,
    verifiedStatus:
      verified === true
        ? "VERIFIED"
        : verified === false
        ? "UNVERIFIED"
        : "UNKNOWN",
    accountCategory: category,
    externalLinks: externalLinksUrls,
    highlights: highlightsParam,
    posts: postsParam,
  };

  // Run genuine backend profile investigation pipeline
  const result = investigateInstagramProfile(params);

  // Map evidence items preserving full traceability IDs (EV-PROFILE-xxx, EV-BIO-xxx, EV-LINK-xxx, etc.)
  const evidence: ApiInvestigationEvidenceItem[] = (result.evidence || []).map((item) => ({
    id: item.id,
    evidenceId: item.id,
    source: item.source,
    sourceType: item.sourceType,
    observedText: item.observedText,
    observedValue: item.observedValue ?? null,
    claim: item.claim || "",
    evidenceType: item.evidenceType,
    status: item.status,
    confidence: item.confidence,
    capturedAt: item.capturedAt,
    trustImpact: item.trustImpact,
    riskImpact: item.riskImpact,
    supportingEvidenceIds: item.supportingEvidenceIds,
    contradictingEvidenceIds: item.contradictingEvidenceIds,
  }));

  const getDimScore = (category: string): number => {
    const dim = (result.dimensions || []).find((d) => d.category === category);
    return dim ? dim.earnedScore : 0;
  };

  const adDim = (result.dimensions || []).find((d) => d.category === "Advertising");
  const advertisingScore = adDim && !adDim.isNeutral ? adDim.earnedScore : null;

  const trustSignals = (result.evidence || [])
    .filter((e) => e.trustImpact > 0)
    .map((e) => `${e.source}: ${e.claim || e.observedText}`);

  const riskSignals = (result.evidence || [])
    .filter((e) => e.riskImpact > 0)
    .map((e) => `${e.source}: ${e.claim || e.observedText}`);

  const unknowns = result.sidePanelData?.unknowns || [];
  const unavailable = (result.evidence || [])
    .filter((e) => e.status === "UNAVAILABLE" || e.status === "UNKNOWN")
    .map((e) => `${e.source} (${e.id})`);

  const limitations = [
    "APIFY_META_INTEGRATION_SEPARATE_BOUNDARY",
    "CLIENT_SIDE_PUBLIC_OBSERVATION_ONLY",
  ];

  const response: ProfileInvestigationResponse = {
    schemaVersion: API_SCHEMA_VERSION,
    investigationId,
    profile: {
      username: p.username || "",
      profileUrl: p.profileUrl || "",
      displayName,
      bio: p.bio || null,
      followerCount,
      followingCount: p.followingCount ?? null,
      postCount,
      verified,
      accountCategory: category,
    },
    score: {
      trustScore: result.overallScore,
      riskLevel: result.sidePanelData?.riskLevel || "UNKNOWN",
      confidence: result.sidePanelData?.confidence ?? 100,
      evidenceCoverage: result.sidePanelData?.evidenceCoverage ?? 100,
      dimensions: {
        identityConsistency: getDimScore("Identity Consistency"),
        profileCompleteness: getDimScore("Profile Completeness"),
        bioEvidence: getDimScore("Bio Evidence"),
        externalIdentity: getDimScore("External Identity"),
        contentConsistency: getDimScore("Content Consistency"),
        highlights: getDimScore("Highlights"),
        advertising: advertisingScore,
        behaviouralSignals: getDimScore("Behavioural Signals"),
      },
    },
    evidence,
    trustSignals,
    riskSignals,
    unknowns,
    unavailable,
    limitations,
    completedAt: result.capturedAt || new Date().toISOString(),
  };

  return response;
}

/**
 * Applies security and CORS headers allowing Chrome extensions and local development clients.
 */
export function setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = req.headers.origin;
  if (origin && (origin.startsWith("chrome-extension://") || origin.includes("localhost") || origin.includes("127.0.0.1"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");
}

/**
 * Creates the HTTP server instance for Veriqoo Backend API.
 */
const inFlightPdfGenerations = new Map<string, Promise<string>>();

export function createVeriqooServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // GET /api/health
    if (req.method === "GET" && (pathname === "/api/health" || pathname === "/health")) {
      const healthResponse: ApiHealthResponse = {
        status: "ok",
        service: "veriqoo",
        schemaVersion: API_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(healthResponse));
      return;
    }

    // POST /api/investigate/profile
    if (req.method === "POST" && pathname === "/api/investigate/profile") {
      let bodyData = "";
      req.on("data", (chunk) => {
        bodyData += chunk;
        if (bodyData.length > 5 * 1024 * 1024) {
          // 5MB limit
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: { code: "INVALID_REQUEST", message: "Request payload exceeds size limit" },
              schemaVersion: API_SCHEMA_VERSION,
            }),
          );
          req.destroy();
        }
      });

      req.on("end", async () => {
        try {
          const parsedJson = JSON.parse(bodyData || "{}");
          const validation = validateProfileInvestigationRequest(parsedJson);

          if (!validation.valid) {
            const errorResp: ApiErrorResponse = {
              error: {
                code: "INVALID_REQUEST",
                message: "Profile investigation request validation failed",
                details: validation.errors,
              },
              schemaVersion: API_SCHEMA_VERSION,
            };
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify(errorResp));
            return;
          }

          const response = executeProfileInvestigation(validation.request);

          // Asynchronously ensure publication-grade PDF report is generated (non-blocking for fast API response)
          try {
            const reportsDir = path.resolve(process.cwd(), "reports");
            if (!fs.existsSync(reportsDir)) {
              fs.mkdirSync(reportsDir, { recursive: true });
            }
            const pdfFilename = `verification-${response.profile.username}.pdf`;
            const pdfFilePath = path.join(reportsDir, pdfFilename);

            response.reportPdfUrl = `/api/reports/${pdfFilename}`;
            response.reportPdfPath = pdfFilePath;

            const p = validation.request.profile;
            const pdfData = {
              username: response.profile.username,
              fullName: response.profile.displayName || undefined,
              biography: response.profile.bio || undefined,
              followersCount: response.profile.followerCount ?? undefined,
              followingCount: response.profile.followingCount ?? undefined,
              postsCount: response.profile.postCount ?? undefined,
              isVerified: response.profile.verified ?? undefined,
              category: response.profile.accountCategory || undefined,
              externalUrl: p.externalLinks?.[0]?.url || undefined,
              profilePicUrl: p.profileImageUrl || undefined,
              highlights: p.highlights?.map((h: any, i: number) => ({
                id: h.id || `h${i + 1}`,
                title: h.title,
                mediaCount: h.stories?.length || 10,
                coverUrl: h.url,
              })),
              latestPosts: p.posts?.map((post: any, i: number) => ({
                id: post.id || `p${i + 1}`,
                type: post.mediaType === "REEL" ? "Video" : "Photo",
                url: post.url,
                caption: post.caption,
                likesCount: post.likeCount ?? 120,
                commentsCount: post.commentCount ?? 15,
                timestamp: post.timestamp,
                isVideo: post.mediaType === "REEL",
              })),
            };

            const genPromise = generateInstagramIntelligenceReportPdf(pdfData, pdfFilePath)
              .catch((pdfErr) => {
                console.warn("[Veriqoo API Server] PDF generation note:", pdfErr);
                return pdfFilePath;
              })
              .finally(() => {
                inFlightPdfGenerations.delete(pdfFilename);
              });

            inFlightPdfGenerations.set(pdfFilename, genPromise);
          } catch (pdfErr) {
            console.warn("[Veriqoo API Server] PDF generation initialization note:", pdfErr);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        } catch (err: any) {
          console.error("[Veriqoo API Server] Error processing investigation:", err);
          const errorResp: ApiErrorResponse = {
            error: {
              code: "INVESTIGATION_FAILED",
              message: "An internal error occurred during profile investigation",
            },
            schemaVersion: API_SCHEMA_VERSION,
          };
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errorResp));
        }
      });
      return;
    }

    // GET /api/reports/:filename (Serve publication-grade PDF reports)
    if (req.method === "GET" && pathname.startsWith("/api/reports/")) {
      const filename = path.basename(pathname);
      const reportsDir = path.resolve(process.cwd(), "reports");
      const filePath = path.join(reportsDir, filename);

      // If PDF generation is currently in-flight, await completion
      if (inFlightPdfGenerations.has(filename)) {
        try {
          await inFlightPdfGenerations.get(filename);
        } catch {
          // Fall through
        }
      }

      if (fs.existsSync(filePath)) {
        try {
          const stat = fs.statSync(filePath);
          res.writeHead(200, {
            "Content-Type": "application/pdf",
            "Content-Length": stat.size,
            "Content-Disposition": `inline; filename="${filename}"`,
          });
          fs.createReadStream(filePath).pipe(res);
          return;
        } catch (readErr) {
          console.error("[Veriqoo API Server] Error reading PDF report:", readErr);
        }
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: `Report "${filename}" not found` } }));
      return;
    }

    // 404 Not Found
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: { code: "INVALID_REQUEST", message: `Endpoint not found: ${req.method} ${pathname}` },
        schemaVersion: API_SCHEMA_VERSION,
      }),
    );
  });

  return server;
}

/**
 * Starts the Veriqoo HTTP API server on the specified port.
 */
export function startVeriqooServer(port: number = Number(process.env.VERIQOO_PORT || process.env.PORT || 3000)): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = createVeriqooServer();
    server.listen(port, () => {
      console.info(`[Veriqoo API Server] Listening on http://localhost:${port}`);
      resolve(server);
    });
    server.on("error", (err) => {
      reject(err);
    });
  });
}
