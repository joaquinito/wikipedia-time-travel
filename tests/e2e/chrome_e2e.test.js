const puppeteer = require("puppeteer")

WIKIPEDIA_PAGE_EARTH = "https://en.wikipedia.org/wiki/Earth"

async function waitFor(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

async function getBrowser(languageCode) {
  const isCI = process.env.CI === "true"

  // Set language
  process.env.LANG = `${languageCode}.UTF-8`

  return await puppeteer.launch({
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
}

async function getExtensionId(browser) {
  await browser.pages();
  const backgroundPageTarget = await browser.waitForTarget(
    (target) => target.type() === 'service_worker'
  );
  const backgroundPageUrl = backgroundPageTarget.url() || '';
  [, , extensionId] = backgroundPageUrl.split('/');
  return extensionId
}

describe("Chrome Extension Popup Test", () => {
  let browser = null
  let extensionPage = null
  let extensionId = null

  /* Teardown */
  afterEach(async () => {
    await browser.close()
  })

  describe("For the URL https://en.wikipedia.org/wiki/Earth", () => {

    /* Setup */
    beforeEach(async () => {
      browser = await getBrowser("en-US")
      extensionId = await getExtensionId(browser)
      extensionPage = await browser.newPage()
      await extensionPage.goto(
        "chrome-extension://" +
          extensionId +
          "/popup/wikipedia_time_travel.html?testUrl=" +
          WIKIPEDIA_PAGE_EARTH
      )
      await (await browser.pages())[0].close() // Close the first empty tab
    }, (timeout = 60000))

    test('popup should have the article name "Earth"', async () => {
      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")
      expect(articleName).toBe("Earth")
    })

    test("popup does not show the \"Showing the page as it was on\" reminder for the current version of the page", async () => {
      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")

      const noticeIsHidden = await extensionPage.$eval(
        "#viewing-date-notice",
        (el) => window.getComputedStyle(el).display === "none"
      )
      expect(noticeIsHidden).toBe(true)
    })

    test('popup should show the text "Page created on November 6, 2001"', async () => {
      let articleCreationDateText = ""
      do {
        articleCreationDateText = await extensionPage.$eval(
          "#article-creation-date",
          (el) => el.innerText
        )
      } while (articleCreationDateText === "")
      expect(articleCreationDateText).toBe("Page created on November 6, 2001")
    })

     test("typing a valid date into the date picker enables the Go button", async () => {
      // Wait for the popup to finish loading, so the date picker's min/max and the
      // Go button's enabling logic are wired up
      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")

      const submitButtonWasDisabled = await extensionPage.$eval(
        "#submit-button",
        (el) => el.disabled
      )
      expect(submitButtonWasDisabled).toBe(true)

      // The date input's segment order (day/month vs month/day) depends on the browser's
      // locale, so use a day/month pair that is valid, and within range, either way.
      await extensionPage.click("#date-picker")
      await extensionPage.keyboard.type("04072014")

      const datePickerValue = await extensionPage.$eval("#date-picker", (el) => el.value)
      expect(datePickerValue).not.toBe("")

      const submitButtonIsDisabled = await extensionPage.$eval(
        "#submit-button",
        (el) => el.disabled
      )
      expect(submitButtonIsDisabled).toBe(false)
    }, timeout = 60000)

    test("when 7 April 2014 is selected in the date picker, the Wikipedia page for Earth as it was on 7 April 2014 opens", async () => {
      // Wait for the popup to finish loading, so the date picker's min/max and the
      // Go button's enabling logic are wired up
      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")

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
        extensionPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }),
        extensionPage.click("#submit-button"),
      ])

      expect(extensionPage.url()).toContain("oldid=602452976")
    }, timeout = 60000)

    test("clicking the quick jump Go button opens the page as it was 1 year ago by default", async () => {
      // Wait for the popup to finish loading, so the quick jump button is wired up
      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")

      const relativeAmount = await extensionPage.$eval("#relative-amount", (el) => el.value)
      const relativeUnit = await extensionPage.$eval("#relative-unit", (el) => el.value)
      expect(relativeAmount).toBe("1")
      expect(relativeUnit).toBe("years")

      // Clicking the quick jump Go button navigates the current tab to the old revision,
      // without requiring the exact date picker to be touched first
      await Promise.all([
        extensionPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }),
        extensionPage.click("#relative-go-button"),
      ])

      expect(extensionPage.url()).toContain("oldid=")
    }, timeout = 60000)

    test("reopening the popup on a previously reached revision shows what date it was fetched for", async () => {
      // Wait for the popup to finish loading, so the date picker's min/max and the
      // Go button's enabling logic are wired up
      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")

      // Jump to the revision closest to 7 April 2014
      await extensionPage.$eval("#date-picker", (el) => {
        el.value = "2014-04-07"
        el.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await Promise.all([
        extensionPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }),
        extensionPage.click("#submit-button"),
      ])
      const revisionUrl = extensionPage.url()
      expect(revisionUrl).toContain("oldid=602452976")

      // Reopen the popup pointed at that same revision URL
      await extensionPage.goto(
        "chrome-extension://" +
          extensionId +
          "/popup/wikipedia_time_travel.html?testUrl=" +
          encodeURIComponent(revisionUrl)
      )

      let noticeText = ""
      do {
        noticeText = await extensionPage.$eval("#viewing-date-notice", (el) => el.innerText)
      } while (noticeText === "")

      expect(noticeText).toBe("🕰️ Currently showing page on April 7, 2014")
    }, timeout = 90000)

    test("reopening the popup on today's revision does not show the reminder, since that is simply the current version", async () => {
      // Wait for the popup to finish loading, so the date picker's min/max and the
      // Go button's enabling logic are wired up
      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")

      // Jump to today's date, the date picker's max value
      await extensionPage.$eval("#date-picker", (el) => {
        el.value = el.max
        el.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await Promise.all([
        extensionPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }),
        extensionPage.click("#submit-button"),
      ])
      const revisionUrl = extensionPage.url()
      expect(revisionUrl).toContain("oldid=")

      // Reopen the popup pointed at that same revision URL
      await extensionPage.goto(
        "chrome-extension://" +
          extensionId +
          "/popup/wikipedia_time_travel.html?testUrl=" +
          encodeURIComponent(revisionUrl)
      )

      let articleNameOnReopen = ""
      do {
        articleNameOnReopen = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleNameOnReopen === "")

      // Give the storage lookup a moment to resolve, then confirm the reminder stayed hidden
      await waitFor(500)
      const noticeIsHidden = await extensionPage.$eval(
        "#viewing-date-notice",
        (el) => window.getComputedStyle(el).display === "none"
      )
      expect(noticeIsHidden).toBe(true)
    }, timeout = 90000)
  })

  describe("Immediate popup feedback after a jump, for the URL https://en.wikipedia.org/wiki/Earth", () => {

    /* Setup: stub chrome.tabs.update so the click handler's own logic (remember the date,
       update the notice) can be observed without racing the real tab navigation it triggers —
       in a real popup that update targets a separate tab and never tears down the popup itself,
       but in this test harness the popup page doubles as "the tab". */
    beforeEach(async () => {
      browser = await getBrowser("en-US")
      extensionId = await getExtensionId(browser)
      extensionPage = await browser.newPage()
      await extensionPage.evaluateOnNewDocument(() => {
        chrome.tabs.update = () => {}
      })
      await extensionPage.goto(
        "chrome-extension://" +
          extensionId +
          "/popup/wikipedia_time_travel.html?testUrl=" +
          WIKIPEDIA_PAGE_EARTH
      )
      await (await browser.pages())[0].close() // Close the first empty tab
    }, (timeout = 60000))

    test("clicking Go shows the notice in the popup immediately, without needing to reopen it", async () => {
      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")

      await extensionPage.$eval("#date-picker", (el) => {
        el.value = "2014-04-07"
        el.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await extensionPage.click("#submit-button")

      let noticeText = ""
      do {
        noticeText = await extensionPage.$eval("#viewing-date-notice", (el) => el.innerText)
      } while (noticeText === "")

      expect(noticeText).toBe("🕰️ Currently showing page on April 7, 2014")
    }, timeout = 90000)

    test("the quick jump is relative to the currently shown date, not always today", async () => {
      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")

      // Jump to 22 August 2025 via the exact date picker
      await extensionPage.$eval("#date-picker", (el) => {
        el.value = "2025-08-22"
        el.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await extensionPage.click("#submit-button")

      let firstNoticeText = ""
      do {
        firstNoticeText = await extensionPage.$eval("#viewing-date-notice", (el) => el.innerText)
      } while (firstNoticeText === "")
      expect(firstNoticeText).toBe("🕰️ Currently showing page on August 22, 2025")

      // The default "1 year ago" quick jump should now be relative to 22 August 2025,
      // not to today
      await extensionPage.click("#relative-go-button")

      let secondNoticeText = firstNoticeText
      do {
        secondNoticeText = await extensionPage.$eval("#viewing-date-notice", (el) => el.innerText)
      } while (secondNoticeText === firstNoticeText)

      expect(secondNoticeText).toBe("🕰️ Currently showing page on August 22, 2024")
    }, timeout = 90000)
  })

  describe("During loading state for the URL https://en.wikipedia.org/wiki/Earth", () => {

    /* Setup: hold the MediaWiki API fetch pending so the loading state can be observed
       directly, instead of racing the real network call to catch it live. */
    beforeEach(async () => {
      browser = await getBrowser("en-US")
      extensionId = await getExtensionId(browser)
      extensionPage = await browser.newPage()
      await extensionPage.evaluateOnNewDocument(() => {
        window.__pendingFetchResolvers = []
        const originalFetch = window.fetch.bind(window)
        window.fetch = (url, ...rest) => {
          if (typeof url === "string" && url.includes("/w/api.php")) {
            return new Promise((resolve) => {
              window.__pendingFetchResolvers.push(() => resolve(originalFetch(url, ...rest)))
            })
          }
          return originalFetch(url, ...rest)
        }
      })
      await extensionPage.goto(
        "chrome-extension://" +
          extensionId +
          "/popup/wikipedia_time_travel.html?testUrl=" +
          WIKIPEDIA_PAGE_EARTH
      )
      await (await browser.pages())[0].close() // Close the first empty tab
    }, (timeout = 60000))

    async function releasePendingFetches() {
      await extensionPage.evaluate(() => {
        window.__pendingFetchResolvers.forEach((resolveFetch) => resolveFetch())
        window.__pendingFetchResolvers = []
      })
    }

    test("popup shows the loading skeleton while the article data is loading", async () => {
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
    }, timeout = 60000)

    test("popup's loading skeleton should match the loaded content's height so the popup does not resize", async () => {
      const heightWhileLoading = await extensionPage.evaluate(() => document.body.scrollHeight)

      await releasePendingFetches()

      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")

      const heightAfterLoaded = await extensionPage.evaluate(() => document.body.scrollHeight)

      // The skeleton only approximates the real content's shape, so allow a small gap
      // rather than requiring a pixel-perfect match.
      expect(Math.abs(heightAfterLoaded - heightWhileLoading)).toBeLessThanOrEqual(20)
    }, timeout = 60000)
  })

  describe("The popup follows the browser colour scheme", () => {

    /* Setup */
    beforeEach(async () => {
      browser = await getBrowser("en-US")
      extensionId = await getExtensionId(browser)
      extensionPage = await browser.newPage()
      await (await browser.pages())[0].close() // Close the first empty tab
    }, (timeout = 60000))

    async function openPopupInColorScheme(colorScheme) {
      await extensionPage.emulateMediaFeatures([{ name: "prefers-color-scheme", value: colorScheme }])
      await extensionPage.goto(
        "chrome-extension://" +
          extensionId +
          "/popup/wikipedia_time_travel.html?testUrl=" +
          WIKIPEDIA_PAGE_EARTH
      )
    }

    async function getBodyAndTokenColors() {
      return await extensionPage.evaluate(() => {
        const bodyStyle = window.getComputedStyle(document.body)

        const probe = document.createElement("div")
        probe.style.backgroundColor = "var(--wtt-bg)"  // Defined in the CSS file
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
    }, timeout = 60000)

    test("popup uses the --wtt-bg/--wtt-text design tokens in dark mode", async () => {
      await openPopupInColorScheme("dark")
      const { body, tokens } = await getBodyAndTokenColors()
      expect(body).toEqual(tokens)
    }, timeout = 60000)
  })

  describe("For a URL that is not a Wikipedia page", () => {

    /* Setup */
    beforeEach(async () => {
      browser = await getBrowser("en-US")
      extensionId = await getExtensionId(browser)
      extensionPage = await browser.newPage()
      await extensionPage.goto(
        "chrome-extension://" +
          extensionId +
          "/popup/wikipedia_time_travel.html?testUrl=https://google.com"
      )
      await (await browser.pages())[0].close() // Close the first empty tab
    }, (timeout = 60000))

    test('popup should show only the text "This is not a Wikipedia page"', async () => {

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
    }, timeout = 60000)
  })

  describe("Date format of creation date is correct in a browser with the language ", () => {

    async function openBrowserWithLanguage(languageCode) {
      browser = await getBrowser(languageCode)
      extensionId = await getExtensionId(browser)
      extensionPage = await browser.newPage()
      await extensionPage.goto(
        "chrome-extension://" +
          extensionId +
          "/popup/wikipedia_time_travel.html?testUrl=" +
          WIKIPEDIA_PAGE_EARTH
      )
      await (await browser.pages())[0].close() // Close the first empty tab
    }

    async function getArticleCreationDateText() {
      let articleCreationDateText = ""
      do {
        articleCreationDateText = await extensionPage.$eval(
          "#article-creation-date",
          (el) => el.innerText
        )
      }
      while (articleCreationDateText === "")
      return articleCreationDateText
    }

    test('en', async () => {
      await openBrowserWithLanguage("en")
      const articleCreationDateText = await getArticleCreationDateText()
      expect(articleCreationDateText).toBe("Page created on November 6, 2001")
    }, timeout = 60000)

    test('en-US', async () => {
      await openBrowserWithLanguage("en-US")
      const articleCreationDateText = await getArticleCreationDateText()
      expect(articleCreationDateText).toBe("Page created on November 6, 2001")
    }, timeout = 60000)

    test('en-UK', async () => {
      await openBrowserWithLanguage("en-UK")
      const articleCreationDateText = await getArticleCreationDateText()
      expect(articleCreationDateText).toBe("Page created on 6 November 2001")
    }, timeout = 60000)

    test('pt', async () => {
      await openBrowserWithLanguage("en-UK")
      const articleCreationDateText = await getArticleCreationDateText()
      expect(articleCreationDateText).toBe("Page created on 6 November 2001")
    }, timeout = 60000)
  })
})

