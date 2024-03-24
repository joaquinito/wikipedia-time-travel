const MEDIAWIKI_API_ENDPOINT = "https://en.wikipedia.org/w/index.php?"
const MEDIAWIKI_API_QUERY =
  "https://en.wikipedia.org/w/api.php?action=query&prop=info&format=json&origin=*"
const MEDIAWIKI_API_GET_REVISION =
  "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&formatversion=2&rvlimit=1&rvprop=timestamp%7Cids&origin=*"
const MEDIAWIKI_API_GET_FIRST_REVISION =
  "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&formatversion=2&rvlimit=1&rvprop=timestamp%7Cids&origin=*&rvdir=newer"

function isWikipediaArticle(url) {
  return (
    url.includes("wikipedia.org/wiki/") ||
    url.includes("wikipedia.org/w/index.php?title=") ||
    url.includes("wikipedia.org/w/index.php?&oldid=")
  )
}

async function extractWikipediaArticleRawName(url) {
  if (url.includes("wikipedia.org/wiki/")) {
    return url.split("/wiki/")[1]
  }
  if (url.includes("wikipedia.org/w/index.php")) {
    const parsedUrl = new URL(url)
    const queryParams = new URLSearchParams(parsedUrl.search)

    if (queryParams.has("title")) {
      return queryParams.get("title")
    }
    if (queryParams.has("oldid")) {
      const response = await fetch(MEDIAWIKI_API_QUERY + "&revids=" + queryParams.get("oldid"))
      const data = await response.json()
      const pageId = Object.keys(data.query.pages)
      return data.query.pages[pageId].title
    } else {
      throw new Error("Could not extract article name from URL.")
    }
  }
}

async function displayWikipediaArticleData(articleNameRaw) {
  console.log("Raw name: " + articleNameRaw)
  const articleName = decodeURIComponent(articleNameRaw).replace(/_/g, " ")
  // Get the creation date of the page
  console.log("Clean name: " + articleName)
  const creationDate = await getCreationDate(articleNameRaw)
  // Display the article name and creation date
  document.getElementById("article-name").textContent = articleName
  document.getElementById("article-creation-date").textContent = "Page created on " + creationDate
}

async function getCreationDate(articleName) {
  // Call to MediaWiki API to get first revision of the page
  const response = await fetch(MEDIAWIKI_API_GET_FIRST_REVISION + "&titles=" + articleName)
  const data = await response.json()

  // Get timestamp, convert to human-readable format
  var creation_timestamp = data.query.pages[0].revisions[0].timestamp
  console.log("timestamp:", creation_timestamp)
  const dateObj = new Date(creation_timestamp)
  console.log(dateObj)
  const dateFormatOptions = { day: "numeric", month: "long", year: "numeric" }
  formattedDate = dateObj.toLocaleDateString("en-GB", dateFormatOptions)
  console.log(formattedDate)
  return formattedDate
}

async function openArticleinSelectedDate(rawName, date) {
  try {
    var response = fetch(
      MEDIAWIKI_API_GET_REVISION + "&titles=" + rawName + "&rvstart=" + date + "T23%3A59%3A59.000Z"
    )
  } catch (error) {
    console.error("Error fetching data:", error)
  }

  const data = response.json()

  // Parse JSON response and extract the revid
  const revId = data.query.pages[0].revisions[0].revid
  // Open corresponding revision page in current tab
  const oldPageUrl = MEDIAWIKI_API_ENDPOINT + "&oldid=" + revId
  chrome.tabs.update({ url: oldPageUrl })
}


document.addEventListener("DOMContentLoaded", () => {
  // Get currently open tab
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    var currentUrl = tabs[0].url
    var wikipediaPageRawName = ""
    // Check if the current page is a Wikipedia page
    if (isWikipediaArticle(currentUrl)) {
      console.log("Current tab is a Wikipedia article.")
      document.getElementById("placeholder-message").style.display = "none"
      wikipediaPageRawName = await extractWikipediaArticleRawName(currentUrl)
      displayWikipediaArticleData(wikipediaPageRawName)
    } else {
      console.log("Current tab is not a Wikipedia article.")
      document.getElementById("form-body").style.display = "none"
    }

    const submitButton = document.getElementById("submit-button")
    submitButton.addEventListener("click", async () => {
      const inputDate = document.getElementById("date").value
      console.log(inputDate)
      await openArticleinSelectedDate(wikipediaPageRawName, inputDate)
    })
  })
})

// module.exports is used when running the tests with Node 
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isWikipediaArticle,
    extractWikipediaArticleRawName,
  };
}
