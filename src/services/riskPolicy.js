function classifyRisk(requirementText, confidence) {
  const text = (requirementText || "").toLowerCase();
  const sensitiveWords = ["security", "payment", "auth", "encryption", "production incident"];
  if (sensitiveWords.some((w) => text.includes(w))) return "high";
  if (confidence < 0.8) return "medium";
  return "low";
}

function canAutoApply({ riskLevel, confidence }) {
  return riskLevel === "low" && confidence >= 0.8;
}

module.exports = { classifyRisk, canAutoApply };
