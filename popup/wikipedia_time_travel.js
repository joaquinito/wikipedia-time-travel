const MEDIAWIKI_API_ENDPOINT = "https://en.wikipedia.org/w/index.php?"
const MEDIAWIKI_API_GET_REVISION =
  "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&formatversion=2&rvlimit=1&rvprop=timestamp%7Cids&origin=*"
const MEDIAWIKI_API_GET_FIRST_REVISION =
  "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&formatversion=2&rvlimit=1&rvprop=timestamp%7Cids&origin=*&rvdir=newer"

function isWikipediaArticle(url) {
  // Check if the URL matches the pattern of Wikipedia articles
  return url.includes("wikipedia.org/wiki/") || url.includes("wikipedia.org/w/index.php?title=")
}

function extractWikipediaArticleRawName(url) {
  // Extract the article title from the URL
  let articleName = null

  if (url.includes("wikipedia.org/wiki/")) {
    articleName = url.split("/wiki/")[1]
  } else if (url.includes("wikipedia.org/w/index.php?title=")) {
    // Create a URL object
    const parsedUrl = new URL(url)
    // Use URLSearchParams to work with the query string
    const queryParams = new URLSearchParams(parsedUrl.search)
    // Get the value of the "title" parameter
    articleName = queryParams.get("title")
  }

  return articleName
}

async function displayWikipediaArticleName(articleNameRaw) {
  // Extract the article name from the URL
  const articleName = decodeURIComponent(articleNameRaw).replace(/_/g, " ")
  // Get the creation date of the page
  const creationDate = await getCreationDate(articleNameRaw)
  // Display the article name and creation date
  document.getElementById("article-name").textContent = articleName
  document.getElementById("article-creation-date").textContent = "Created on " + creationDate
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

// Actions for popup open
document.addEventListener("DOMContentLoaded", () => {
  // Get currently open tab
  browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    var currentUrl = tabs[0].url
    var wikipediaPageRawName = ""
    // Check if the current page is a Wikipedia page
    if (isWikipediaArticle(currentUrl)) {
      console.log("Current tab is a Wikipedia article.")
      document.getElementById("placeholder-message").style.display = "none"
      wikipediaPageRawName = extractWikipediaArticleRawName(currentUrl)
      displayWikipediaArticleName(wikipediaPageRawName)
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

async function openArticleinSelectedDate(rawName, date) {
  fetch(
    MEDIAWIKI_API_GET_REVISION + "&titles=" + rawName + "&rvstart=" + date + "T23%3A59%3A59.000Z"
  )
    .then((response) => response.json())
    .then((data) => {
      // Parse JSON response and extract the revid
      const revId = data.query.pages[0].revisions[0].revid
      // Open corresponding revision page in current tab
      const oldPageUrl = MEDIAWIKI_API_ENDPOINT + "&oldid=" + revId
      browser.tabs.update({ url: oldPageUrl })
    })
    .catch((error) => console.error("Error fetching data:", error))
}
