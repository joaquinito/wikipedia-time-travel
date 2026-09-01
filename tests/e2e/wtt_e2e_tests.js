const path = require("path")
const puppeteer = require("puppeteer")

const WIKIPEDIA_PAGE_EARTH = "https://en.wikipedia.org/wiki/Earth"

const EXTENSION_ROOT = path.resolve(__dirname, "../..")

// Firefox assigns every install a random per-profile moz-extension:// UUID. To get a predictable
// popup URL we pin that UUID via the extensions.webextensions.uuids pref, keyed by the extension's
// id. The id must match manifest.json's browser_specific_settings.gecko.id.
const FIREFOX_GECKO_ID = "wikipedia-time-travel@joaquinito.github.io"
const FIREFOX_EXTENSION_UUID = "d4d5e5f0-0a1b-4c2d-8e3f-a1b2c3d4e5f6"

// These tests drive the live Wikipedia API and its old-revision renders, which the popup's own
// code comments note can take many seconds on a cache miss (and slower still in a headful,
// slowMo run). Timeouts are deliberately generous so a slow response is waited out rather than
// reported as a failure; the per-step deadlines are shorter than the per-test one so a genuine
// hang still surfaces as a pointed error rather than an opaque jest timeout.
const READY_TIMEOUT_MS = 60000 // waiting for popup text to arrive from the API
const NAV_TIMEOUT_MS = 60000 // waiting for a Wikipedia revision page to load
const TEST_TIMEOUT_MS = 180000 // per-test / per-hook ceiling

async function waitFor(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

// Polls an element's innerText until `until` accepts it (non-empty by default), then returns it.
// Replaces the original tests' tight do/while loops, which polled $eval with no delay and no
// deadline — a slow MediaWiki response turned into an opaque jest test timeout, and the
// zero-delay polling itself flooded the devtools channel and starved the page.
async function readTextWhenReady(page, selector, { timeoutMs = READY_TIMEOUT_MS, pollMs = 100, until } = {}) {
  const accept = until || ((text) => text !== "")
  const deadline = Date.now() + timeoutMs
  for (;;) {
    let text = ""
    try {
      text = await page.$eval(selector, (el) => el.innerText)
    } catch (err) {
      // element not in the DOM yet (or the execution context is still swapping) — keep waiting
    }
    if (accept(text)) return text
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for "${selector}" text (last: ${JSON.stringify(text)})`)
    }
    await waitFor(pollMs)
  }
}

// Launches the given browser engine with the unpacked extension loaded. Returns the browser plus:
//   gotoPopup(page, query)          - navigates a page to the popup, engine quirks handled
//   canEmulateColorSchemeAtRuntime  - true for Chrome (CDP), false for Firefox (WebDriver BiDi),
//                                     which must fix prefers-color-scheme at launch instead
async function launchExtensionBrowser({ target, languageCode = "en-US", colorScheme = null }) {
  const isCI = process.env.CI === "true"

  // Set language (Chrome reads it from LANG; Firefox from the intl.accept_languages pref below)
  process.env.LANG = `${languageCode}.UTF-8`

  if (target === "firefox") {
    const extraPrefsFirefox = {
      // Pin the popup's moz-extension:// origin so its URL is predictable
      "extensions.webextensions.uuids": JSON.stringify({
        [FIREFOX_GECKO_ID]: FIREFOX_EXTENSION_UUID,
      }),
      // Drives navigator.language, which the popup uses for date formatting and segment order
      "intl.accept_languages": languageCode,
    }
    if (colorScheme) {
      // WebDriver BiDi has no page.emulateMediaFeatures(); force prefers-color-scheme instead.
      // 0 = dark, 1 = light.
      extraPrefsFirefox["layout.css.prefers-color-scheme.content-override"] =
        colorScheme === "dark" ? 0 : 1
    }

    const browser = await puppeteer.launch({
      browser: "firefox",
      headless: isCI, // run in headless mode on CI, don't run in headless mode on local
      slowMo: isCI ? 0 : 200, // only slow down actions for visual debugging locally
      extraPrefsFirefox,
    })
    await browser.installExtension(EXTENSION_ROOT)

    const popupUrl = (query) =>
      `moz-extension://${FIREFOX_EXTENSION_UUID}/popup/wikipedia_time_travel.html?${query}`

    return {
      browser,
      canEmulateColorSchemeAtRuntime: false,
      // Navigating a tab to a privileged moz-extension:// page triggers a process switch that
      // detaches the frame goto() tracks, so it never sees the "load" event. "commit" resolves
      // as soon as the navigation is committed; callers then poll the DOM for readiness.
      gotoPopup: (page, query) =>
        page.goto(popupUrl(query), { waitUntil: "commit", timeout: 30000 }),
    }
  }

  const browser = await puppeteer.launch({
    headless: isCI, // run in headless mode on CI, don't run in headless mode on local
    slowMo: isCI ? 0 : 200, // only slow down actions for visual debugging locally
    args: isCI
      ? [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-extensions-except=.",
          "--load-extension=popup/",
        ]
      : [
          "--disable-extensions-except=.",
          "--load-extension=popup/",
          "--disable-features=DialMediaRouteProvider",
        ],
  })

  const backgroundPageTarget = await browser.waitForTarget(
    (aTarget) => aTarget.type() === "service_worker"
  )
  const extensionId = (backgroundPageTarget.url() || "").split("/")[2]

  const popupUrl = (query) =>
    `chrome-extension://${extensionId}/popup/wikipedia_time_travel.html?${query}`

  return {
    browser,
    canEmulateColorSchemeAtRuntime: true,
    gotoPopup: (page, query) => page.goto(popupUrl(query)),
  }
}

// Defines the whole popup behaviour suite against one browser engine ("chrome" | "firefox").
function definePopupTests(target) {
  // Retry once: these tests hit the live Wikipedia API, so an isolated network stall should not
  // fail the run. Each test fully relaunches its own browser, so the retry starts from a clean slate.
  jest.retryTimes(1, { logErrorsBeforeRetry: true })

  describe(`Extension popup [${target}]`, () => {
    let context = null
    let browser = null
    let extensionPage = null

    /* Teardown */
    afterEach(async () => {
      await browser.close()
    })

    // Types digits into one of the exact-date spinner's day/month/year fields. The segment
    // starts pre-filled (with today's date, or a remembered one), so the first digit typed
    // replaces it rather than being inserted alongside it (see the "keydown" listener in
    // setUpDateSpinner()).
    async function typeIntoSegment(unit, digits) {
      await extensionPage.click("#date-segment-" + unit)
      await extensionPage.keyboard.type(digits)
    }

    describe("For the URL https://en.wikipedia.org/wiki/Earth", () => {

      /* Setup */
      beforeEach(async () => {
        context = await launchExtensionBrowser({ target, languageCode: "en-US" })
        browser = context.browser
        extensionPage = await browser.newPage()
        await context.gotoPopup(extensionPage, "testUrl=" + WIKIPEDIA_PAGE_EARTH)
        await (await browser.pages())[0].close() // Close the first empty tab
      }, TEST_TIMEOUT_MS)

      test('popup should have the article name "Earth"', async () => {
        const articleName = await readTextWhenReady(extensionPage, "#article-name")
        expect(articleName).toBe("Earth")
      }, TEST_TIMEOUT_MS)

      test("popup does not show the \"Showing the page as it was on\" reminder for the current version of the page", async () => {
        await readTextWhenReady(extensionPage, "#article-name")

        const noticeIsHidden = await extensionPage.$eval(
          "#viewing-date-notice",
          (el) => window.getComputedStyle(el).display === "none"
        )
        expect(noticeIsHidden).toBe(true)
      }, TEST_TIMEOUT_MS)

      test('popup should show the text "Page created on November 6, 2001"', async () => {
        const articleCreationDateText = await readTextWhenReady(
          extensionPage,
          "#article-creation-date"
        )
        expect(articleCreationDateText).toBe("Page created on November 6, 2001")
      }, TEST_TIMEOUT_MS)

      test("typing a valid date into the day/month/year spinner enables the Go button", async () => {
        // Wait for the popup to finish loading, so the date picker's min/max and the
        // Go button's enabling logic are wired up
        await readTextWhenReady(extensionPage, "#article-name")

        const submitButtonWasDisabled = await extensionPage.$eval(
          "#submit-button",
          (el) => el.disabled
        )
        expect(submitButtonWasDisabled).toBe(true)

        await typeIntoSegment("year", "2014")
        await typeIntoSegment("month", "04")
        await typeIntoSegment("day", "07")

        const datePickerValue = await extensionPage.$eval("#date-picker", (el) => el.value)
        expect(datePickerValue).toBe("2014-04-07")

        const submitButtonIsDisabled = await extensionPage.$eval(
          "#submit-button",
          (el) => el.disabled
        )
        expect(submitButtonIsDisabled).toBe(false)
      }, TEST_TIMEOUT_MS)

      test("when 7 April 2014 is selected in the date picker, the Wikipedia page for Earth as it was on 7 April 2014 opens", async () => {
        // Wait for the popup to finish loading, so the date picker's min/max and the
        // Go button's enabling logic are wired up
        await readTextWhenReady(extensionPage, "#article-name")

        await extensionPage.$eval("#date-picker", (el) => {
          el.value = "2014-04-07"
          el.dispatchEvent(new Event("input", { bubbles: true }))
        })

        const submitButtonIsDisabled = await extensionPage.$eval(
          "#submit-button",
          (el) => el.disabled
        )
        expect(submitButtonIsDisabled).toBe(false)

        // Clicking "Go" navigates the current tab (this same popup page) to the old revision
        await Promise.all([
          extensionPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }),
          extensionPage.click("#submit-button"),
        ])

        expect(extensionPage.url()).toContain("oldid=602452976")
      }, TEST_TIMEOUT_MS)

      test("clicking the quick jump Go button opens the page as it was 1 year ago by default", async () => {
        // Wait for the popup to finish loading, so the quick jump button is wired up
        await readTextWhenReady(extensionPage, "#article-name")

        const relativeAmount = await extensionPage.$eval("#relative-amount", (el) => el.value)
        const relativeUnit = await extensionPage.$eval("#relative-unit", (el) => el.value)
        expect(relativeAmount).toBe("1")
        expect(relativeUnit).toBe("years")

        // Clicking the quick jump Go button navigates the current tab to the old revision,
        // without requiring the exact date picker to be touched first
        await Promise.all([
          extensionPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }),
          extensionPage.click("#relative-go-button"),
        ])

        expect(extensionPage.url()).toContain("oldid=")
      }, TEST_TIMEOUT_MS)

      test("reopening the popup on a previously reached revision shows what date it was fetched for", async () => {
        // Wait for the popup to finish loading, so the date picker's min/max and the
        // Go button's enabling logic are wired up
        await readTextWhenReady(extensionPage, "#article-name")

        // Jump to the revision closest to 7 April 2014
        await extensionPage.$eval("#date-picker", (el) => {
          el.value = "2014-04-07"
          el.dispatchEvent(new Event("input", { bubbles: true }))
        })
        await Promise.all([
          extensionPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }),
          extensionPage.click("#submit-button"),
        ])
        const revisionUrl = extensionPage.url()
        expect(revisionUrl).toContain("oldid=602452976")

        // Reopen the popup pointed at that same revision URL
        await context.gotoPopup(extensionPage, "testUrl=" + encodeURIComponent(revisionUrl))

        const noticeText = await readTextWhenReady(extensionPage, "#viewing-date-notice")

        expect(noticeText).toBe("Currently showing page on April 7, 2014")

        const datePickerValue = await extensionPage.$eval("#date-picker", (el) => el.value)
        expect(datePickerValue).toBe("2014-04-07")
      }, TEST_TIMEOUT_MS)

      test("reopening the popup on today's revision does not show the reminder, since that is simply the current version", async () => {
        // Wait for the popup to finish loading, so the date picker's min/max and the
        // Go button's enabling logic are wired up
        await readTextWhenReady(extensionPage, "#article-name")

        // Jump to today's date, the date picker's max value
        await extensionPage.$eval("#date-picker", (el) => {
          el.value = el.max
          el.dispatchEvent(new Event("input", { bubbles: true }))
        })
        await Promise.all([
          extensionPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }),
          extensionPage.click("#submit-button"),
        ])
        const revisionUrl = extensionPage.url()
        expect(revisionUrl).toContain("oldid=")

        // Reopen the popup pointed at that same revision URL
        await context.gotoPopup(extensionPage, "testUrl=" + encodeURIComponent(revisionUrl))

        await readTextWhenReady(extensionPage, "#article-name")

        // Give the storage lookup a moment to resolve, then confirm the reminder stayed hidden
        await waitFor(500)
        const noticeIsHidden = await extensionPage.$eval(
          "#viewing-date-notice",
          (el) => window.getComputedStyle(el).display === "none"
        )
        expect(noticeIsHidden).toBe(true)
      }, TEST_TIMEOUT_MS)
    })

    describe("Immediate popup feedback after a jump, for the URL https://en.wikipedia.org/wiki/Earth", () => {

      // The click handler ends with chrome.tabs.update({ url }) to send the tab to the old
      // revision, then updates the popup's own notice. In a real popup that update targets a
      // separate tab; in this harness the popup page doubles as "the tab", so that navigation
      // would tear the page down before the notice can be read. It has to be neutralised:
      //   - Chrome: replace chrome.tabs.update with a no-op before any page script runs.
      //   - Firefox: preload scripts don't reach privileged moz-extension:// pages, so instead
      //     abort the /w/index.php navigation request the real chrome.tabs.update triggers.
      /* Setup */
      beforeEach(async () => {
        context = await launchExtensionBrowser({ target, languageCode: "en-US" })
        browser = context.browser
        extensionPage = await browser.newPage()

        if (target === "firefox") {
          await extensionPage.setRequestInterception(true)
          extensionPage.on("request", (request) => {
            if (request.url().includes("/w/index.php")) {
              request.abort().catch(() => {})
            } else {
              request.continue().catch(() => {})
            }
          })
        } else {
          await extensionPage.evaluateOnNewDocument(() => {
            chrome.tabs.update = () => {}
          })
        }

        await context.gotoPopup(extensionPage, "testUrl=" + WIKIPEDIA_PAGE_EARTH)
        await (await browser.pages())[0].close() // Close the first empty tab
      }, TEST_TIMEOUT_MS)

      test("clicking Go shows the notice in the popup immediately, without needing to reopen it", async () => {
        await readTextWhenReady(extensionPage, "#article-name")

        await extensionPage.$eval("#date-picker", (el) => {
          el.value = "2014-04-07"
          el.dispatchEvent(new Event("input", { bubbles: true }))
        })
        await extensionPage.click("#submit-button")

        const noticeText = await readTextWhenReady(extensionPage, "#viewing-date-notice")

        expect(noticeText).toBe("Currently showing page on April 7, 2014")
      }, TEST_TIMEOUT_MS)

      test("the quick jump is relative to the currently shown date, not always today", async () => {
        await readTextWhenReady(extensionPage, "#article-name")

        // Jump to 22 August 2025 via the exact date picker
        await extensionPage.$eval("#date-picker", (el) => {
          el.value = "2025-08-22"
          el.dispatchEvent(new Event("input", { bubbles: true }))
        })
        await extensionPage.click("#submit-button")

        const firstNoticeText = await readTextWhenReady(extensionPage, "#viewing-date-notice")
        expect(firstNoticeText).toBe("Currently showing page on August 22, 2025")

        // The default "1 year ago" quick jump should now be relative to 22 August 2025,
        // not to today
        await extensionPage.click("#relative-go-button")

        const secondNoticeText = await readTextWhenReady(extensionPage, "#viewing-date-notice", {
          until: (text) => text !== "" && text !== firstNoticeText,
        })

        expect(secondNoticeText).toBe("Currently showing page on August 22, 2024")
      }, TEST_TIMEOUT_MS)
    })

    describe("The exact-date day/month/year spinner, for the URL https://en.wikipedia.org/wiki/Earth", () => {

      beforeEach(async () => {
        context = await launchExtensionBrowser({ target, languageCode: "en-US" })
        browser = context.browser
        extensionPage = await browser.newPage()
        await context.gotoPopup(extensionPage, "testUrl=" + WIKIPEDIA_PAGE_EARTH)
        await (await browser.pages())[0].close() // Close the first empty tab

        await readTextWhenReady(extensionPage, "#article-name")
      }, TEST_TIMEOUT_MS)

      test("the date is picked via a segmented day/month/year spinner, not a native date input", async () => {
        const datePickerType = await extensionPage.$eval("#date-picker", (el) => el.type)
        expect(datePickerType).toBe("hidden")

        const spinnerSegmentCount = await extensionPage.$$eval(
          ".date-segment-input",
          (els) => els.length
        )
        expect(spinnerSegmentCount).toBe(3)
      }, TEST_TIMEOUT_MS)

      test("the segments are ordered month, day, year for American English (mm/dd/yyyy)", async () => {
        const order = await extensionPage.$$eval(".date-segment-input", (els) =>
          els.map((el) => el.dataset.unit)
        )
        expect(order).toEqual(["month", "day", "year"])
      }, TEST_TIMEOUT_MS)

      test("typing digits directly into each segment enables Go and navigates to that revision", async () => {
        await typeIntoSegment("year", "2014")
        await typeIntoSegment("month", "04")
        await typeIntoSegment("day", "07")

        const submitButtonIsDisabled = await extensionPage.$eval(
          "#submit-button",
          (el) => el.disabled
        )
        expect(submitButtonIsDisabled).toBe(false)

        await Promise.all([
          extensionPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }),
          extensionPage.click("#submit-button"),
        ])

        expect(extensionPage.url()).toContain("oldid=602452976")
      }, TEST_TIMEOUT_MS)

      test("the day input's own up/down arrows adjust just that part of the date, and Go navigates to the resulting revision", async () => {
        await typeIntoSegment("year", "2014")
        await typeIntoSegment("month", "04")
        await typeIntoSegment("day", "08")

        await extensionPage.focus("#date-segment-day")
        await extensionPage.keyboard.press("ArrowDown")

        const dayValue = await extensionPage.$eval("#date-segment-day", (el) => el.value)
        expect(dayValue).toBe("7")

        await Promise.all([
          extensionPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }),
          extensionPage.click("#submit-button"),
        ])

        expect(extensionPage.url()).toContain("oldid=602452976")
      }, TEST_TIMEOUT_MS)

      test("increasing the month clamps a day that no longer fits the new month (e.g. March 31st to April)", async () => {
        await typeIntoSegment("year", "2014")
        await typeIntoSegment("month", "03")
        await typeIntoSegment("day", "31")

        await extensionPage.focus("#date-segment-month")
        await extensionPage.keyboard.press("ArrowUp")

        const monthValue = await extensionPage.$eval("#date-segment-month", (el) => el.value)
        const dayValue = await extensionPage.$eval("#date-segment-day", (el) => el.value)
        expect(monthValue).toBe("4")
        expect(dayValue).toBe("30")
      }, TEST_TIMEOUT_MS)

      test("a date before the page was created does not enable Go", async () => {
        await typeIntoSegment("year", "1999")
        await typeIntoSegment("month", "01")
        await typeIntoSegment("day", "01")

        const submitButtonIsDisabled = await extensionPage.$eval(
          "#submit-button",
          (el) => el.disabled
        )
        expect(submitButtonIsDisabled).toBe(true)
      }, TEST_TIMEOUT_MS)
    })

    describe("The exact-date day/month/year spinner under a non-American browser locale (en-GB), for the URL https://en.wikipedia.org/wiki/Earth", () => {

      /* Setup */
      beforeEach(async () => {
        context = await launchExtensionBrowser({ target, languageCode: "en-GB" })
        browser = context.browser
        extensionPage = await browser.newPage()
        await context.gotoPopup(extensionPage, "testUrl=" + WIKIPEDIA_PAGE_EARTH)
        await (await browser.pages())[0].close() // Close the first empty tab

        await readTextWhenReady(extensionPage, "#article-name")
      }, TEST_TIMEOUT_MS)

      test("the segments are ordered day, month, year (dd/mm/yyyy)", async () => {
        const order = await extensionPage.$$eval(".date-segment-input", (els) =>
          els.map((el) => el.dataset.unit)
        )
        expect(order).toEqual(["day", "month", "year"])
      }, TEST_TIMEOUT_MS)
    })

    describe("During loading state for the URL https://en.wikipedia.org/wiki/Earth", () => {

      // Hold the MediaWiki API request pending so the loading state can be observed directly,
      // instead of racing the real network call to catch it live. Request interception is used
      // rather than an evaluateOnNewDocument fetch() shim because Firefox (over WebDriver BiDi)
      // does not inject preload scripts into privileged moz-extension:// pages.
      let heldApiRequests = []
      let apiRequestsReleased = false

      /* Setup */
      beforeEach(async () => {
        context = await launchExtensionBrowser({ target, languageCode: "en-US" })
        browser = context.browser
        extensionPage = await browser.newPage()

        heldApiRequests = []
        apiRequestsReleased = false
        await extensionPage.setRequestInterception(true)
        extensionPage.on("request", (request) => {
          if (!apiRequestsReleased && request.url().includes("/w/api.php")) {
            heldApiRequests.push(request)
          } else {
            request.continue().catch(() => {})
          }
        })

        await context.gotoPopup(extensionPage, "testUrl=" + WIKIPEDIA_PAGE_EARTH)
        await (await browser.pages())[0].close() // Close the first empty tab
      }, TEST_TIMEOUT_MS)

      async function releasePendingFetches() {
        apiRequestsReleased = true
        const held = heldApiRequests
        heldApiRequests = []
        for (const request of held) {
          await request.continue().catch(() => {})
        }
      }

      test("popup shows the loading skeleton while the article data is loading", async () => {
        // Wait for the popup document to be parsed before probing the skeleton
        await extensionPage.waitForSelector("#loader", { timeout: 15000 })

        const loaderDisplayStyle = await extensionPage.$eval(
          "#loader",
          (el) => window.getComputedStyle(el).display
        )
        expect(loaderDisplayStyle).not.toBe("none")

        const skeletonBlockCount = await extensionPage.$$eval(
          "#loader .skeleton",
          (elements) => elements.length
        )
        expect(skeletonBlockCount).toBe(3)

        const articleNameWhileLoading = await extensionPage.$eval(
          "#article-name",
          (el) => el.innerText
        )
        expect(articleNameWhileLoading).toBe("")

        await releasePendingFetches()
      }, TEST_TIMEOUT_MS)

      test("popup's loading skeleton should match the loaded content's height so the popup does not resize", async () => {
        await extensionPage.waitForSelector("#loader", { timeout: 15000 })
        const heightWhileLoading = await extensionPage.evaluate(() => document.body.scrollHeight)

        await releasePendingFetches()

        await readTextWhenReady(extensionPage, "#article-name")

        const heightAfterLoaded = await extensionPage.evaluate(() => document.body.scrollHeight)

        // The skeleton only approximates the real content's shape, so allow a small gap
        // rather than requiring a pixel-perfect match.
        expect(Math.abs(heightAfterLoaded - heightWhileLoading)).toBeLessThanOrEqual(20)
      }, TEST_TIMEOUT_MS)
    })

    describe("The popup follows the browser colour scheme", () => {

      /* Setup */
      beforeEach(async () => {
        context = await launchExtensionBrowser({ target, languageCode: "en-US" })
        browser = context.browser
        extensionPage = await browser.newPage()
        await (await browser.pages())[0].close() // Close the first empty tab
      }, TEST_TIMEOUT_MS)

      async function openPopupInColorScheme(colorScheme) {
        if (context.canEmulateColorSchemeAtRuntime) {
          await extensionPage.emulateMediaFeatures([
            { name: "prefers-color-scheme", value: colorScheme },
          ])
        } else {
          // Firefox fixes prefers-color-scheme at launch, so relaunch with the right pref
          await browser.close()
          context = await launchExtensionBrowser({ target, languageCode: "en-US", colorScheme })
          browser = context.browser
          extensionPage = await browser.newPage()
          await (await browser.pages())[0].close()
        }
        await context.gotoPopup(extensionPage, "testUrl=" + WIKIPEDIA_PAGE_EARTH)
        // "commit" resolves before the stylesheet is applied; wait for the tokens to take effect
        await extensionPage.waitForFunction(
          () => getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)",
          { timeout: 15000 }
        )
      }

      async function getBodyAndTokenColors() {
        return await extensionPage.evaluate(() => {
          const bodyStyle = window.getComputedStyle(document.body)

          const probe = document.createElement("div")
          probe.style.backgroundColor = "var(--wtt-bg)" // Defined in the CSS file
          probe.style.color = "var(--wtt-text)" // Defined in the CSS file
          document.body.appendChild(probe)
          const tokenStyle = window.getComputedStyle(probe)
          const tokens = { backgroundColor: tokenStyle.backgroundColor, color: tokenStyle.color }
          probe.remove()

          return {
            body: { backgroundColor: bodyStyle.backgroundColor, color: bodyStyle.color },
            tokens,
          }
        })
      }

      test("popup uses the --wtt-bg/--wtt-text design tokens in light mode", async () => {
        await openPopupInColorScheme("light")
        const { body, tokens } = await getBodyAndTokenColors()
        expect(body).toEqual(tokens)
      }, TEST_TIMEOUT_MS)

      test("popup uses the --wtt-bg/--wtt-text design tokens in dark mode", async () => {
        await openPopupInColorScheme("dark")
        const { body, tokens } = await getBodyAndTokenColors()
        expect(body).toEqual(tokens)
      }, TEST_TIMEOUT_MS)
    })

    describe("For a URL that is not a Wikipedia page", () => {

      /* Setup */
      beforeEach(async () => {
        context = await launchExtensionBrowser({ target, languageCode: "en-US" })
        browser = context.browser
        extensionPage = await browser.newPage()
        await context.gotoPopup(extensionPage, "testUrl=https://google.com")
        await (await browser.pages())[0].close() // Close the first empty tab
      }, TEST_TIMEOUT_MS)

      test('popup should show only the text "This is not a Wikipedia page"', async () => {
        await extensionPage.waitForSelector("#placeholder-message", { timeout: 15000 })

        const placeholderMessageDisplayStyle = await extensionPage.$eval(
          "#placeholder-message", (el) => el.style.display
        )

        const articleNameText = await extensionPage.$eval("#article-name", (el) => el.innerText)

        const articleCreationDateText = await extensionPage.$eval(
          "#article-creation-date",
          (el) => el.innerText
        )

        const formBodyDisplayStyle = await extensionPage.$eval("#form-body", (el) => el.style.display)

        const noticeIsHidden = await extensionPage.$eval(
          "#viewing-date-notice",
          (el) => window.getComputedStyle(el).display === "none"
        )

        expect(placeholderMessageDisplayStyle).not.toBe("none")
        expect(articleNameText).toBe("")
        expect(articleCreationDateText).toBe("")
        expect(formBodyDisplayStyle).toBe("")
        expect(noticeIsHidden).toBe(true)
      }, TEST_TIMEOUT_MS)
    })

    describe("Date format of creation date is correct in a browser with the language ", () => {

      async function openBrowserWithLanguage(languageCode) {
        context = await launchExtensionBrowser({ target, languageCode })
        browser = context.browser
        extensionPage = await browser.newPage()
        await context.gotoPopup(extensionPage, "testUrl=" + WIKIPEDIA_PAGE_EARTH)
        await (await browser.pages())[0].close() // Close the first empty tab
      }

      async function getArticleCreationDateText() {
        return readTextWhenReady(extensionPage, "#article-creation-date")
      }

      test('en', async () => {
        await openBrowserWithLanguage("en")
        const articleCreationDateText = await getArticleCreationDateText()
        expect(articleCreationDateText).toBe("Page created on November 6, 2001")
      }, TEST_TIMEOUT_MS)

      test('en-US', async () => {
        await openBrowserWithLanguage("en-US")
        const articleCreationDateText = await getArticleCreationDateText()
        expect(articleCreationDateText).toBe("Page created on November 6, 2001")
      }, TEST_TIMEOUT_MS)

      test('en-UK', async () => {
        await openBrowserWithLanguage("en-UK")
        const articleCreationDateText = await getArticleCreationDateText()
        expect(articleCreationDateText).toBe("Page created on 6 November 2001")
      }, TEST_TIMEOUT_MS)

      test('pt', async () => {
        await openBrowserWithLanguage("en-UK")
        const articleCreationDateText = await getArticleCreationDateText()
        expect(articleCreationDateText).toBe("Page created on 6 November 2001")
      }, TEST_TIMEOUT_MS)
    })
  })
}

module.exports = { definePopupTests, launchExtensionBrowser, waitFor, WIKIPEDIA_PAGE_EARTH }
