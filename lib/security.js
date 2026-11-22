// Security middleware: HTTP security headers, cross-site request (CSRF)
// protection and a small rate limiter for login/registration.

// --- Security headers -------------------------------------------------------
const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'", // inline style="" attributes are used for star ratings and progress bars
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  next();
}

// --- CSRF protection ----------------------------------------------------------
// Every state-changing request must come from a page on this site. Browsers send
// the Origin header (or at least Referer) with form posts; requests whose origin
// is another website are rejected. Together with SameSite=Lax session cookies
// this blocks cross-site request forgery.
function sameOrigin(req) {
  const expectedHost = req.get('host');
  const source = req.get('origin') || req.get('referer');
  if (!source || source === 'null') return false;
  try {
    return new URL(source).host === expectedHost;
  } catch {
    return false;
  }
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (sameOrigin(req)) return next();
  res.status(403).render('message', {
    title: 'Request blocked', heading: 'Request blocked',
    text: 'This form was sent from another website, so it was blocked for your security. Please go back, reload the page and try again.',
  });
}

// --- Rate limiting --------------------------------------------------------------
// Counts attempts per key (e.g. IP address) inside a time window. Memory is
// cleaned up as entries expire. On serverless hosting each instance keeps its
// own counters, so this slows down brute force rather than being a hard cap.
function createLimiter({ max, windowMs }) {
  const hits = new Map();
  const prune = (now) => {
    if (hits.size < 1000) return;
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
  };
  return {
    isBlocked(key) {
      const entry = hits.get(key);
      return !!entry && entry.reset > Date.now() && entry.count >= max;
    },
    hit(key) {
      const now = Date.now();
      prune(now);
      const entry = hits.get(key);
      if (!entry || entry.reset <= now) hits.set(key, { count: 1, reset: now + windowMs });
      else entry.count += 1;
    },
    reset(key) { hits.delete(key); },
  };
}

module.exports = { securityHeaders, csrfProtection, createLimiter, CSP };
