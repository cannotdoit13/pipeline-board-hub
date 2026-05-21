const crypto = require("crypto");

function verifyGithubSignature(req, res, next) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return next();

  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    return res.status(401).json({ error: "Missing webhook signature." });
  }

  const digest = `sha256=${crypto.createHmac("sha256", secret).update(req.rawBody || "").digest("hex")}`;
  const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  if (!valid) {
    return res.status(401).json({ error: "Invalid webhook signature." });
  }
  return next();
}

module.exports = { verifyGithubSignature };
