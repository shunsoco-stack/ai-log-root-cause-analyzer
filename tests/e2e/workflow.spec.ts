import { expect, test } from "@playwright/test";

test.describe("AIログ解析・障害原因分析ツール", () => {
  test("3種類のDemoと主要Workflowが動作する", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    for (const demo of [
      "Database Timeout",
      "Frontend JavaScript Error",
      "External API Rate Limit",
    ]) {
      await page.goto("/");
      await page.getByRole("button", { name: new RegExp(demo) }).click();
      await expect(
        page.getByRole("heading", { name: "Incident Analysis" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Error Groups" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Root Cause Analysis" }),
      ).toBeVisible();
      await expect(page.getByText(/events$/).first()).toBeVisible();
    }

    expect(consoleErrors).toEqual([]);
  });

  test("Secret Mask・Evidence jump・AI Failure fallback・Reportが動作する", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    await page.goto("/");
    await page.getByRole("button", { name: /Database Timeout/ }).click();
    await expect(
      page.getByText(/件の機密情報をマスクしました/),
    ).toBeVisible();

    const evidence = page.locator(".evidence-block button").first();
    await expect(evidence).toBeVisible();
    await evidence.click();
    await expect(
      page.getByRole("complementary", { name: "選択中の元ログ" }),
    ).toBeVisible();

    await page.screenshot({
      path: "public/screenshots/desktop-analysis.png",
      fullPage: true,
    });

    await page.getByRole("button", { name: "AI解析を実行" }).click();
    await expect(page.getByText("AI解析を利用できません")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "原因候補" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Markdown Report/ }),
    ).toBeVisible();
  });

  test("390px相当でLog・Analysis・Timelineを切り替えられる", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile");
    await page.goto("/");
    await page.getByRole("button", { name: /Database Timeout/ }).click();
    await expect(
      page.getByRole("heading", { name: "Root Cause Analysis" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Log Viewer" })).toBeVisible();
    await page.getByRole("button", { name: "Timeline", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
    await page.getByRole("button", { name: "Analysis", exact: true }).click();

    await page.screenshot({
      path: "public/screenshots/mobile-analysis.png",
      fullPage: true,
    });
  });
});
