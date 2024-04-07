const puppeteer = require("puppeteer")

const EXTENSIONID = "almhdgnjckianggfgaepdlcdcfcidife"

WIKIPEDIA_PAGE_EARTH = "https://en.wikipedia.org/wiki/Earth"

describe("Chrome Extension Popup Test", () => {
  let browser = null
  let wikipediaPage = null
  let extensionPage = null

  /* Setup and teardown */

  beforeEach(async () => {
    browser = await puppeteer.launch({
      headless: false,
      args: ["--disable-extensions-except=.", "--load-extension=popup/"],
    })
    wikipediaPage = await browser.newPage()
    await wikipediaPage.goto("https://en.wikipedia.org/wiki/Earth")

    await (await browser.pages())[0].close() // Close the first empty tab

    extensionPage = await browser.newPage()
    await extensionPage.goto(
      "chrome-extension://" +
        EXTENSIONID +
        "/popup/wikipedia_time_travel.html?testUrl=" +
        WIKIPEDIA_PAGE_EARTH
    )
  }, (timeout = 60000))

  afterEach(async () => {
    await browser.close()
  })

  /* Tests start here */

  describe("For the URL https://en.wikipedia.org/wiki/Earth", () => {
    
    test('should have the article name "Earth"', async () => {
      //Expect the <div id="article-name"> to be "Earth"
      let articleName = ""
      do {
        articleName = await extensionPage.$eval("#article-name", (el) => el.innerText)
      } while (articleName === "")
      expect(articleName).toBe("Earth")
    })

    test('should show the text "Page created on 6 November 2001"', async () => {
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
})
