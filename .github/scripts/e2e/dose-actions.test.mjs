import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { chromium } from 'playwright'
import { preview } from 'vite'

describe('dose actions and correction history', () => {
  let server
  let browser
  let context
  let page

  before(async () => {
    server = await preview({
      preview: { host: '127.0.0.1', port: 5183, strictPort: true },
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
    await page.goto('http://127.0.0.1:5183')
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Medicines', exact: true }).click()
    await page
      .getByRole('heading', { name: 'Medicines', exact: true })
      .waitFor()
    await page.getByRole('button', { name: 'Add medicine' }).click()
    await page.getByLabel('Medicine name').fill('E2E action medicine')
    await page.getByLabel('Unit', { exact: true }).selectOption('tablet')
    await page.getByLabel('Frequency').selectOption('daily')
    await page.getByLabel('Starting stock (tablets)').fill('5')
    await page.getByLabel('Dose quantity (tablets)').fill('1')
    await page.getByLabel('Timing for dose 1').selectOption('custom')
    await page.getByLabel('Custom time').fill('23:59')
    await page.getByRole('button', { name: 'Save medicine' }).click()
    await page
      .getByRole('heading', { name: 'E2E action medicine', exact: true })
      .waitFor()
  })

  afterEach(async () => {
    await context?.close()
  })

  it('keeps stock safe through Take, Undo, Later, Skip, and another Undo', async () => {
    await page.getByRole('link', { name: 'Today', exact: true }).click()
    const dose = page.locator('.today-dose').first()
    await dose.waitFor()

    await dose.getByRole('button', { name: /^Take/ }).click()
    await page.getByText('Dose marked taken.', { exact: true }).waitFor()
    await page
      .getByText('4 tablets recorded stock', { exact: true })
      .first()
      .waitFor()

    await dose.getByRole('button', { name: /^Undo/ }).click()
    await page.getByText('Dose action undone.', { exact: true }).waitFor()
    await page
      .getByText('5 tablets recorded stock', { exact: true })
      .first()
      .waitFor()

    await dose.getByRole('button', { name: /^Move/ }).click()
    await page.getByText('Dose moved later.', { exact: true }).waitFor()
    await page
      .getByText('5 tablets recorded stock', { exact: true })
      .first()
      .waitFor()

    await dose.getByRole('button', { name: /^Skip/ }).click()
    await page.getByText('Dose marked skipped.', { exact: true }).waitFor()
    await page
      .getByText('5 tablets recorded stock', { exact: true })
      .first()
      .waitFor()

    await dose.getByRole('button', { name: /^Undo/ }).click()
    await page.getByText('Dose action undone.', { exact: true }).waitFor()
    await page
      .getByText('5 tablets recorded stock', { exact: true })
      .first()
      .waitFor()
    await page.getByText('0 of 1 complete', { exact: true }).waitFor()

    await page.getByRole('link', { name: 'Insights', exact: true }).click()
    await page.getByRole('heading', { name: 'Insights', exact: true }).waitFor()
    const today = page.locator('.calendar-day').filter({ hasText: 'Today' })
    await today.waitFor()
    await today.click()
    await page.getByText('Pending today', { exact: true }).waitFor()
    await page.getByText('History and corrections (5)', { exact: true }).click()
    await page.getByText('Action undone', { exact: true }).waitFor()
    await page.getByText('Reminder moved later', { exact: true }).waitFor()
  })
})
