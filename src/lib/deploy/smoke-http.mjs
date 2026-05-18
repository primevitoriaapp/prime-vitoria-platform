export function isVercelProtectionResponse({ responseUrl = "", body = "" } = {}) {
  const normalizedUrl = responseUrl.toLowerCase();
  const normalizedBody = body.toLowerCase();

  return (
    normalizedUrl.includes("vercel.com/login") ||
    normalizedUrl.includes("vercel.com/sso") ||
    normalizedBody.includes("log in to vercel") ||
    normalizedBody.includes("deployment protection") ||
    normalizedBody.includes("vercel authentication")
  );
}

export function vercelProtectionMessage(name, url, responseUrl) {
  const target = responseUrl && responseUrl !== url ? ` (redirected to ${responseUrl})` : "";
  return `${name}: ${url}${target} is behind Vercel Deployment Protection. Use a public alias, disable protection for this deployment, or run the smoke after authenticating with Vercel.`;
}
