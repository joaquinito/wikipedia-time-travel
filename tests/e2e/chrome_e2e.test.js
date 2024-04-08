const puppeteer = require("puppeteer")

WIKIPEDIA_PAGE_EARTH = "https://en.wikipedia.org/wiki/Earth"

async function waitFor(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

describe("Chrome Extension Popup Test", () => {
  let browser = null
  let wikipediaPage = null
  let extensionPage = null
  let extensionId = null

  /* Setup and teardown */

  beforeEach(async () => {
    const isCI = process.env.CI === "true"

    browser = await puppeteer.launch({
      headless: isCI, // run in headless mode on CI, don't run in headless mode on local
      slowMo: 200,
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

    await browser.pages();
    const targets = await browser.targets();
    const backgroundPageTarget = targets.find(target => target.type() === 'service_worker');
    const backgroundPageUrl = backgroundPageTarget.url() || '';
    [, , extensionId] = backgroundPageUrl.split('/');

    extensionPage = await browser.newPage()
    await extensionPage.goto(
      "chrome-extension://" +
        extensionId +
        "/popup/wikipedia_time_travel.html?testUrl=" +
        WIKIPEDIA_PAGE_EARTH
    )

    await (await browser.pages())[0].close() // Close the first empty tab

  }, (timeout = 60000))

  afterEach(async () => {
    await browser.close()
  })

  /* Tests start here */

  describe("For the URL https://en.wikipedia.org/wiki/Earth", () => {
    test('popup should have the article name "Earth"', async () => {
      //Expect the <div id="article-name"> to be "Earth"
      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")
      expect(articleName).toBe("Earth")
    })

    test('popup should show the text "Page created on 6 November 2001"', async () => {
      let articleCreationDateText = ""
      do {
        articleCreationDateText = await extensionPage.$eval(
          "#article-creation-date",
          (el) => el.innerText
        )
      } while (articleCreationDateText === "")
      expect(articleCreationDateText).toBe("Page created on 6 November 2001")
    })
  })

  describe("For a URL that is not a Wikipedia page", () => {
    test('popup should show only the text "This is not a Wikipedia page"', async () => {
      
      await extensionPage.goto(
        "chrome-extension://" +
          extensionId +
          "/popup/wikipedia_time_travel.html?testUrl=https://google.com"
      )

      const placeholderMessageDisplayStyle = await extensionPage.$eval(
        "#placeholder-message",
        (el) => el.style.display
      )

      const articleNameText = await extensionPage.$eval("#article-name", (el) => el.innerText)

      const articleCreationDateText = await extensionPage.$eval(
        "#article-creation-date",
        (el) => el.innerText
      )

      const formBodyDisplayStyle = await extensionPage.$eval("#form-body", (el) => el.style.display)

      expect(placeholderMessageDisplayStyle).not.toBe("none")
      expect(articleNameText).toBe("")
      expect(articleCreationDateText).toBe("")
      expect(formBodyDisplayStyle).toBe("none")
    }, timeout = 20000)
  })
})
