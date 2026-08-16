import { z } from "zod";
import { getAiProvider } from "@/lib/ai-provider";

const requestSchema = z.object({
  sanitizedLog: z.string().min(1).max(500_000),
  deterministicFacts: z.object({
    totalLogs: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    timeSpan: z.string(),
    groups: z.array(
      z.object({
        id: z.string(),
        message: z.string(),
        count: z.number().int().nonnegative(),
        evidence: z.array(
          z.object({ entryId: z.string(), citation: z.string() }),
        ),
      }),
    ),
  }),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const provider = getAiProvider();
    if (!provider) {
      return Response.json(
        {
          error:
            "AI Providerが未設定です。ローカル解析結果は引き続き利用できます。",
          code: "AI_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const result = await provider.analyze(input);
    const validEvidence = new Map(
      input.deterministicFacts.groups.flatMap((group) =>
        group.evidence.map((item) => [item.entryId, item.citation] as const),
      ),
    );

    const validated = {
      ...result,
      impact: {
        ...result.impact,
        errorCount: input.deterministicFacts.errorCount,
        duration: input.deterministicFacts.timeSpan,
      },
      rootCauseCandidates: result.rootCauseCandidates.map((candidate) => ({
        ...candidate,
        evidence: candidate.evidence.filter(
          (item) => validEvidence.get(item.entryId) === item.citation,
        ),
      })),
    };

    return Response.json({ result: validated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "解析データの形式が不正です。", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /429|rate limit/i.test(message) ? 429 : 502;
    return Response.json(
      {
        error:
          status === 429
            ? "AI Providerのレート制限に達しました。時間をおいて再試行してください。"
            : "AI解析に失敗しました。ローカル解析結果は保持されています。",
        code: status === 429 ? "AI_RATE_LIMIT" : "AI_FAILURE",
      },
      { status },
    );
  }
}
