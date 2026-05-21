const express = require("express");
const { createInstallationToken, exchangeOauthCode } = require("../services/githubAppService");

const router = express.Router();

router.get("/install/callback", async (req, res) => {
  try {
    const installationId = req.query.installation_id;
    if (!installationId) {
      return res.status(400).json({ error: "Missing installation_id." });
    }
    const tokenPayload = await createInstallationToken(installationId);
    return res.json({
      ok: true,
      installationId,
      tokenType: tokenPayload.token ? "installation" : "none",
      expiresAt: tokenPayload.expires_at,
      note: "Persist token securely in production secret storage.",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/oauth/exchange", async (req, res) => {
  try {
    const code = req.body.code;
    if (!code) return res.status(400).json({ error: "Missing OAuth code." });
    const tokenPayload = await exchangeOauthCode(code);
    return res.json({
      ok: true,
      scope: tokenPayload.scope,
      tokenType: tokenPayload.token_type,
      note: "Access token omitted from response by design.",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
