import type { InstagramProfileData } from "../../extension/shared/types.ts";

export const API_SCHEMA_VERSION = "1.0";

export interface ProfileInvestigationRequest {
  schemaVersion?: string;
  profile: InstagramProfileData;
}

export interface ApiInvestigationScore {
  trustScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "INSUFFICIENT_EVIDENCE" | "UNKNOWN";
  confidence: number;
  evidenceCoverage: number;
  dimensions: {
    identityConsistency: number;
    profileCompleteness: number;
    bioEvidence: number;
    externalIdentity: number;
    contentConsistency: number;
    highlights: number;
    advertising: number | null;
    behaviouralSignals: number;
  };
}

export interface ApiInvestigationEvidenceItem {
  id: string;
  evidenceId?: string;
  source: string;
  sourceType: string;
  observedText: string;
  observedValue: any;
  claim: string;
  evidenceType: string;
  status: string;
  confidence: number;
  capturedAt: string;
  trustImpact: number;
  riskImpact: number;
  supportingEvidenceIds?: string[];
  contradictingEvidenceIds?: string[];
}

export interface ProfileInvestigationResponse {
  schemaVersion: string;
  investigationId: string;
  profile: {
    username: string;
    profileUrl: string;
    displayName: string | null;
    bio: string | null;
    followerCount: number | null;
    followingCount: number | null;
    postCount: number | null;
    verified: boolean | null;
    accountCategory: string | null;
  };
  score: ApiInvestigationScore;
  evidence: ApiInvestigationEvidenceItem[];
  trustSignals: string[];
  riskSignals: string[];
  unknowns: string[];
  unavailable: string[];
  limitations: string[];
  completedAt: string;
}

export interface ApiHealthResponse {
  status: "ok";
  service: "veriqoo";
  schemaVersion: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  error: {
    code:
      | "INVALID_REQUEST"
      | "PROFILE_NOT_SUPPORTED"
      | "INVESTIGATION_ALREADY_RUNNING"
      | "RATE_LIMITED"
      | "INVESTIGATION_FAILED"
      | "INVESTIGATION_UNAVAILABLE";
    message: string;
    details?: string[];
  };
  schemaVersion: string;
}
