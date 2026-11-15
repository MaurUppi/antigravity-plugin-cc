import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveModel,
  suggestAlternatives,
  MODELS,
  MODEL_ALIASES,
  DEFAULT_MODEL
} from "../plugins/antigravity/scripts/lib/models.mjs";

describe("resolveModel", () => {
  it("resolves 'hydrogen' to the Hydrogen High id", () => {
    assert.equal(resolveModel("hydrogen"), "gemini-4-hydrogen-high");
  });

  it("resolves 'hydrogen-xhigh'", () => {
    assert.equal(resolveModel("hydrogen-xhigh"), "gemini-4-hydrogen-xhigh");
  });

  it("resolves 'argon'", () => {
    assert.equal(resolveModel("argon"), "gemini-4-argon-high");
  });

  it("passes through unknown values verbatim (custom models in agy settings)", () => {
    assert.equal(resolveModel("My Custom Model"), "My Custom Model");
  });

  it("returns null for null input", () => {
    assert.equal(resolveModel(null), null);
  });

  it("returns null for empty string", () => {
    assert.equal(resolveModel(""), null);
  });

  it("is case-insensitive for aliases", () => {
    assert.equal(resolveModel("HYDROGEN"), "gemini-4-hydrogen-high");
    assert.equal(resolveModel("Argon"), "gemini-4-argon-high");
  });
});

describe("DEFAULT_MODEL", () => {
  it("is Gemini 4 Hydrogen (High)", () => {
    assert.equal(DEFAULT_MODEL, MODELS.HYDROGEN_HIGH);
    assert.equal(DEFAULT_MODEL, "gemini-4-hydrogen-high");
  });
});

describe("suggestAlternatives", () => {
  it("excludes aliases that map to the failed model", () => {
    const suggestions = suggestAlternatives(MODELS.HYDROGEN_HIGH);
    assert.ok(suggestions.length > 0);
    assert.ok(!suggestions.includes("hydrogen"));
    assert.ok(suggestions.includes("argon"));
  });

  it("returns all aliases when the failed model is unknown", () => {
    const suggestions = suggestAlternatives("unknown-model");
    assert.equal(suggestions.length, MODEL_ALIASES.size);
  });
});
