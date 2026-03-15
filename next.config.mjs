/** @type {import('next').NextConfig} */

// ---------------------------------------------------------------------------
// Security headers (T26)
// Applied to all routes via the headers() hook.
// ---------------------------------------------------------------------------

const securityHeaders = [
  // Prevent the app from being embedded in an iframe (clickjacking protection)
  { key: "X-Frame-Options", value: "DENY" },

  // Prevent browsers from MIME-sniffing the content-type
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Send full referrer within same origin; send only origin cross-origin
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Legacy XSS filter (still supported by some older browsers)
  { key: "X-XSS-Protection", value: "1; mode=block" },

  // Disable access to camera, microphone, and geolocation APIs
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },

  // Content Security Policy:
  //   - default-src 'self'             — only same-origin by default
  //   - script-src: allow Razorpay checkout.js and inline scripts (Next.js requires unsafe-eval/unsafe-inline)
  //   - style-src: allow inline styles (Tailwind + shadcn/ui)
  //   - img-src: allow data URIs and blobs (avatars, receipts)
  //   - font-src: same-origin fonts only
  //   - connect-src: Razorpay API for payment processing
  //   - frame-src: Razorpay hosted checkout frame
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
      "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    ].join("; "),
  },

  // HTTP Strict Transport Security — 2 years, include subdomains, preload eligible
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  /**
   * Standalone output mode — required for Docker multi-stage build.
   * Produces a self-contained server.js + node_modules tree under .next/standalone.
   */
  output: 'standalone',

  /**
   * Security headers applied to every response.
   * The source pattern '/(.*)'  matches all routes including API routes.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
