const {
  isWikipediaPage,
  isSelectedDateValid,
  getPageLanguage,
  getWikipediaPageName,
  getCreationDate,
  getRelativeDateString,
  getRevisionIdFromUrl,
  formatDateForDisplay,
  setJumpStatus
} = require("../../popup/wikipedia_time_travel")

const fetchMock = require('jest-fetch-mock');
fetchMock.enableMocks();

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


describe("Function getPageLanguage() ", () => {

  test("returns the language code of the Wikipedia page", () => {
    expect(getPageLanguage("https://en.wikipedia.org/wiki/Atlantic_Ocean")).toBe("en")
  })
})

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

describe("Function getRelativeDateString() ", () => {

  function isoDaysAgo(days) {
    const date = new Date()
    date.setDate(date.getDate() - days)
    return date.toISOString().split("T")[0]
  }

  test("returns the date N days before today", () => {
    expect(getRelativeDateString(10, "days", "2000-01-01")).toBe(isoDaysAgo(10))
  })

  test("returns the date N weeks before today", () => {
    expect(getRelativeDateString(2, "weeks", "2000-01-01")).toBe(isoDaysAgo(14))
  })

  test("returns the date N months before today", () => {
    const expected = new Date()
    expected.setMonth(expected.getMonth() - 3)
    expect(getRelativeDateString(3, "months", "2000-01-01")).toBe(
      expected.toISOString().split("T")[0]
    )
  })

  test("returns the date N years before today, which is the default", () => {
    const expected = new Date()
    expected.setFullYear(expected.getFullYear() - 1)
    expect(getRelativeDateString(1, "years", "2000-01-01")).toBe(
      expected.toISOString().split("T")[0]
    )
  })

  test("clamps to minDate when the computed date would be earlier", () => {
    expect(getRelativeDateString(50, "years", "2010-06-15")).toBe("2010-06-15")
  })

  test("treats a missing or non-numeric amount as 1", () => {
    expect(getRelativeDateString(undefined, "years", "2000-01-01")).toBe(
      getRelativeDateString(1, "years", "2000-01-01")
    )
  })

  test("returns the date N years before a given reference date, instead of today", () => {
    expect(getRelativeDateString(1, "years", "2000-01-01", "2025-08-22")).toBe("2024-08-22")
  })

  test("returns the date N months before a given reference date", () => {
    expect(getRelativeDateString(3, "months", "2000-01-01", "2025-08-22")).toBe("2025-05-22")
  })

  test("clamps a reference-date computation to minDate when it would be earlier", () => {
    expect(getRelativeDateString(50, "years", "2010-06-15", "2025-08-22")).toBe("2010-06-15")
  })
})

// Tests for getRevisionIdFromUrl()
describe("Function getRevisionIdFromUrl() ", () => {

  test("returns the revision id from a URL that has one", () => {
    expect(getRevisionIdFromUrl("https://en.wikipedia.org/w/index.php?&oldid=602452976")).toBe(
      "602452976"
    )
  })

  test("returns null for a URL without a revision id", () => {
    expect(getRevisionIdFromUrl("https://en.wikipedia.org/wiki/Lisbon")).toBe(null)
  })
})

// Tests for formatDateForDisplay()
describe("Function formatDateForDisplay() ", () => {
  const originalLanguage = navigator.language

  afterEach(() => {
    Object.defineProperty(navigator, "language", { value: originalLanguage, configurable: true })
  })

  test("formats the date following an English browser locale", () => {
    Object.defineProperty(navigator, "language", { value: "en-US", configurable: true })
    expect(formatDateForDisplay("2020-07-10")).toBe("July 10, 2020")
  })

  test("falls back to day/month/year order for a non-English browser locale", () => {
    Object.defineProperty(navigator, "language", { value: "pt-PT", configurable: true })
    expect(formatDateForDisplay("2020-07-10")).toBe("10 July 2020")
  })
})

describe("Function setJumpStatus() ", () => {

  beforeEach(() => {
    document.body.innerHTML = '<div id="jump-status" hidden></div>'
  })

  test("shows the message and un-hides the status line", () => {
    setJumpStatus("Loading previous version of the page...")

    const status = document.getElementById("jump-status")
    expect(status.textContent).toBe("Loading previous version of the page...")
    expect(status.hidden).toBe(false)
    expect(status.classList.contains("is-error")).toBe(false)
  })

  test("hides the status line and clears its text when passed null", () => {
    setJumpStatus("Loading previous version of the page...")
    setJumpStatus(null)

    const status = document.getElementById("jump-status")
    expect(status.hidden).toBe(true)
    expect(status.textContent).toBe("")
  })

  test("marks the message as an error when isError is true", () => {
    setJumpStatus("Could not load that revision.", true)
    expect(document.getElementById("jump-status").classList.contains("is-error")).toBe(true)
  })
})
