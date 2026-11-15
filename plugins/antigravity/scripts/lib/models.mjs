// Model IDs are agy display labels or `agy models` ids (agy 1.5.9 resolves ids).
// Anything else silently falls back to agy's own default (Flash Medium);
// the facade detects that via the propagated label in agy's log.
export const MODELS = Object.freeze({
  HYDROGEN_HIGH: "gemini-4-hydrogen-high", // agy 1.5.9 accepts the id (verified); display label untested
  HYDROGEN_XHIGH: "gemini-4-hydrogen-xhigh",
  ARGON_HIGH: "gemini-4-argon-high"
});

export const DEFAULT_MODEL = MODELS.HYDROGEN_HIGH;

export const MODEL_ALIASES = new Map([
  ["hydrogen", MODELS.HYDROGEN_HIGH],
  ["hydrogen-xhigh", MODELS.HYDROGEN_XHIGH],
  ["argon", MODELS.ARGON_HIGH]
]);

export function resolveModel(input) {
  if (input == null) {
    return null;
  }
  const normalized = String(input).trim();
  if (!normalized) {
    return null;
  }
  return MODEL_ALIASES.get(normalized.toLowerCase()) ?? normalized;
}

export function suggestAlternatives(failedModelId) {
  const alternatives = [];
  for (const [alias, modelId] of MODEL_ALIASES) {
    if (modelId !== failedModelId) {
      alternatives.push(alias);
    }
  }
  if (alternatives.length === 0) {
    return [...MODEL_ALIASES.keys()];
  }
  return alternatives;
}
