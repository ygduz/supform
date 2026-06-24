/**
 * Supform end-to-end smoke test.
 *
 * Covers the full owner + respondent loop:
 *   create form → add fields → publish → fill as respondent → check responses
 *
 * Run:
 *   node e2e/smoke.mjs
 *
 * Requires the full stack to be running:
 *   backend  → http://localhost:8000
 *   frontend → http://localhost:5173
 *
 * Environment (optional overrides):
 *   E2E_EMAIL     default: e2e-smoke@example.com
 *   E2E_PASSWORD  default: SmokePass123!
 *   E2E_BASE      default: http://localhost:5173
 *   E2E_API       default: http://localhost:8000
 */

import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE   = process.env.E2E_BASE     ?? 'http://localhost:5173';
const API    = process.env.E2E_API      ?? 'http://localhost:8000';
const EMAIL  = process.env.E2E_EMAIL    ?? 'e2e-smoke@example.com';
const PASS   = process.env.E2E_PASSWORD ?? 'SmokePass123!';
const EXEC   = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// ── helpers ────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const findings = [];

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

function finding(msg) {
  findings.push(msg);
  console.warn(`  ⚠️  ${msg}`);
}

async function waitForBackend() {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return;
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Backend did not become ready');
}

// ── main ───────────────────────────────────────────────────────────────────

await waitForBackend();
console.log('✓ backend healthy\n');

// Ensure test account exists (signup is idempotent — ignore duplicate errors)
try {
  await fetch(`${API}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
} catch { /* ignore */ }

const br = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });

// ── SECTION 1: Owner flow (desktop) ───────────────────────────────────────
console.log('=== Section 1: Owner flow (desktop) ===');
{
  const ctx  = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  // 1.1 Login
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(400);
  assert('auth card rendered', await page.locator('.auth-card').count() > 0);
  assert('Supform brand present', await page.locator('.auth-brand').innerText().then(t => t === 'Supform').catch(() => false));

  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASS);
  await page.click('.auth-submit');
  await page.waitForTimeout(1500);
  assert('login → /forms', page.url().includes('/forms'));

  // 1.2 Builder — create new form
  await page.goto(`${BASE}/builder/new`);
  await page.waitForTimeout(900);
  assert('canvas pre-seeded with one element', await page.locator('.el-card, [data-element-type]').count() >= 1);
  assert('hint strip shown', await page.locator('.builder-hint').count() > 0);

  // set title
  await page.locator('.title-input').fill('E2E Household Survey');

  // add Email field
  const emailPalette = page.locator(`.palette-item:has-text("Email")`).first();
  if (await emailPalette.count()) {
    await emailPalette.click();
    await page.waitForTimeout(300);
  }

  // add Number field
  const numPalette = page.locator(`.palette-item:has-text("Number")`).first();
  if (await numPalette.count()) {
    await numPalette.click();
    await page.waitForTimeout(300);
  }

  // add Single choice field
  const choicePalette = page.locator(`.palette-item:has-text("Single choice")`).first();
  if (await choicePalette.count()) {
    await choicePalette.click();
    await page.waitForTimeout(300);
  }

  const fieldCount = await page.locator('.el-card, [data-element-type]').count();
  assert('≥4 fields on canvas (seeded + 3 added)', fieldCount >= 4, `got ${fieldCount}`);

  // 1.3 Keyboard shortcut modal
  await page.keyboard.press('?');
  await page.waitForTimeout(300);
  assert('shortcuts modal opens on ?', await page.locator('.shortcuts-list').count() > 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 1.4 Save draft
  await page.locator('button:has-text("Save draft")').first().click();
  await page.waitForTimeout(1500);
  const saveState = await page.locator('.save-status').getAttribute('data-state').catch(() => null);
  assert('save status → saved or saving', saveState === 'saved' || saveState === 'saving', `data-state=${saveState}`);
  const formId = (page.url().match(/builder\/([0-9a-f-]{36})/) ?? [])[1];
  assert('form id in URL after save', !!formId, page.url());

  // 1.5 Publish
  await page.locator('button:has-text("Publish")').first().click();
  await page.waitForTimeout(600);
  const confirmBtn = page.locator('.modal-box button:has-text("Publish"), button:has-text("Confirm")').first();
  if (await confirmBtn.count()) {
    await confirmBtn.click();
    await page.waitForTimeout(1200);
  }

  // 1.6 Form context nav — responses tab
  await page.goto(`${BASE}/forms/${formId}/responses`);
  await page.waitForTimeout(1200);
  assert('FormContextNav present', await page.locator('.form-context-nav').count() > 0);
  assert('"Responses" tab active', await page.locator('.form-context-tabs a.active').innerText().then(t => t.includes('Responses')).catch(() => false));

  // 1.7 Empty-state share CTA
  assert('empty state copy-link CTA', await page.locator('.empty-state-action button').count() > 0);

  const ownerErrors = errs.filter(e => !e.includes('401') && !e.includes('redis'));
  if (ownerErrors.length) finding(`owner page errors: ${ownerErrors.join(' | ')}`);
  else assert('no unexpected console errors (owner)', true);

  await ctx.close();

  // expose formId for later sections
  globalThis._formId = formId;
}

// ── SECTION 2: Respondent flow (mobile) ────────────────────────────────────
console.log('\n=== Section 2: Respondent flow (mobile) ===');
{
  const formId = globalThis._formId;
  if (!formId) {
    finding('Section 2 skipped — no form id from Section 1');
  } else {
    const mctx  = await br.newContext({ ...devices['iPhone 13'] });
    const rpage = await mctx.newPage();
    const rerrs = [];
    rpage.on('pageerror', e => rerrs.push(e.message));

    await rpage.goto(`${BASE}/f/${formId}`);
    await rpage.waitForTimeout(1500);

    // 2.1 Form renders
    assert('renderer loads on mobile', await rpage.locator('.form-renderer, form, .renderer').count() > 0);

    // 2.2 inputMode hints on email field
    const emailInput = rpage.locator('input[type=email]').first();
    if (await emailInput.count()) {
      const im = await emailInput.getAttribute('inputmode');
      const ac = await emailInput.getAttribute('autocomplete');
      assert('email inputmode=email', im === 'email', `got ${im}`);
      assert('email autocomplete=email', ac === 'email', `got ${ac}`);
    } else {
      finding('no email input found on renderer (form may not have email field visible)');
    }

    // 2.3 Number field inputmode
    const numInput = rpage.locator('input[type=number]').first();
    if (await numInput.count()) {
      const im = await numInput.getAttribute('inputmode');
      assert('number inputmode=numeric or decimal', im === 'numeric' || im === 'decimal', `got ${im}`);
    }

    // 2.4 Trust note
    assert('trust note present', await rpage.locator('.form-trust-note').count() > 0);

    // 2.5 Fill and submit
    const emailFill = rpage.locator('input[type=email]').first();
    if (await emailFill.count()) {
      await emailFill.fill('respondent@example.com');
    }
    const numFill = rpage.locator('input[type=number]').first();
    if (await numFill.count()) {
      await numFill.fill('42');
    }
    // pick first radio/checkbox if any
    const firstChoice = rpage.locator('input[type=radio], input[type=checkbox]').first();
    if (await firstChoice.count()) {
      await firstChoice.check().catch(() => {});
    }

    const submitBtn = rpage.locator('button[type=submit], button:has-text("Submit")').first();
    if (await submitBtn.count()) {
      await submitBtn.click();
      await rpage.waitForTimeout(1500);
      // confirmation screen
      const confirmed = await rpage.locator('.confirmation, .thank-you, h2:has-text("Thank")').count() > 0
        || rpage.url().includes('thank');
      assert('confirmation shown after submit', confirmed);
    } else {
      finding('submit button not found — form may require navigation steps');
    }

    const respondentErrors = rerrs.filter(e => !e.includes('401'));
    if (respondentErrors.length) finding(`respondent errors: ${respondentErrors.join(' | ')}`);
    else assert('no unexpected console errors (respondent)', true);

    await mctx.close();
  }
}

// ── SECTION 3: Verify response appeared ────────────────────────────────────
console.log('\n=== Section 3: Response recorded ===');
{
  const formId = globalThis._formId;
  if (!formId) {
    finding('Section 3 skipped — no form id');
  } else {
    const ctx  = await br.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();

    // Re-login (new context, no cookies)
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(400);
    await page.fill('input[type=email]', EMAIL);
    await page.fill('input[type=password]', PASS);
    await page.click('.auth-submit');
    await page.waitForTimeout(1500);

    await page.goto(`${BASE}/forms/${formId}/responses`);
    await page.waitForTimeout(1200);

    // Click Table tab
    const tableTab = page.locator('.tab:has-text("Table")');
    if (await tableTab.count()) {
      await tableTab.click();
      await page.waitForTimeout(600);
      const rowCount = await page.locator('.responses-table tbody tr').count();
      assert('≥1 response row after submit', rowCount >= 1, `got ${rowCount}`);

      // 3.1 Status badge
      if (rowCount >= 1) {
        const statusSel = page.locator('.status-select').first();
        assert('status-select rendered as pill badge', await statusSel.count() > 0);

        // 3.2 Row actions hidden initially, visible on hover
        const row = page.locator('.responses-table tbody tr').first();
        const actionsBefore = await row.locator('.row-actions').evaluate(el =>
          window.getComputedStyle(el).opacity
        ).catch(() => '1');
        assert('row actions hidden before hover', actionsBefore === '0' || actionsBefore < 0.5, `opacity=${actionsBefore}`);

        await row.hover();
        await page.waitForTimeout(200);
        const actionsAfter = await row.locator('.row-actions').evaluate(el =>
          parseFloat(window.getComputedStyle(el).opacity)
        ).catch(() => 0);
        assert('row actions visible on hover', actionsAfter > 0.5, `opacity=${actionsAfter}`);

        // 3.3 Edit modal (shared Modal)
        const editBtn = row.locator('button:has-text("Edit")');
        if (await editBtn.count()) {
          await editBtn.click();
          await page.waitForTimeout(600);
          assert('shared Modal opens (modal-box)', await page.locator('.modal-box').count() > 0);
          assert('bespoke edit-overlay gone', await page.locator('.edit-overlay').count() === 0);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          assert('Modal closes on Escape', await page.locator('.modal-box').count() === 0);
        }
      }
    }

    await ctx.close();
  }
}

// ── Results ────────────────────────────────────────────────────────────────
await br.close();
console.log('\n' + '─'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (findings.length) {
  console.log('\nFindings:');
  for (const f of findings) console.log(`  ⚠️  ${f}`);
}
console.log('─'.repeat(50));
process.exit(failed > 0 ? 1 : 0);
