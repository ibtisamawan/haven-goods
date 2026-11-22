# Creates a random SESSION_SECRET and saves it in the Vercel project's
# Production environment variables. The value is never printed.
# Usage (after "vercel link"):  .\scripts\vercel-set-secret.ps1
$secret = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
$secret | vercel env add SESSION_SECRET production --force
Write-Host "SESSION_SECRET saved in Vercel (Production)."
