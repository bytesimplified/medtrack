import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { preview } from 'vite'
;(async () => {
  await mkdir('test-results', { recursive: true })
  const server = await preview({
    preview: { host: '127.0.0.1', port: 5179, strictPort: true },
  })
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      colorScheme: 'light',
    })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('http://127.0.0.1:5179')
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Medicines', exact: true }).click()
    await page
      .getByRole('heading', { name: 'Medicines', exact: true })
      .waitFor()
    await page.getByRole('button', { name: 'Add medicine' }).click()
    await page.getByLabel('Medicine name').fill('CI smoke medicine')
    await page.getByLabel('Unit', { exact: true }).selectOption('tablet')
    await page.getByLabel('Frequency').selectOption('daily')
    await page.getByLabel('Starting stock (tablets)').fill('30')
    await page.getByLabel('Dose quantity (tablets)').fill('1')
    await page.getByLabel('Meal window').selectOption('after-lunch')
    await page.getByRole('button', { name: 'Save medicine' }).click()
    await page
      .getByRole('heading', { name: 'CI smoke medicine', exact: true })
      .waitFor()
    await page.getByText('30 tablets recorded stock', { exact: true }).waitFor()
    await page
      .getByRole('button', { name: 'Edit schedule for CI smoke medicine' })
      .click()
    const effectiveFrom = await page.getByLabel('Effective from').inputValue()
    assert.ok(effectiveFrom)
    await page.getByLabel('Dose quantity (tablets)').fill('2')
    await page.getByLabel('Frequency').selectOption('weekdays')
    await page.getByLabel('Monday').check()
    await page.getByRole('button', { name: 'Save schedule' }).click()
    await page
      .getByText('Schedule updated from ' + effectiveFrom + '.')
      .waitFor()
    await page.getByText(/version 2/).waitFor()
    await page.screenshot({
      path: 'test-results/medicines-desktop.png',
      fullPage: true,
    })
    await page.reload()
    await page
      .getByRole('heading', { name: 'Medicines', exact: true })
      .waitFor()
    await page
      .getByRole('heading', { name: 'CI smoke medicine', exact: true })
      .waitFor()
    await page.getByRole('link', { name: 'Insights', exact: true }).click()
    await page.getByRole('heading', { name: 'Insights', exact: true }).waitFor()
    await page.goBack()
    await page
      .getByRole('heading', { name: 'Medicines', exact: true })
      .waitFor()
    await page.getByRole('link', { name: 'Today', exact: true }).click()
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()
    await page.screenshot({ path: 'test-results/desktop.png', fullPage: true })
    await page.getByRole('button', { name: 'Dark theme', exact: true }).click()
    await page.reload()
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === 'dark',
    )
    for (const width of [640, 480, 390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      )
      const nav = await page.getByRole('navigation').boundingBox()
      assert.ok(nav.y + nav.height <= 845)
      for (const link of await page
        .getByRole('navigation')
        .getByRole('link')
        .all()) {
        const box = await link.boundingBox()
        assert.ok(box.width >= 44 && box.height >= 44)
      }
      if (width === 390)
        await page.screenshot({
          path: 'test-results/mobile-dark.png',
          fullPage: true,
        })
      if (width === 390) {
        await page.getByRole('link', { name: 'Medicines', exact: true }).click()
        await page
          .getByRole('heading', { name: 'CI smoke medicine', exact: true })
          .waitFor()
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        )
        await page.screenshot({
          path: 'test-results/medicines-mobile-dark.png',
          fullPage: true,
        })
        await page.getByRole('link', { name: 'Today', exact: true }).click()
      }
    }
    await page
      .getByRole('button', { name: 'Device theme', exact: true })
      .click()
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === 'light',
    )
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === 'dark',
    )
    assert.deepEqual(errors, [])
    console.log(
      'PASS: browser navigation, medicine and schedule persistence, reload, Back, saved and device themes, 1280/390/320 layouts, tap targets, no runtime errors.',
    )
  } finally {
    await browser?.close()
    await new Promise((resolve) => server.httpServer.close(resolve))
  }
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
