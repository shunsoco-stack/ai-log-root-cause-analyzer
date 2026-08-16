import { describe, expect, it } from "vitest";
import { createLocalAnalysis } from "./analysis";
import { buildDataset } from "./log-engine";
import { buildIncidentReport, buildShareSummary } from "./report";

describe("report export", () => {
  const dataset = buildDataset([
    {
      name: "api.log",
      content:
        "10:00:01 ERROR Database timeout\n10:00:02 ERROR Database timeout",
    },
  ]);
  const analysis = createLocalAnalysis(dataset);

  it("Markdown Incident Reportへ根拠と確認状態を出力する", () => {
    analysis.rootCauseCandidates[0].note = "DB担当へ確認中";
    const report = buildIncidentReport(analysis, dataset);
    expect(report).toContain("# Incident Report");
    expect(report).toContain("api.log:L1");
    expect(report).toContain("DB担当へ確認中");
  });

  it("外部送信せずコピー可能な共有Summaryを生成する", () => {
    const summary = buildShareSummary(analysis);
    expect(summary).toContain("【障害概要】");
    expect(summary).toContain("【次のAction】");
  });
});
