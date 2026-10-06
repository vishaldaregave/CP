export interface DetectedInstagramProfile {
  username: string;
  profileUrl: string;
  detectedAt: string;
}

export interface InstagramExternalLink {
  url: string;
  label: string | null;
}

export interface InstagramHighlightStory {
  id: string;
  position: number;
  url: string | null;
  mediaType: "IMAGE" | "VIDEO" | "UNKNOWN";
  visibleText: string | null;
  timestamp: string | null;
  mediaUrl: string | null;
  source: "DOM" | "META" | "STRUCTURED_DATA";
  collectionStatus: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  unavailableFields: string[];
}

export interface InstagramHighlightSample {
  id: string;
  title: string;
  position: number;
  url: string | null;
  coverImageUrl?: string | null;
  stories: InstagramHighlightStory[];
  collectionStatus: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  unavailableFields: string[];
  collectedAt: string;
}

export interface InstagramHighlightMetadata {
  title: string;
  position: number;
}

export interface InstagramPostSample {
  id: string;
  url: string;
  mediaType: "POST" | "REEL" | "UNKNOWN";
  caption: string | null;
  timestamp: string | null;
  likeCount: number | null;
  commentCount: number | null;
  hashtags: string[];
  mentions: string[];
  visibleText: string | null;
  mediaUrl: string | null;
  position: number;
  source: "DOM" | "META" | "STRUCTURED_DATA";
  collectedAt: string;
  collectionStatus: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  unavailableFields: string[];
}

export interface InstagramProfileData {
  username: string | null;
  profileUrl: string | null;

  displayName: string | null;
  bio: string | null;

  profileImageUrl: string | null;

  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;

  verified: boolean | null;
  accountCategory: string | null;

  externalLinks: InstagramExternalLink[];

  highlights: InstagramHighlightSample[];

  posts: InstagramPostSample[];

  collectedAt: string;

  collectionStatus: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  unavailableFields: string[];
}

export type ExtensionStatus =
  | "IDLE"
  | "PROFILE_DETECTED"
  | "INVESTIGATING"
  | "COMPLETE"
  | "ERROR";

export interface ExtensionState {
  status: ExtensionStatus;
  profile: DetectedInstagramProfile | null;
  data: InstagramProfileData | null;
  error: string | null;
}

export interface ProfileDetectedPayload {
  profile: DetectedInstagramProfile;
  data?: InstagramProfileData | null;
}

export interface StartInvestigationPayload {
  username: string;
  profileUrl: string;
  profileData?: InstagramProfileData | null;
}

export interface InvestigationResultPayload {
  username: string;
  status: "COMPLETE";
  summary?: string;
}

export interface InvestigationErrorPayload {
  username: string;
  error: string;
}

export type ExtensionMessage =
  | {
      type: "PROFILE_DETECTED";
      payload: ProfileDetectedPayload;
    }
  | {
      type: "PROFILE_DATA_UPDATED";
      payload: {
        username: string;
        data: InstagramProfileData;
      };
    }
  | {
      type: "HIGHLIGHTS_UPDATED";
      payload: {
        username: string;
        highlights: InstagramHighlightSample[];
        highlightLimit: number;
        collectedCount: number;
        collectionStatus: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
      };
    }
  | {
      type: "START_INVESTIGATION";
      payload: StartInvestigationPayload;
    }
  | {
      type: "INVESTIGATION_RESULT";
      payload: InvestigationResultPayload;
    }
  | {
      type: "INVESTIGATION_ERROR";
      payload: InvestigationErrorPayload;
    }
  | {
      type: "GET_CURRENT_STATE";
    }
  | {
      type: "STATE_UPDATED";
      payload: ExtensionState;
    };

