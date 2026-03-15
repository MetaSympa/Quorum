/**
 * In-memory rate limiter for DPS Dashboard.
 *
 * Uses a sliding window algorithm with a Map<string, number[]> where each
 * entry stores an array of timestamps (in ms) for recent requests.
 *
 * Designed for single-instance deployment (no Redis required for MVP).
 * Entries are lazily cleaned up — expired timestamps are pruned on each check.
 *
 * Usage:
 *   const result = rateLimit("login:192.168.1.1", 5, 15 * 60 * 1000);
 *   if (!result.success) {
 *     return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 *   }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  /** true if the request is allowed, false if rate limit exceeded */
  success: boolean;
  /** number of remaining attempts in the current window */
  remaining: number;
  /** when the oldest entry in the window expires (the window resets after this) */
  resetAt: Date;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/**
 * Map from rate-limit key → array of request timestamps (ms) in the current window.
 * Entries are pruned lazily on each call.
 */
const store = new Map<string, number[]>();

/**
 * Clean up all expired keys across the entire store.
 * Called periodically to prevent memory leaks in long-running processes.
 */
function cleanup(windowMs: number): void {
  const now = Date.now();
  const cutoff = now - windowMs;
  store.forEach((timestamps, key) => {
    const valid = timestamps.filter((t: number) => t > cutoff);
    if (valid.length === 0) {
      store.delete(key);
    } else {
      store.set(key, valid);
    }
  });
}

/**
 * Schedule a periodic cleanup every 5 minutes.
 * Only runs on the server — safe to call at module initialization.
 */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanupScheduled(): void {
  if (cleanupInterval !== null) return;
  // Use a default window of 15 minutes for general cleanup
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  cleanupInterval = setInterval(() => {
    cleanup(60 * 60 * 1000); // prune anything older than 1 hour
  }, CLEANUP_INTERVAL_MS);

  // Allow the process to exit even if the interval is still running
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

// Start the cleanup scheduler when the module is loaded
if (typeof setInterval !== "undefined") {
  ensureCleanupScheduled();
}

// ---------------------------------------------------------------------------
// Core rate limiting function
// ---------------------------------------------------------------------------

/**
 * Check and record a request for the given key.
 *
 * @param key         - Unique identifier for the rate-limit bucket (e.g. "login:192.168.1.1")
 * @param maxAttempts - Maximum number of requests allowed within the window
 * @param windowMs    - Duration of the sliding window in milliseconds
 * @returns RateLimitResult
 */
export function rateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Get existing timestamps, prune expired entries
  const existing = store.get(key) ?? [];
  const valid = existing.filter((t) => t > cutoff);

  // Check if limit is exceeded
  if (valid.length >= maxAttempts) {
    // Find when the oldest entry will expire (window will have room after that)
    const oldestInWindow = valid[0]!; // valid is sorted oldest→newest
    const resetAt = new Date(oldestInWindow + windowMs);

    return {
      success: false,
      remaining: 0,
      resetAt,
    };
  }

  // Record this request
  valid.push(now);
  store.set(key, valid);

  const remaining = maxAttempts - valid.length;

  // resetAt = when the oldest entry expires (i.e. when the count will drop by 1)
  const oldestEntry = valid[0]!;
  const resetAt = new Date(oldestEntry + windowMs);

  return {
    success: true,
    remaining,
    resetAt,
  };
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/**
 * Build a rate-limit key from the request's IP address and a prefix.
 *
 * Handles proxies (x-forwarded-for), direct connections (x-real-ip),
 * and falls back to "unknown" if no IP is detected.
 *
 * @param req    - The incoming Next.js Request object
 * @param prefix - Bucket name, e.g. "login", "webhook", "sponsor-public"
 */
export function getRateLimitKey(req: Request, prefix: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  // x-forwarded-for may be a comma-separated list — take the first (client IP)
  const ip = forwarded
    ? forwarded.split(",")[0]!.trim()
    : (req.headers.get("x-real-ip") ?? "unknown");
  return `${prefix}:${ip}`;
}

/**
 * Build a rate-limit key scoped to a specific user ID.
 * Used for per-user limits (e.g. change-password, API requests).
 *
 * @param userId - Authenticated user's ID
 * @param prefix - Bucket name
 */
export function getRateLimitKeyForUser(userId: string, prefix: string): string {
  return `${prefix}:user:${userId}`;
}

// ---------------------------------------------------------------------------
// Pre-configured rate limit helpers
// ---------------------------------------------------------------------------

/** 5 attempts per 15 minutes — used for login and change-password */
export const LOGIN_RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
} as const;

/** 100 requests per minute — used for general authenticated API routes */
export const API_RATE_LIMIT = {
  maxAttempts: 100,
  windowMs: 60 * 1000,
} as const;

/** 50 requests per minute — used for webhook endpoints */
export const WEBHOOK_RATE_LIMIT = {
  maxAttempts: 50,
  windowMs: 60 * 1000,
} as const;

/** 30 requests per minute — used for public endpoints (sponsor checkout, sponsor-order) */
export const PUBLIC_RATE_LIMIT = {
  maxAttempts: 30,
  windowMs: 60 * 1000,
} as const;

// ---------------------------------------------------------------------------
// Store accessor (for testing)
// ---------------------------------------------------------------------------

/**
 * Clear all rate limit entries.
 * Intended for use in tests only — do not call in production code.
 */
export function clearRateLimitStore(): void {
  store.clear();
}

/**
 * Get the current number of entries in the store.
 * Intended for use in tests only.
 */
export function getRateLimitStoreSize(): number {
  return store.size;
}
