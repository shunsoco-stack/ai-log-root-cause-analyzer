import { describe, expect, it } from "vitest";
import {
  analysisResultSchema,
  createLocalAnalysis,
  parseAnalysisResponse,
  validateCitations,
} from "./analysis";
import { buildDataset, citationFor } from "./log-engine";

const dataset = buildDataset([
  {
    name: "api.log",
    content:
      "10:00:01 ERROR Database connection timeout\n10:00:02 ERROR Database connection timeout\n10:00:03 WARN Retry started",
  },
]);

describe("analysis", () => {
  it("ローカル解析でも原因候補・根拠・件数を生成する", () => {
    const result = createLocalAnalysis(dataset);
    expect(result.impact.errorCount).toBe(2);
    expect(result.rootCauseCandidates[0].title).toContain("データベース");
    expect(result.rootCauseCandidates[0].evidence[0].citation).toBe(
      "api.log:L1",
    );
  });

  it("Structured AI Outputをschema validationする", () => {
    const valid = createLocalAnalysis(dataset);
    expect(analysisResultSchema.safeParse(valid).success).toBe(true);
    expect(
      analysisResultSchema.safeParse({ incidentSummary: "incomplete" }).success,
    ).toBe(false);
  });

  it("存在しないcitationと不一致citationを除外する", () => {
    const result = createLocalAnalysis(dataset);
    result.rootCauseCandidates[0].evidence.push({
      entryId: "missing.log:L999",
      citation: "missing.log:L999",
      reason: "invalid",
    });
    result.rootCauseCandidates[0].evidence.push({
      entryId: dataset.entries[0].id,
      citation: "api.log:L999",
      reason: "mismatch",
    });
    const validated = validateCitations(result, dataset.entries);
    expect(validated.rootCauseCandidates[0].evidence).toHaveLength(2);
    expect(
      validated.rootCauseCandidates[0].evidence.every(
        (item) =>
          item.citation ===
          citationFor(
            dataset.entries.find((entry) => entry.id === item.entryId)!,
          ),
      ),
    ).toBe(true);
  });

  it("AI解析レスポンスをschemaとcitationの両方で検証する", () => {
    const response = createLocalAnalysis(dataset);
    const parsed = parseAnalysisResponse(response, dataset.entries);
    expect(parsed.rootCauseCandidates[0].evidence.length).toBeGreaterThan(0);
  });
});
