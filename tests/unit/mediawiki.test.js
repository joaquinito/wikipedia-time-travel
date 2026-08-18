const {
  isWikipediaPage,
  isSelectedDateValid,
  getPageLanguage,
  getTodayIsoDate,
  getWikipediaPageName,
  getCreationDate,
  getRevisionUrlForDate,
  getRevisionTimestamp,
  ageInYearsAt,
  formatCreationDate
} = require("../../shared/mediawiki")

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


// Tests for getRevisionUrlForDate()
describe("Function getRevisionUrlForDate() ", () => {

  beforeEach(() => {
    fetchMock.resetMocks();
  });

  test("returns the URL of the revision that was the most recent one on the given date", async () => {

    fetchMock.mockResponseOnce(JSON.stringify({
      "query": {
        "pages": [
          {
            "pageid": 9228,
            "ns": 0,
            "title": "Earth",
            "revisions": [
              {
                "revid": 602452976,
                "parentid": 602358085,
                "timestamp": "2014-04-02T16:33:26Z"
              }
            ]
          }
        ]
      }
    }));

    expect(await getRevisionUrlForDate("Earth", "en", "2014-04-07")).toBe(
      "https://en.wikipedia.org/w/index.php?&oldid=602452976"
    )
  })

  test("replaces the spaces of the page name before calling the API", async () => {

    fetchMock.mockResponseOnce(JSON.stringify({
      "query": { "pages": [{ "revisions": [{ "revid": 1 }] }] }
    }));

    await getRevisionUrlForDate("Atlantic Ocean", "en", "2014-04-07")
    expect(fetchMock.mock.calls[0][0]).toContain("&titles=Atlantic_Ocean")
  })
})

// Tests for getRevisionTimestamp()
describe("Function getRevisionTimestamp() ", () => {

  beforeEach(() => {
    fetchMock.resetMocks();
  });

  test("returns the timestamp of the given revision", async () => {

    fetchMock.mockResponseOnce(JSON.stringify({
      "query": {
        "pages": [
          {
            "pageid": 9228,
            "title": "Earth",
            "revisions": [{ "timestamp": "2014-04-02T16:33:26Z" }]
          }
        ]
      }
    }));

    expect(await getRevisionTimestamp("602452976", "en")).toBe("2014-04-02T16:33:26Z")
  })
})

// Tests for ageInYearsAt()
describe("Function ageInYearsAt() ", () => {

  test("returns the age in completed years on the given date", () => {
    expect(ageInYearsAt("1955-02-24", new Date("2014-04-07T12:00:00Z"))).toBe(59)
  })

  test("has not counted the birthday of that year the day before it", () => {
    expect(ageInYearsAt("1955-04-08", new Date("2014-04-07T12:00:00Z"))).toBe(58)
  })

  test("counts the birthday of that year on the day itself", () => {
    expect(ageInYearsAt("1955-04-07", new Date("2014-04-07T12:00:00Z"))).toBe(59)
  })

  test("counts a 29 February birthday on 28 February of a non-leap year", () => {
    expect(ageInYearsAt("2000-02-29", new Date("2015-02-28T12:00:00Z"))).toBe(14)
  })

  test("is not thrown off by the reader's time zone", () => {
    // Late UTC on the day before a birthday is still the day before, anywhere
    expect(ageInYearsAt("1955-04-08", new Date("2014-04-07T23:30:00Z"))).toBe(58)
    expect(ageInYearsAt("1955-04-08", new Date("2014-04-08T00:30:00Z"))).toBe(59)
  })

  test("returns -1 for a date before the person was born", () => {
    expect(ageInYearsAt("2020-01-01", new Date("2014-04-07T12:00:00Z"))).toBe(-1)
  })
})

// Tests for formatCreationDate()
describe("Function formatCreationDate() ", () => {

  test("returns the date in a long format", () => {
    expect(formatCreationDate("2001-11-06")).toBe("November 6, 2001")
  })
})

// Tests for getTodayIsoDate()
describe("Function getTodayIsoDate() ", () => {

  test("returns today's date in the format used by input[type=date]", () => {
    expect(getTodayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test("returns the same date as the one the browser reports", () => {
    expect(getTodayIsoDate()).toBe(new Date().toISOString().split("T")[0])
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
