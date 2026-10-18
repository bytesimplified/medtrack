import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { preview } from 'vite'

describe('backup, restore, and offline use', () => {
  let server
  let browser

  before(async () => {
    server = await preview({
      configFile: 'config/vite.config.ts',
      preview: { host: '127.0.0.1', port: 5184, strictPort: true },
    })
    browser = await chromium.launch({ headless: true })
  })

  after(async () => {
    await browser?.close()
    if (server) await new Promise((resolve) => server.httpServer.close(resolve))
  })

  it('exports and restores user data, then reloads the app offline', async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'allow',
    })
    try {
      const page = await context.newPage()
      const pageErrors = []
      const failedRequests = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text())
      })
      page.on('requestfailed', (request) => {
        failedRequests.push(
          `${request.method()} ${request.url()}: ${request.failure()?.errorText}`,
        )
      })
      await page.goto('http://127.0.0.1:5184')
      await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()
      await page.getByRole('link', { name: 'Medicines', exact: true }).click()
      await page.getByRole('button', { name: 'Add medicine' }).click()
      await page.getByLabel('Medicine name').fill('E2E backup medicine')
      await page.getByLabel('Unit', { exact: true }).selectOption('tablet')
      await page.getByLabel('Frequency').selectOption('daily')
      await page.getByLabel('Starting stock (tablets)').fill('12')
      await page.getByLabel('Dose quantity (tablets)').fill('1')
      await page.getByLabel('Timing for dose 1').selectOption('custom')
      await page.getByLabel('Custom time').fill('23:59')
      await page.getByRole('button', { name: 'Save medicine' }).click()
      await page
        .getByRole('heading', { name: 'E2E backup medicine', exact: true })
        .waitFor()

      await page.getByText('Data', { exact: true }).click()
      const downloadReady = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Export backup' }).click()
      const download = await downloadReady
      assert.match(
        download.suggestedFilename(),
        /^medtrack-backup-\d{4}-\d{2}-\d{2}\.json$/,
      )
      const file = await readFile(await download.path())
      const backup = JSON.parse(file.toString('utf8'))
      assert.equal(backup.format, 'medtrack-backup')
      assert.equal(backup.version, 1)
      assert.equal(backup.data.medicines[0].name, 'E2E backup medicine')
      assert.equal(backup.data.medicines[0].isArchived, false)

      await page.getByRole('button', { name: 'Archive', exact: true }).click()
      await page.getByText('Archived', { exact: true }).waitFor()
      const fileChooserReady = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: 'Restore backup' }).click()
      const fileChooser = await fileChooserReady
      const confirm = page
        .waitForEvent('dialog')
        .then((dialog) => dialog.accept())
      await fileChooser.setFiles({
        name: 'medtrack-backup.json',
        mimeType: 'application/json',
        buffer: file,
      })
      await confirm
      await page
        .getByRole('status')
        .filter({ hasText: 'Backup restored: 1 medicines' })
        .waitFor()
      assert.equal(
        await page
          .getByRole('button', { name: 'Archive', exact: true })
          .count(),
        1,
      )
      assert.equal(
        await page
          .getByRole('button', { name: 'Restore', exact: true })
          .count(),
        0,
      )

      await page.getByRole('link', { name: 'Today', exact: true }).click()
      await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready
      })
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
      )
      await context.setOffline(true)
      await page.reload()
      const todayHeading = page.getByRole('heading', {
        name: 'Today',
        exact: true,
      })
      try {
        await todayHeading.waitFor({ timeout: 5000 })
      } catch {
        const state = await page.evaluate(async () => ({
          url: location.href,
          title: document.title,
          text: document.body.innerText.slice(0, 500),
          controlled: navigator.serviceWorker.controller !== null,
          cachedIndex: Boolean(await caches.match('/index.html')),
          assets: await Promise.all(
            Array.from(
              document.querySelectorAll(
                'script[src], link[rel="stylesheet"][href]',
              ),
            ).map(async (element) => {
              const url = new URL(
                element.getAttribute('src') ||
                  element.getAttribute('href') ||
                  '',
                location.origin,
              ).toString()
              return { url, cached: Boolean(await caches.match(url)) }
            }),
          ),
        }))
        assert.fail(
          `Offline app shell did not render: ${JSON.stringify({ ...state, pageErrors, failedRequests })}`,
        )
      }
      await page.getByRole('link', { name: 'Insights', exact: true }).click()
      await page
        .getByRole('heading', { name: 'Insights', exact: true })
        .waitFor()
    } finally {
      await context.close()
    }
  })
})
