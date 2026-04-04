// Security headers for production
// NOTE: frame-ancestors must allow Shopify admin domains for embedded app iframe
export const securityHeaders = {
  // Do NOT set X-Frame-Options — Shopify embedded apps run in iframes
  // "X-Frame-Options": "DENY", // REMOVED — breaks Shopify embedded app

  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",
  // Enable XSS protection
  "X-XSS-Protection": "1; mode=block",
  // Referrer policy
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Content Security Policy — must allow Shopify framing
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.shopify.com",
    "style-src 'self' 'unsafe-inline' https://cdn.shopify.com https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com https://cdn.shopify.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://cdn.shopify.com https://monorail-edge.shopifysvc.com",
    "frame-src 'self' https://cdn.shopify.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.myshopify.com https://admin.shopify.com",
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com"
  ].join("; "),
  // HSTS (HTTP Strict Transport Security) - only in production
  ...(process.env.NODE_ENV === "production" ? {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload"
  } : {})
};

// Apply security headers to all responses
export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  Object.entries(securityHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}