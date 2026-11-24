const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.cashwiseReady);
});

test("loads dashboard and navigation pages", async ({ page }) => {
  await expect(page.locator("#page-home")).toBeVisible();
  await page.getByRole("button", { name: /Wallet/ }).click();
  await expect(page.locator("#page-wallet")).toBeVisible();
  await page.getByRole("button", { name: /Savings/ }).click();
  await expect(page.locator("#page-savings")).toBeVisible();
  await page.getByRole("button", { name: /History/ }).click();
  await expect(page.locator("#page-history")).toBeVisible();
  await page.getByRole("button", { name: /Settings/ }).click();
  await expect(page.locator("#page-settings")).toBeVisible();
});

test("records income and expense and persists after reload", async ({ page }) => {
  await page.locator('[data-action="income"]').first().click();
  await page.locator("#f_amount").fill("100000");
  await page.locator("#f_note").fill("Uang saku");
  await page.locator("#entryForm button[type=submit]").click();
  await expect(page.locator("#totalBalance")).toContainText("100.000");

  await page.locator('[data-action="expense"]').first().click();
  await page.locator("#f_amount").fill("25000");
  await page.locator("#f_note").fill("Makan");
  await page.locator("#entryForm button[type=submit]").click();
  await expect(page.locator("#totalBalance")).toContainText("75.000");

  await page.reload();
  await expect(page.locator("#totalBalance")).toContainText("75.000");
  await expect(page.locator("#recentTransactions")).toContainText("Makan");
});

test("goal allocation changes available balance but not total balance", async ({ page }) => {
  await page.locator('[data-action="income"]').first().click();
  await page.locator("#f_amount").fill("200000");
  await page.locator("#f_note").fill("Pemasukan");
  await page.locator("#entryForm button[type=submit]").click();

  await page.locator('[data-go="savings"]').first().click();
  await page.locator("#addGoalBtn").click();
  await page.locator("#f_name").fill("Laptop");
  await page.locator("#f_type").selectOption("purchase");
  await page.locator("#f_target").fill("500000");
  await page.locator("#entryForm button[type=submit]").click();

  await page.locator('[data-go="wallet"]').first().click();
  await page.locator('[data-action="allocate"]').click();
  await page.locator("#f_amount").fill("50000");
  await page.locator("#entryForm button[type=submit]").click();
  await expect(page.locator("#walletTotal")).toContainText("200.000");
  await expect(page.locator("#walletAvailable")).toContainText("150.000");
  await expect(page.locator("#walletAllocated")).toContainText("50.000");
});

test("blocks expense that exceeds available balance", async ({ page }) => {
  await page.locator('[data-action="income"]').first().click();
  await page.locator("#f_amount").fill("10000");
  await page.locator("#f_note").fill("Pemasukan kecil");
  await page.locator("#entryForm button[type=submit]").click();

  await page.locator('[data-action="expense"]').first().click();
  await page.locator("#f_amount").fill("20000");
  await page.locator("#f_note").fill("Belanja");
  await page.locator("#entryForm button[type=submit]").click();
  await expect(page.locator("#formError")).toContainText("Saldo tersedia tidak mencukupi");
  await expect(page.locator("#formDialog")).toBeVisible();
});

test("theme preference can be changed and saved", async ({ page }) => {
  await page.locator('[data-go="settings"]').first().click();
  await page.locator("#themeSelect").selectOption("light");
  await expect(page.locator("body")).toHaveClass(/light/);
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/light/);
});
test("purchase goal converts allocated savings into an expense", async ({ page }) => {
  await page.locator('[data-action="income"]').first().click();
  await page.locator("#f_amount").fill("300000");
  await page.locator("#f_note").fill("Uang masuk");
  await page.locator("#entryForm button[type=submit]").click();

  await page.locator('[data-go="savings"]').first().click();
  await page.locator("#addGoalBtn").click();
  await page.locator("#f_name").fill("Headset");
  await page.locator("#f_type").selectOption("purchase");
  await page.locator("#f_target").fill("100000");
  await page.locator("#entryForm button[type=submit]").click();

  await page.locator('[data-go="wallet"]').first().click();
  await page.locator('[data-action="allocate"]').click();
  await page.locator("#f_amount").fill("100000");
  await page.locator("#entryForm button[type=submit]").click();

  page.on("dialog", async dialog => dialog.accept());
  await page.locator('[data-go="savings"]').first().click();
  await page.locator("[data-goal-menu]").first().click();
  await page.locator("[data-goal-action=\"purchase\"]").click();
  await expect(page.locator("#totalBalance")).toContainText("200.000");
  await expect(page.locator("#recentTransactions")).toContainText("Pembelian");
});

test("exports a JSON backup file", async ({ page }) => {
  await page.locator('[data-go="settings"]').first().click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportBtn").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^cashwise-backup-.*\.json$/);
});
