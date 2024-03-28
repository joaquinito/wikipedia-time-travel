const {
  isWikipediaPage,
  isSelectedDateValid,
  getPageLanguage,
  getWikipediaPageName,
  getCreationDate
} = require("../popup/wikipedia_time_travel")

const fetchMock = require('jest-fetch-mock');
fetchMock.enableMocks();

// Tests for isWikipediaPage()
describe("Function isWikipediaArticle() ", () => {

  test("returns true for regular Wikipedia article URLs (/wiki/<article_name>)", () => {
    expect(isWikipediaPage("https://en.wikipedia.org/wiki/Lisbon")).toBe(true)
  })

  test("returns true for parameterized Wikipedia article URLs (/w/index.php?title=<article_name>)", () => {
    expect(isWikipediaPage("https://en.wikipedia.org/w/index.php?title=Lisbon")).toBe(true)
  })

  test("returns true for URLS of old revisions of Wikipedia articles (/w/index.php?&oldid=<id>)", () => {
    expect(isWikipediaPage("https://en.wikipedia.org/w/index.php?&oldid=1192826347")).toBe(true)
  })

  test("returns false for other URLS", () => {
    expect(isWikipediaPage("https://google.com")).toBe(false)
  })
})

// Tests for getWikipediaPageName()
describe("Function getWikipediaPageName() ", () => {

  beforeEach(() => {
    fetchMock.resetMocks();
  });

  test("returns article name if regular Wikipedia article URL", async () => {
    expect(await getWikipediaPageName("https://en.wikipedia.org/wiki/Atlantic_Ocean")).toBe(
      "Atlantic Ocean"
    )
  })

  test("returns article name if Wikipedia article section URL", async () => {
    expect(await getWikipediaPageName("https://en.wikipedia.org/wiki/Atlantic_Ocean")).toBe(
      "Atlantic Ocean"
    )
  })

  test("returns article name if parameterized Wikipedia article URL", async () => {
    expect(await getWikipediaPageName("https://en.wikipedia.org/w/index.php?title=Atlantic_Ocean")).toBe(
      "Atlantic Ocean"
    )
  })

  test("returns article name if given URL of old revision of Wikipedia article with just the parameter 'oldid'", async () => {
    
    // Mock the fetch function inside the function being tested
    fetchMock.mockResponseOnce(JSON.stringify({
      "query": {
        "pages": {
          "1": { "title": "Atlantic Ocean" }
        }
      }
    }));
    
    expect(await getWikipediaPageName("https://en.wikipedia.org/w/index.php?&oldid=1190893509")).toBe(
      "Atlantic Ocean"
    )
  })
})


// Tests for getPageLanguage()
describe("Function getPageLanguage() ", () => {

  test("returns the language code of the Wikipedia page", () => {
    expect(getPageLanguage("https://en.wikipedia.org/wiki/Atlantic_Ocean")).toBe("en")
  })
})

// Tests for getCreationDate()
describe("Function getCreationDate() ", () => {
   
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  test("returns the creation date of a Wikipedia page, given the page name", async () => {

    fetchMock.mockResponseOnce(JSON.stringify({
      "query": {
        "pages": [
          {
            "pageid": 698,
            "ns": 0,
            "title": "Atlantic Ocean",
            "revisions": [
              {
                "revid": 233984,
                "parentid": 0,
                "timestamp": "2001-11-12T17:29:34Z"
              }
            ]
          }
        ]
      }
    }));
    
    expect(await getCreationDate("Atlantic Ocean")).toBe("2001-11-12")
  })

})


// Tests for isSelectedDateValid()
describe("Function isSelectedDateValid() ", () => {

  test("returns true if the selected date is between input.min and current date", () => {
    const datePickerObj = {
      value: "2020-01-01T23:59:59.999Z",
      min: "2003-01-01T20:05:01.983Z"
    }
    expect(isSelectedDateValid(datePickerObj)).toBe(true)
  })

  test("returns true if the selected date is the same as input.min", () => {
    const datePickerObj = {
      value: "2003-01-01T23:59:59.999Z",
      min: "2003-01-01T20:05:01.983Z"
    }
    expect(isSelectedDateValid(datePickerObj)).toBe(true)
  })

  test("returns true if the selected date is the same as current date", () => {
    const datePickerObj = {
      value: new Date().toISOString(),
      min: "2003-01-01T20:05:01.983Z"
    }
    expect(isSelectedDateValid(datePickerObj)).toBe(true)
  })

  test("returns false if the selected date is earlier than input.min", () => {
    const datePickerObj = {
      value: "2020-01-01T23:59:59.999Z",
      min: "2022-03-28T20:05:01.983Z"
    }
    expect(isSelectedDateValid(datePickerObj)).toBe(false)
  })

  test("returns false if the selected date is later than current date", () => {
    const datePickerObj = {
      value: "2100-01-01T23:59:59.999Z",
      min: "2022-03-28T20:05:01.983Z"
    }
    expect(isSelectedDateValid(datePickerObj)).toBe(false)
  })
  
})
