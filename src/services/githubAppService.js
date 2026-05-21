const jwt = require("jsonwebtoken");

function getRequiredEnv() {
  return {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

function buildAppJwt() {
  const { appId, privateKey } = getRequiredEnv();
  if (!appId || !privateKey) {
    throw new Error("Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY.");
  }
  return jwt.sign(
    {
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 9 * 60,
      iss: appId,
    },
    privateKey.replace(/\\n/g, "\n"),
    { algorithm: "RS256" }
  );
}

async function createInstallationToken(installationId) {
  const appJwt = buildAppJwt();
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub installation token failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function exchangeOauthCode(code) {
  const { clientId, clientSecret } = getRequiredEnv();
  if (!clientId || !clientSecret) {
    throw new Error("Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET.");
  }
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(`GitHub OAuth exchange failed: ${payload.error || response.statusText}`);
  }
  return payload;
}

module.exports = {
  createInstallationToken,
  exchangeOauthCode,
};
