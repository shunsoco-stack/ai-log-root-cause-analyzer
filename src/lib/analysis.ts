import { z } from "zod";
import { citationFor } from "./log-engine";
import type {
  AnalysisDataset,
  AnalysisResult,
  ErrorGroup,
  LogEntry,
  RootCauseCandidate,
} from "./types";

const evidenceSchema = z.object({
  entryId: z.string(),
  citation: z.string(),
  reason: z.string(),
});

const candidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  confidence: z.enum(["High", "Medium", "Low"]),
  rationale: z.string(),
  evidence: z.array(evidenceSchema),
  reviewStatus: z
    .enum(["未確認", "確認済み", "対応候補", "対象外"])
    .default("未確認"),
  note: z.string().default(""),
});

export const analysisResultSchema = z.object({
  incidentSummary: z.string(),
  severity: z.enum(["Critical", "High", "Medium", "Low"]),
  impact: z.object({
    services: z.array(z.string()),
    endpoints: z.array(z.string()),
    errorCount: z.number().int().nonnegative(),
    duration: z.string(),
    notes: z.string(),
  }),
  rootCauseCandidates: z.array(candidateSchema),
  investigationSteps: z.array(z.string()),
  recommendedActions: z.array(
    z.object({
      category: z.enum(["Immediate", "Short-term", "Preventive"]),
      action: z.string(),
      status: z
        .enum(["未確認", "確認済み", "対応候補", "対象外"])
        .default("未確認"),
    }),
  ),
  limitations: z.array(z.string()),
});

export function validateCitations(
  result: AnalysisResult,
  entries: LogEntry[],
): AnalysisResult {
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  return {
    ...result,
    rootCauseCandidates: result.rootCauseCandidates.map((candidate) => ({
      ...candidate,
      evidence: candidate.evidence.filter((evidence) => {
        const entry = entryMap.get(evidence.entryId);
        return entry && evidence.citation === citationFor(entry);
      }),
    })),
  };
}

function evidenceFor(
  group: ErrorGroup,
  entries: LogEntry[],
  reason: string,
  limit = 3,
) {
  return group.entryIds.slice(0, limit).flatMap((entryId) => {
    const entry = entries.find((item) => item.id === entryId);
    return entry
      ? [{ entryId, citation: citationFor(entry), reason }]
      : [];
  });
}

function candidateFromGroup(
  group: ErrorGroup,
  entries: LogEntry[],
  index: number,
): RootCauseCandidate {
  const message = group.representativeMessage;
  const lower = message.toLowerCase();
  let title = "ログ内で繰り返されているエラーパターン";
  let rationale = `${message} が${group.count}回記録されています。設定・依存先・直前イベントの確認が必要です。`;

  if (/pool exhausted|connection timeout|database|db timeout/.test(lower)) {
    title = "データベース接続枯渇または接続遅延";
    rationale =
      "接続タイムアウトまたはプール枯渇を示すログが反復し、その後のリクエスト失敗と時系列上で近接しています。";
  } else if (/typeerror|undefined|null is not|cannot read/.test(lower)) {
    title = "フロントエンドの未定義値アクセス";
    rationale =
      "TypeErrorとスタックトレースが確認されました。APIレスポンスとコンポーネントのnull処理を確認する必要があります。";
  } else if (/429|rate limit|too many requests/.test(lower)) {
    title = "外部APIのレート制限到達";
    rationale =
      "HTTP 429またはRate Limitログが反復し、RetryやQueue増加と関連しています。";
  }

  return {
    id: `candidate-${index + 1}`,
    title,
    confidence: group.count >= 3 ? "High" : group.count > 1 ? "Medium" : "Low",
    rationale,
    evidence: evidenceFor(group, entries, "同一パターンの代表ログ"),
    reviewStatus: "未確認",
    note: "",
  };
}

function extractServices(entries: LogEntry[]): string[] {
  const sources = entries
    .filter((entry) => entry.level === "ERROR")
    .map((entry) => entry.source.replace(/\.(?:log|txt|json)$/i, ""));
  return [...new Set(sources)];
}

function extractEndpoints(entries: LogEntry[]): string[] {
  const endpoints = entries.flatMap((entry) => {
    const matches = entry.message.match(/\b(?:GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/g);
    return matches?.map((match) => match.split(/\s+/)[1]) ?? [];
  });
  return [...new Set(endpoints)];
}

export function createLocalAnalysis(dataset: AnalysisDataset): AnalysisResult {
  const errorCount = dataset.entries.filter(
    (entry) => entry.level === "ERROR",
  ).length;
  const topGroup = dataset.groups[0];
  const firstError = dataset.entries.find((entry) => entry.level === "ERROR");
  const summary = topGroup
    ? `${firstError?.timestamp ?? "時刻不明"}頃から「${topGroup.representativeMessage}」が${topGroup.count}回発生しています。`
    : "解析可能なERRORまたはWARNログは確認できませんでした。";

  return {
    incidentSummary: summary,
    severity: errorCount >= 20 ? "High" : errorCount >= 5 ? "Medium" : "Low",
    impact: {
      services: extractServices(dataset.entries),
      endpoints: extractEndpoints(dataset.entries),
      errorCount,
      duration: dataset.timeSpan,
      notes:
        errorCount > 0
          ? "ログに記録された範囲のみを集計しています。実利用者への影響は別途確認が必要です。"
          : "ログからは影響を確認できません。",
    },
    rootCauseCandidates: dataset.groups
      .slice(0, 3)
      .map((group, index) =>
        candidateFromGroup(group, dataset.entries, index),
      ),
    investigationSteps: [
      "最初のERROR直前にあるWARN・設定変更・デプロイ記録を確認する",
      "最多エラーグループの依存先とタイムアウト設定を確認する",
      "同じRequest IDまたはTrace IDの前後ログを追跡する",
    ],
    recommendedActions: [
      {
        category: "Immediate",
        action: "影響中のエンドポイントと依存サービスの状態を確認する",
        status: "未確認",
      },
      {
        category: "Short-term",
        action: "再現条件とエラー発生頻度を監視項目へ追加する",
        status: "未確認",
      },
      {
        category: "Preventive",
        action: "失敗経路の構造化ログと相関IDを拡充する",
        status: "未確認",
      },
    ],
    limitations: [
      "ローカル解析結果です。原因候補は確認作業を代替しません。",
      "ログに存在しないデプロイ履歴やシステム構成は推測していません。",
    ],
  };
}

export function parseAnalysisResponse(
  value: unknown,
  entries: LogEntry[],
): AnalysisResult {
  return validateCitations(analysisResultSchema.parse(value), entries);
}
