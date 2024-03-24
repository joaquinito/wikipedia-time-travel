const {
  isWikipediaArticle,
  extractWikipediaArticleRawName,
} = require("../popup/wikipedia_time_travel")

const fetchMock = require('jest-fetch-mock');
fetchMock.enableMocks();

describe("Function isWikipediaArticle() ", () => {
  test("should return true for regular Wikipedia article URLs (/wiki/<article_name>)", () => {
    expect(isWikipediaArticle("https://en.wikipedia.org/wiki/Lisbon")).toBe(true)
  })

  test("should return true for parameterized Wikipedia article URLs (/w/index.php?title=<article_name>)", () => {
    expect(isWikipediaArticle("https://en.wikipedia.org/w/index.php?title=Lisbon")).toBe(true)
  })

  test("should return true for URLS of old revisions of Wikipedia articles (/w/index.php?&oldid=<id>)", () => {
    expect(isWikipediaArticle("https://en.wikipedia.org/w/index.php?&oldid=1192826347")).toBe(true)
  })

  test("should return false for other URLS", () => {
    expect(isWikipediaArticle("https://google.com")).toBe(false)
  })
})

describe("Function extractWikipediaArticleRawName() ", () => {

  beforeEach(() => {
    fetchMock.resetMocks();
  });

  test("should return article name with underscores if regular Wikipedia article URL", async () => {
    expect(await extractWikipediaArticleRawName("https://en.wikipedia.org/wiki/Atlantic_Ocean")).toBe(
      "Atlantic_Ocean"
    )
  })

  test("should return article name with underscores if parameterized Wikipedia article URL", async () => {
    expect(await extractWikipediaArticleRawName("https://en.wikipedia.org/w/index.php?title=Atlantic_Ocean")).toBe(
      "Atlantic_Ocean"
    )
  })

  test("should return article name with whitespaces if URL of old revision of Wikipedia article with only the parameter 'oldid'", async () => {
    
    // Mock the fetch function inside the function being tested
    fetchMock.mockResponseOnce(JSON.stringify({
      "query": {
        "pages": {
          "1": { "title": "Atlantic Ocean" }
        }
      }
    }));
    
    expect(await extractWikipediaArticleRawName("https://en.wikipedia.org/w/index.php?&oldid=1190893509")).toBe(
      "Atlantic Ocean"
    )
  })

})
