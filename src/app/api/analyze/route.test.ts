import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalKey = process.env.AI_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.AI_API_KEY;
  else process.env.AI_API_KEY = originalKey;
});

describe("POST /api/analyze", () => {
  it("AI未設定時も明示的なエラーを返しローカル結果の利用を案内する", async () => {
    delete process.env.AI_API_KEY;
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sanitizedLog: "10:00:00 ERROR timeout",
        deterministicFacts: {
          totalLogs: 1,
          errorCount: 1,
          warningCount: 0,
          timeSpan: "1秒",
          groups: [],
        },
      }),
    });
    const response = await POST(request);
    const body = (await response.json()) as { code: string; error: string };
    expect(response.status).toBe(503);
    expect(body.code).toBe("AI_NOT_CONFIGURED");
    expect(body.error).toContain("ローカル解析結果");
  });

  it("不正な入力をAI Providerへ渡さない", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({ sanitizedLog: "" }),
    });
    const response = await POST(request);
    const body = (await response.json()) as { code: string };
    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_REQUEST");
  });
});
