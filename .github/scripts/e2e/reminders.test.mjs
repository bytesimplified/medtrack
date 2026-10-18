import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { chromium } from 'playwright'
import { preview } from 'vite'

const notificationKey = 'medtrack.e2e.notifications'
const delayKey = 'medtrack.e2e.longTimers'

describe('dose reminders in the browser', () => {
  let server
  let browser
  let context
  let page

  before(async () => {
    server = await preview({
      preview: { host: '127.0.0.1', port: 5181, strictPort: true },
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
    await context.addInitScript(
      ({ notificationKey, delayKey }) => {
        const OriginalSetTimeout = window.setTimeout.bind(window)
        window.setTimeout = (callback, delay, ...args) => {
          if (typeof delay === 'number' && delay >= 60_000) {
            const delays = JSON.parse(sessionStorage.getItem(delayKey) || '[]')
            delays.push(delay)
            sessionStorage.setItem(delayKey, JSON.stringify(delays))
          }
          return OriginalSetTimeout(callback, delay, ...args)
        }

        class TestNotification {
          static get permission() {
            return (
              sessionStorage.getItem('medtrack.e2e.permission') || 'default'
            )
          }

          static async requestPermission() {
            sessionStorage.setItem('medtrack.e2e.permission', 'granted')
            return 'granted'
          }

          constructor(title, options = {}) {
            this.title = title
            this.body = options.body || ''
            this.tag = options.tag || ''
            this.onclick = null
            const notices = JSON.parse(
              sessionStorage.getItem(notificationKey) || '[]',
            )
            notices.push({ title: this.title, body: this.body, tag: this.tag })
            sessionStorage.setItem(notificationKey, JSON.stringify(notices))
          }

          close() {}
        }

        Object.defineProperty(window, 'Notification', {
          configurable: true,
          value: TestNotification,
        })
      },
      { notificationKey, delayKey },
    )
    page = await context.newPage()
    await page.goto('http://127.0.0.1:5181')
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Medicines', exact: true }).click()
    await page
      .getByRole('heading', { name: 'Medicines', exact: true })
      .waitFor()
  })

  afterEach(async () => {
    await context?.close()
  })

  async function addMedicine(
    name,
    { initialStock = '30', lowStockAlerts = false } = {},
  ) {
    await page.getByRole('button', { name: 'Add medicine' }).click()
    await page.getByLabel('Medicine name').fill(name)
    await page.getByLabel('Unit', { exact: true }).selectOption('tablet')
    await page.getByLabel('Low-stock estimate threshold (days)').fill('5')
    if (lowStockAlerts) {
      await page
        .getByLabel(
          'Send a notification when this medicine reaches the low-stock threshold',
        )
        .check()
    }
    await page.getByLabel('Frequency').selectOption('daily')
    await page.getByLabel('Starting stock (tablets)').fill(initialStock)
    await page.getByLabel('Dose quantity (tablets)').fill('1')
    await page.getByLabel('Timing for dose 1').selectOption('custom')
    await page.getByLabel('Custom time').fill('23:59')
    await page.getByRole('button', { name: 'Save medicine' }).click()
    await page.getByRole('heading', { name, exact: true }).waitFor()
  }

  async function enableBrowserNotifications() {
    await page
      .getByRole('button', { name: 'Enable browser notifications' })
      .click()
    await page
      .getByText('Browser notifications are enabled.', { exact: true })
      .waitFor()
  }

  it('notifies once for opted-in low stock and keeps the daily claim after reload', async () => {
    await addMedicine('E2E low-stock medicine', {
      initialStock: '2',
      lowStockAlerts: true,
    })
    await enableBrowserNotifications()
    await page.waitForFunction((key) => {
      const notices = JSON.parse(sessionStorage.getItem(key) || '[]')
      return notices.some(
        (notice) => notice.title === 'Low stock: E2E low-stock medicine',
      )
    }, notificationKey)

    await page.reload()
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Medicines', exact: true }).click()
    await page
      .getByRole('heading', { name: 'E2E low-stock medicine' })
      .waitFor()
    await page.waitForTimeout(500)

    const lowStockNotifications = await page.evaluate(
      (key) =>
        JSON.parse(sessionStorage.getItem(key) || '[]').filter((notice) =>
          notice.title.startsWith('Low stock:'),
        ).length,
      notificationKey,
    )
    assert.equal(lowStockNotifications, 1)
  })

  it('enables a clock-time reminder and reschedules it after Later', async () => {
    await addMedicine('E2E reminder medicine')
    await enableBrowserNotifications()
    await page
      .getByRole('button', {
        name: 'Enable reminder for E2E reminder medicine',
      })
      .click()
    await page
      .getByRole('button', {
        name: 'Disable reminder for E2E reminder medicine',
      })
      .waitFor()

    await page.reload()
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Medicines', exact: true }).click()
    await page
      .getByRole('button', {
        name: 'Disable reminder for E2E reminder medicine',
      })
      .waitFor()
    await page.getByRole('link', { name: 'Today', exact: true }).click()
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()
    await page.evaluate((key) => sessionStorage.setItem(key, '[]'), delayKey)
    await page
      .getByRole('button', {
        name: /^Move E2E reminder medicine .* later$/,
      })
      .click()
    await page.getByText(/^Reminder moved to /).waitFor()
    await page.waitForFunction((key) => {
      const delays = JSON.parse(sessionStorage.getItem(key) || '[]')
      return delays.some(
        (delay) => delay >= 14 * 60_000 && delay <= 15 * 60_000 + 5_000,
      )
    }, delayKey)

    const snoozeDelayRecorded = await page.evaluate(
      (key) =>
        JSON.parse(sessionStorage.getItem(key) || '[]').some(
          (delay) => delay >= 14 * 60_000 && delay <= 15 * 60_000 + 5_000,
        ),
      delayKey,
    )
    assert.equal(snoozeDelayRecorded, true)
  })
})
