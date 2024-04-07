const puppeteer = require("puppeteer")

const EXTENSIONID = "almhdgnjckianggfgaepdlcdcfcidife"


describe("Chrome Extension Popup Test", () => {
  let browser = null
  let wikipediaPage = null   
  let extensionPage = null

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: false,
      args: ["--disable-extensions-except=.", "--load-extension=popup/"],
    })
    wikipediaPage = await browser.newPage()
    await wikipediaPage.goto("https://en.wikipedia.org/wiki/Earth")

    extensionPage = await browser.newPage()
    await extensionPage.goto('chrome-extension://' + EXTENSIONID + '/popup/wikipedia_time_travel.html?tab=1')
    
  }, timeout=60000)

  test('should have the title "Wikipedia Time Travel"', async () => {
    const title = await extensionPage.title()
    expect(title).toBe("Wikipedia Time Travel")
    
  })

  afterAll(async () => {
    await browser.close();
  })
})
