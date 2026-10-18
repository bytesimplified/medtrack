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
    await page.reload()
    await page
      .getByRole('heading', { name: 'Medicines', exact: true })
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
      'PASS: browser navigation, reload, Back, saved and device themes, 1280/390/320 layouts, tap targets, no runtime errors.',
    )
  } finally {
    await browser?.close()
    await new Promise((resolve) => server.httpServer.close(resolve))
  }
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
