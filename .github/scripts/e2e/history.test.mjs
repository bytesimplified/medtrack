import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { chromium } from 'playwright'
import { preview } from 'vite'

describe('medicine, dose, and history journey', () => {
  let server
  let browser
  let context
  let page

  before(async () => {
    server = await preview({
      preview: { host: '127.0.0.1', port: 5182, strictPort: true },
    })
    browser = await chromium.launch({ headless: true })
  })

  after(async () => {
    await browser?.close()
    if (server) await new Promise((resolve) => server.httpServer.close(resolve))
  })

  beforeEach(async () => {
    context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    })
    page = await context.newPage()
    await page.goto('http://127.0.0.1:5182')
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Medicines', exact: true }).click()
    await page
      .getByRole('heading', { name: 'Medicines', exact: true })
      .waitFor()
  })

  afterEach(async () => {
    await context?.close()
  })

  async function addMedicineWithTwoDoses(name) {
    await page.getByRole('button', { name: 'Add medicine' }).click()
    await page.getByLabel('Medicine name').fill(name)
    await page.getByLabel('Unit', { exact: true }).selectOption('tablet')
    await page.getByLabel('Frequency').selectOption('daily')
    await page.getByLabel('Starting stock (tablets)').fill('30')
    await page.getByLabel('Dose quantity (tablets)').first().fill('1')
    await page.getByLabel('Meal window').selectOption('after-lunch')
    await page.getByRole('button', { name: 'Add dose time' }).click()
    await page.getByLabel('Dose quantity (tablets)').nth(1).fill('0.5')
    await page.getByLabel('Timing for dose 2').selectOption('custom')
    await page.getByLabel('Custom time').fill('20:00')
    await page.getByRole('button', { name: 'Save medicine' }).click()
    await page.getByRole('heading', { name, exact: true }).waitFor()
  }

  it('keeps taken and skipped history with audit events after archiving', async () => {
    const medicineName = 'E2E history medicine'
    await addMedicineWithTwoDoses(medicineName)
    await page.getByRole('link', { name: 'Today', exact: true }).click()

    const doses = page.locator('.today-dose')
    await doses.first().waitFor()
    assert.equal(await doses.count(), 2)
    await doses.nth(0).getByRole('button', { name: /^Take/ }).click()
    await page.getByText('Dose marked taken.', { exact: true }).waitFor()
    await page
      .getByText('29 tablets recorded stock', { exact: true })
      .first()
      .waitFor()
    await doses.nth(1).getByRole('button', { name: /^Skip/ }).click()
    await page.getByText('Dose marked skipped.', { exact: true }).waitFor()
    await page.getByText('2 of 2 complete', { exact: true }).waitFor()
    await page
      .getByText('29 tablets recorded stock', { exact: true })
      .first()
      .waitFor()

    await page.getByRole('link', { name: 'Insights', exact: true }).click()
    await page.getByRole('heading', { name: 'Insights', exact: true }).waitFor()
    const summary = page.getByLabel('Monthly summary')
    await summary.getByText('50%', { exact: true }).waitFor()
    assert.equal(await summary.getByText('Taken', { exact: true }).count(), 1)
    assert.equal(await summary.getByText('Skipped', { exact: true }).count(), 1)

    const today = page.getByRole('button', {
      name: /1 taken, 1 skipped, 0 unconfirmed/,
    })
    await today.waitFor()
    await today.click()
    assert.equal(
      await page.getByRole('heading', { name: medicineName }).count(),
      2,
    )
    const takenHistory = page
      .locator('.history-dose')
      .filter({ hasText: 'Taken' })
      .first()
    await takenHistory
      .getByText('History and corrections (1)', { exact: true })
      .click()
    await page.getByText('Marked taken', { exact: true }).waitFor()

    await page.getByRole('link', { name: 'Medicines', exact: true }).click()
    await page.getByRole('button', { name: 'Archive', exact: true }).click()
    await page.getByText('Archived', { exact: true }).waitFor()
    await page.reload()
    await page
      .getByRole('heading', { name: 'Medicines', exact: true })
      .waitFor()
    await page.getByText('Archived', { exact: true }).waitFor()

    await page.getByRole('link', { name: 'Insights', exact: true }).click()
    await page.getByRole('combobox', { name: 'Medicine' }).selectOption({
      label: `${medicineName} (archived)`,
    })
    await page
      .locator('.history-dose')
      .filter({ hasText: 'Taken' })
      .first()
      .getByText('History and corrections (1)', { exact: true })
      .waitFor()
    await page.reload()
    await page.getByRole('heading', { name: 'Insights', exact: true }).waitFor()
    await page.getByRole('combobox', { name: 'Medicine' }).selectOption({
      label: `${medicineName} (archived)`,
    })
    await page
      .getByRole('button', {
        name: /1 taken, 1 skipped, 0 unconfirmed/,
      })
      .waitFor()
    const takenHistoryAfterReload = page
      .locator('.history-dose')
      .filter({ hasText: 'Taken' })
      .first()
    await takenHistoryAfterReload
      .getByText('History and corrections (1)', { exact: true })
      .click()
    await page.getByText('Marked taken', { exact: true }).waitFor()
  })
})
