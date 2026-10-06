             
                              
                               
                    
                   
                                              
                                                       

export const DEFAULT_API_BASE_URL = "http://localhost:3000";
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

                                  
                   
                     
 

export class VeriqooApiError extends Error {
  code        ;
  status        ;
  details           ;

  constructor(message        , code         = "INVESTIGATION_FAILED", status         = 500, details           ) {
    super(message);
    this.name = "VeriqooApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

                                                        

function normalizeConfig(options                   )                                         {
  if (typeof options === "string") {
    return { baseUrl: options, timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS };
  }
  return {
    baseUrl: options?.baseUrl || DEFAULT_API_BASE_URL,
    timeoutMs: options?.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
  };
}

/**
 * Checks backend health to verify if the local Veriqoo server is running.
 */
export async function checkBackendHealth(
  options                   ,
)                             {
  const { baseUrl, timeoutMs } = normalizeConfig(options);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.min(timeoutMs, 5000));

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new VeriqooApiError(
        `Health check failed with status ${response.status}`,
        "INVESTIGATION_UNAVAILABLE",
        response.status,
      );
    }

    const data                    = await response.json();
    return data;
  } catch (err     ) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new VeriqooApiError("Health check request timed out", "TIMEOUT", 504);
    }
    if (err instanceof VeriqooApiError) {
      throw err;
    }
    throw new VeriqooApiError(
      `Cannot connect to Veriqoo backend at ${baseUrl}: ${err.message}`,
      "INVESTIGATION_UNAVAILABLE",
      503,
    );
  }
}

/**
 * Sends collected InstagramProfileData to the Veriqoo Backend and returns typed investigation results.
 */
export async function requestProfileInvestigation(
  profileData                      ,
  options                   ,
)                                        {
  const { baseUrl, timeoutMs } = normalizeConfig(options);

  const payload                              = {
    schemaVersion: "1.0",
    profile: profileData,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/investigate/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorBody                          = null;
      try {
        errorBody = await response.json();
      } catch {
        // Fallback for non-JSON errors
      }

      const errorMessage =
        errorBody?.error?.message || `Investigation request failed with HTTP ${response.status}`;
      const errorCode = errorBody?.error?.code || "INVESTIGATION_FAILED";
      const errorDetails = errorBody?.error?.details;

      throw new VeriqooApiError(errorMessage, errorCode, response.status, errorDetails);
    }

    const data                               = await response.json();
    return data;
  } catch (err     ) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new VeriqooApiError(
        `Investigation request timed out after ${timeoutMs}ms`,
        "TIMEOUT",
        504,
      );
    }
    if (err instanceof VeriqooApiError) {
      throw err;
    }
    throw new VeriqooApiError(
      `Failed to reach Veriqoo backend: ${err.message}`,
      "INVESTIGATION_UNAVAILABLE",
      503,
    );
  }
}
