import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────
// E2E Tests: Estimate Builder
// Run: pnpm --filter client test:e2e
// Requires: running server + seeded database
// ─────────────────────────────────────────────

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const ADMIN_EMAIL = 'admin@openestimate.local';
const ADMIN_PASSWORD = 'changeme123';

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('[data-testid="email-input"]', ADMIN_EMAIL);
  await page.fill('[data-testid="password-input"]', ADMIN_PASSWORD);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL(`${BASE_URL}/`);
}

test.describe('Estimate Builder', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('navigates to an existing estimate', async ({ page }) => {
    // Navigate to projects
    await page.click('[data-testid="nav-projects"]');
    await page.waitForSelector('[data-testid="project-row"]');

    // Click the first project
    await page.click('[data-testid="project-row"]:first-child');
    await page.waitForSelector('[data-testid="estimates-tab"]');

    // Click estimates tab
    await page.click('[data-testid="estimates-tab"]');
    await page.waitForSelector('[data-testid="estimate-card"]');

    // Open estimate builder
    await page.click('[data-testid="estimate-card"]:first-child');
    await page.waitForSelector('[data-testid="estimate-grid"]');

    expect(page.url()).toContain('/estimates/');
  });

  test('can add a new line item', async ({ page }) => {
    // Navigate to the first estimate
    await page.goto(`${BASE_URL}/projects`);
    await page.click('[data-testid="project-row"]:first-child');
    await page.click('[data-testid="estimates-tab"]');
    await page.click('[data-testid="estimate-card"]:first-child');
    await page.waitForSelector('[data-testid="estimate-grid"]');

    // Click "Add Item" button in first section
    await page.click('[data-testid="add-line-item"]:first-child');

    // A new blank row should appear
    await page.waitForSelector('[data-testid="line-item-row"]:last-child [data-testid="description-cell"]');

    // Type a description
    const newRow = page.locator('[data-testid="line-item-row"]').last();
    await newRow.locator('[data-testid="description-cell"]').click();
    await page.keyboard.type('Test concrete item');
    await page.keyboard.press('Tab');

    // Tab to quantity and enter value
    await page.keyboard.type('10');
    await page.keyboard.press('Tab');

    // Skip unit (already in correct field)
    await page.keyboard.press('Tab');

    // Enter unit material cost
    await page.keyboard.type('150');
    await page.keyboard.press('Tab');

    // Wait for calculated total to update
    await page.waitForTimeout(500);

    // Check total material shows a value
    const totalMaterial = await newRow.locator('[data-testid="total-material-cell"]').textContent();
    expect(totalMaterial).toContain('$');
  });

  test('can add and collapse a section', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);
    await page.click('[data-testid="project-row"]:first-child');
    await page.click('[data-testid="estimates-tab"]');
    await page.click('[data-testid="estimate-card"]:first-child');
    await page.waitForSelector('[data-testid="estimate-grid"]');

    // Count initial sections
    const initialSections = await page.locator('[data-testid="section-header"]').count();

    // Add a new section
    await page.click('[data-testid="add-section-button"]');
    await page.waitForSelector('[data-testid="section-name-input"]');
    await page.fill('[data-testid="section-name-input"]', 'E2E Test Section');
    await page.click('[data-testid="section-name-confirm"]');

    // Section should appear
    await page.waitForSelector(`text=E2E Test Section`);
    const newSectionCount = await page.locator('[data-testid="section-header"]').count();
    expect(newSectionCount).toBe(initialSections + 1);

    // Collapse the section
    await page.click('[data-testid="section-header"]:last-child [data-testid="collapse-toggle"]');
    await expect(page.locator('[data-testid="section-header"]:last-child')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
  });

  test('keyboard navigation: Tab moves between cells', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);
    await page.click('[data-testid="project-row"]:first-child');
    await page.click('[data-testid="estimates-tab"]');
    await page.click('[data-testid="estimate-card"]:first-child');
    await page.waitForSelector('[data-testid="estimate-grid"]');

    // Click first description cell
    const firstRow = page.locator('[data-testid="line-item-row"]').first();
    await firstRow.locator('[data-testid="description-cell"]').click();

    // Tab should move to quantity cell
    await page.keyboard.press('Tab');
    const activeElement = page.locator('[data-testid="quantity-cell"] input');
    await expect(activeElement).toBeFocused();
  });

  test('undo and redo work correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);
    await page.click('[data-testid="project-row"]:first-child');
    await page.click('[data-testid="estimates-tab"]');
    await page.click('[data-testid="estimate-card"]:first-child');
    await page.waitForSelector('[data-testid="estimate-grid"]');

    // Add a line item
    await page.click('[data-testid="add-line-item"]:first-child');
    const newRow = page.locator('[data-testid="line-item-row"]').last();
    await newRow.locator('[data-testid="description-cell"]').click();
    await page.keyboard.type('Item to undo');
    await page.keyboard.press('Enter');

    // Verify item exists
    await expect(page.locator('text=Item to undo')).toBeVisible();

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    // Item should be gone
    await expect(page.locator('text=Item to undo')).not.toBeVisible();

    // Redo
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);

    // Item should be back
    await expect(page.locator('text=Item to undo')).toBeVisible();
  });

  test('grand total updates when line item values change', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);
    await page.click('[data-testid="project-row"]:first-child');
    await page.click('[data-testid="estimates-tab"]');
    await page.click('[data-testid="estimate-card"]:first-child');
    await page.waitForSelector('[data-testid="estimate-grid"]');

    // Get initial grand total
    const initialTotal = await page
      .locator('[data-testid="grand-total-value"]')
      .textContent();

    // Add a line item with a cost
    await page.click('[data-testid="add-line-item"]:first-child');
    const newRow = page.locator('[data-testid="line-item-row"]').last();
    await newRow.locator('[data-testid="description-cell"]').click();
    await page.keyboard.type('Expensive item');
    await page.keyboard.press('Tab'); // qty
    await page.keyboard.type('1');
    await page.keyboard.press('Tab'); // unit
    await page.keyboard.press('Tab'); // unit mat cost
    await page.keyboard.type('50000');
    await page.keyboard.press('Tab'); // unit labor cost

    // Wait for recalculation
    await page.waitForTimeout(500);

    const newTotal = await page.locator('[data-testid="grand-total-value"]').textContent();
    expect(newTotal).not.toBe(initialTotal);
  });

  test('context menu appears on right-click', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);
    await page.click('[data-testid="project-row"]:first-child');
    await page.click('[data-testid="estimates-tab"]');
    await page.click('[data-testid="estimate-card"]:first-child');
    await page.waitForSelector('[data-testid="estimate-grid"]');

    const firstRow = page.locator('[data-testid="line-item-row"]').first();
    if ((await firstRow.count()) > 0) {
      await firstRow.click({ button: 'right' });
      await expect(page.locator('[data-testid="context-menu"]')).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-duplicate"]')).toBeVisible();
      await expect(page.locator('[data-testid="context-menu-delete"]')).toBeVisible();
    }
  });

  test('shortcut help modal opens with ? key', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.keyboard.press('?');
    await expect(page.locator('[data-testid="shortcut-help-modal"]')).toBeVisible();
  });

  test('export dropdown shows export options', async ({ page }) => {
    await page.goto(`${BASE_URL}/projects`);
    await page.click('[data-testid="project-row"]:first-child');
    await page.click('[data-testid="estimates-tab"]');
    await page.click('[data-testid="estimate-card"]:first-child');
    await page.waitForSelector('[data-testid="estimate-grid"]');

    await page.click('[data-testid="export-dropdown-button"]');
    await expect(page.locator('[data-testid="export-proposal-pdf"]')).toBeVisible();
    await expect(page.locator('[data-testid="export-internal-pdf"]')).toBeVisible();
    await expect(page.locator('[data-testid="export-excel"]')).toBeVisible();
    await expect(page.locator('[data-testid="export-csv"]')).toBeVisible();
  });
});

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('loads dashboard with KPI cards', async ({ page }) => {
    await page.waitForSelector('[data-testid="kpi-card"]');
    const kpiCards = await page.locator('[data-testid="kpi-card"]').count();
    expect(kpiCards).toBeGreaterThanOrEqual(4);
  });

  test('shows active bids panel', async ({ page }) => {
    await page.waitForSelector('[data-testid="active-bids-panel"]');
    const panel = page.locator('[data-testid="active-bids-panel"]');
    await expect(panel).toBeVisible();
  });

  test('win/loss chart renders', async ({ page }) => {
    await page.waitForSelector('[data-testid="win-loss-chart"]');
    await expect(page.locator('[data-testid="win-loss-chart"]')).toBeVisible();
  });
});

test.describe('Project Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('creates a new project', async ({ page }) => {
    await page.click('[data-testid="nav-projects"]');
    await page.click('[data-testid="new-project-button"]');

    await page.fill('[data-testid="project-name-input"]', 'E2E Test Project');
    await page.fill('[data-testid="client-name-input"]', 'E2E Test Client');
    await page.click('[data-testid="create-project-submit"]');

    await page.waitForSelector('text=E2E Test Project');
    await expect(page.locator('text=E2E Test Project')).toBeVisible();
  });

  test('can switch to kanban view', async ({ page }) => {
    await page.click('[data-testid="nav-projects"]');
    await page.click('[data-testid="kanban-view-toggle"]');
    await expect(page.locator('[data-testid="kanban-board"]')).toBeVisible();
  });
});
