import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { chromium } from 'playwright'
import { preview } from 'vite'

describe('stock management in the browser', () => {
  let server
  let browser
  let context
  let page

  before(async () => {
    server = await preview({
      configFile: 'config/vite.config.ts',
      preview: { host: '127.0.0.1', port: 5180, strictPort: true },
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
    await page.goto('http://127.0.0.1:5180')
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Medicines', exact: true }).click()
    await page
      .getByRole('heading', { name: 'Medicines', exact: true })
      .waitFor()
  })

  afterEach(async () => {
    await context?.close()
  })

  async function addMedicine(name) {
    await page.getByRole('button', { name: 'Add medicine' }).click()
    await page.getByLabel('Medicine name').fill(name)
    await page.getByLabel('Unit', { exact: true }).selectOption('tablet')
    await page.getByLabel('Frequency').selectOption('daily')
    await page.getByLabel('Starting stock (tablets)').fill('30')
    await page.getByLabel('Dose quantity (tablets)').fill('1')
    await page.getByLabel('Meal window').selectOption('after-lunch')
    await page.getByRole('button', { name: 'Save medicine' }).click()
    await page.getByRole('heading', { name, exact: true }).waitFor()
  }

  it('records a refill, shows the ledger entry, and keeps it after reload', async () => {
    await addMedicine('E2E refill medicine')
    await page
      .getByRole('button', { name: 'Refill stock for E2E refill medicine' })
      .click()
    await page.getByLabel('Refill quantity (tablets)').fill('12.5')
    await page.getByLabel('Refill note (optional)').fill('Pharmacy refill')
    await page.getByRole('button', { name: 'Record refill' }).click()

    await page.getByText('Stock refill recorded.', { exact: true }).waitFor()
    await page
      .getByText('42.5 tablets recorded stock', { exact: true })
      .waitFor()
    await page.getByText('About 42.5 days of supply').waitFor()
    await page
      .getByText('Low stock', { exact: true })
      .count()
      .then((count) => {
        assert.equal(count, 0)
      })

    await page.getByText('Stock history (2)', { exact: true }).click()
    await page.getByText('Refill · +12.5 tablets', { exact: true }).waitFor()
    await page.getByText('Reason: Pharmacy refill', { exact: true }).waitFor()
    await page.reload()
    await page.getByRole('heading', { name: 'E2E refill medicine' }).waitFor()
    await page
      .getByText('42.5 tablets recorded stock', { exact: true })
      .waitFor()
    await page.getByText('Stock history (2)', { exact: true }).waitFor()
  })

  it('blocks a negative reconciliation and persists a reasoned adjustment', async () => {
    await addMedicine('E2E adjustment medicine')
    await page
      .getByRole('button', { name: 'Adjust stock for E2E adjustment medicine' })
      .click()
    const quantity = page.getByLabel(
      'Adjustment quantity (tablets; use a minus sign to remove stock)',
    )
    const reason = page.getByLabel('Adjustment reason')
    await quantity.fill('-31')
    await reason.fill('Count correction')
    await page.getByRole('button', { name: 'Save adjustment' }).click()
    await page
      .getByRole('alert')
      .getByText('An adjustment cannot make stock negative.')
      .waitFor()
    await page.getByText('30 tablets recorded stock', { exact: true }).waitFor()

    await quantity.fill('-2')
    await reason.fill('Damaged tablets')
    await page.getByRole('button', { name: 'Save adjustment' }).click()
    await page
      .getByText('Stock adjustment recorded.', { exact: true })
      .waitFor()
    await page.getByText('28 tablets recorded stock', { exact: true }).waitFor()
    await page.getByText('Stock history (2)', { exact: true }).click()
    await page.getByText('Adjustment · −2 tablets', { exact: true }).waitFor()
    await page.getByText('Reason: Damaged tablets', { exact: true }).waitFor()
  })
})
