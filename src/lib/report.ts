import type { AnalysisDataset, AnalysisResult } from "./types";

export function buildIncidentReport(
  result: AnalysisResult,
  dataset: AnalysisDataset,
): string {
  const groups = dataset.groups
    .map(
      (group) =>
        `- ${group.representativeMessage} — ${group.frequencyLabel} (${group.sources.join(", ")})`,
    )
    .join("\n");
  const causes = result.rootCauseCandidates
    .map(
      (candidate, index) =>
        `### 原因候補 ${index + 1}: ${candidate.title}\n\nConfidence: ${candidate.confidence}\n\n${candidate.rationale}\n\n根拠:\n${candidate.evidence.map((item) => `- ${item.citation}: ${item.reason}`).join("\n")}\n\n確認状態: ${candidate.reviewStatus}\n${candidate.note ? `\nメモ: ${candidate.note}` : ""}`,
    )
    .join("\n\n");
  const actions = result.recommendedActions
    .map(
      (action) =>
        `- [${action.status === "確認済み" ? "x" : " "}] **${action.category}**: ${action.action}（${action.status}）`,
    )
    .join("\n");

  return `# Incident Report

## Incident Summary
${result.incidentSummary}

## Time Range
${dataset.timeSpan}

## Impact
- Error Count: ${result.impact.errorCount}
- Services: ${result.impact.services.join(", ") || "ログからは確認できません"}
- Endpoints: ${result.impact.endpoints.join(", ") || "ログからは確認できません"}
- Notes: ${result.impact.notes}

## Error Groups
${groups || "- なし"}

## Root Cause Candidates
${causes || "ログからは確認できません"}

## Investigation Steps
${result.investigationSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

## Recommended Actions
${actions}

## Limitations
${result.limitations.map((item) => `- ${item}`).join("\n")}
`;
}

export function buildShareSummary(result: AnalysisResult): string {
  return `【障害概要】
${result.incidentSummary}

【影響】
${result.impact.notes}

【原因候補】
${result.rootCauseCandidates.map((item) => `・${item.title}（${item.confidence}）`).join("\n")}

【現在確認中】
${result.investigationSteps.map((item) => `・${item}`).join("\n")}

【次のAction】
${result.recommendedActions.map((item) => `・[${item.category}] ${item.action}`).join("\n")}`;
}
