const MEDIAWIKI_API_ENDPOINT = "https://en.wikipedia.org/w/index.php?"
const MEDIAWIKI_API_QUERY =
  "https://en.wikipedia.org/w/api.php?action=query&prop=info&format=json&origin=*"
const MEDIAWIKI_API_GET_REVISION =
  "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&formatversion=2&rvlimit=1&rvprop=timestamp%7Cids&origin=*"
const MEDIAWIKI_API_GET_FIRST_REVISION =
  "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&formatversion=2&rvlimit=1&rvprop=timestamp%7Cids&origin=*&rvdir=newer"

/**
 * Check if the URL leads to an Wikipedia page (legacy revisions included)
 * @param {string} url - URL to check
 * @returns {boolean} - True if the URL is a Wikipedia page, false otherwise
 */
function isWikipediaPage(url) {
  return (
    url.includes("wikipedia.org/wiki/") ||
    url.includes("wikipedia.org/w/index.php?title=") ||
    url.includes("wikipedia.org/w/index.php?&oldid=")
  )
}

/**
 * Check if the selected date is valid (between the creation date and today)
 * @param {object} datePicker - HTML input of type="date"
 * @returns {bool} - True if the selected date is valid, false otherwise
 */
function isSelectedDateValid(datePicker) {
  const today = new Date().toISOString().split("T")[0]
  const selectedDate = new Date(datePicker.value).toISOString().split("T")[0]
  const creationDate = new Date(datePicker.min).toISOString().split("T")[0]

  return (selectedDate >= creationDate && selectedDate <= today)? true : false
}

/**
 * Get the article name from a Wikipedia URL
 * @param {string} url - URL of the page
 * @returns {string} - Wikipedia page name
 */
async function getWikipediaPageName(url) {

  // Regular Wikipedia article URL
  if (url.includes("wikipedia.org/wiki/")) {
    const pageRawName = url.split("/wiki/")[1].split("#")[0]
    return decodeURIComponent(pageRawName).replace(/_/g, " ")
  }
  // Paraterized Wikipedia article URL
  if (url.includes("wikipedia.org/w/index.php")) {
    const parsedUrl = new URL(url)
    const queryParams = new URLSearchParams(parsedUrl.search)

    if (queryParams.has("title")) {
      const pageRawName = queryParams.get("title")
      return decodeURIComponent(pageRawName).replace(/_/g, " ")
    }
    if (queryParams.has("oldid")) {
      // If title is not present in the URL, get the title using the MediaWiki API
      const response = await fetch(MEDIAWIKI_API_QUERY + "&revids=" + queryParams.get("oldid"))
      const data = await response.json()
      const pageId = Object.keys(data.query.pages)
      return data.query.pages[pageId].title
    }
    throw new Error("Could not extract article name from URL.")
  }
}

/**
 * Get the creation date of a Wikipedia page, by calling the MediaWiki API.
 * @param {string} pageName - Page name
 * @returns {string} - Date in the format "YYYY-MM-DD"
 */
async function getCreationDate(pageName) {
  try {
    var response = await fetch(
      MEDIAWIKI_API_GET_FIRST_REVISION + "&titles=" + pageName.replace(/ /g, "_")
    )
    var data = await response.json()
  } catch (error) {
    console.error("Error fetching data:", error)
  }

  const creation_timestamp = data.query.pages[0].revisions[0].timestamp
  return creation_timestamp.split("T")[0]
}

/**
 * Display the article name and creation date on the popup
 * @param {string} pageName - Name of the Wikipedia page
 */
async function displayWikipediaPageData(pageName) {
  // Get the creation date of the page
  const creationDate = await getCreationDate(pageName)
  const dateObj = new Date(creationDate)
  const dateFormatOptions = { day: "numeric", month: "long", year: "numeric" }
  const creationDateLongFormat = dateObj.toLocaleDateString("en-GB", dateFormatOptions)

  //Update min and max date for the date picker
  document.getElementById("date-picker").min = creationDate
  document.getElementById("date-picker").max = new Date().toISOString().split("T")[0]

  // Display the article name and creation date
  document.getElementById("article-name").textContent = pageName
  document.getElementById("article-creation-date").textContent =
    "Page created on " + creationDateLongFormat
}

/**
 * Redirect current tab to the Wikipedia page revision that was most recent in
 * at the end of the selected date.
 * @param {string} pageName - Name of the Wikipedia page
 * @param {string} date - Date in the format "YYYY-MM-DD"
 */
async function openPageInSelectedDate(pageName, date) {
  try {
    var response = await fetch(
      MEDIAWIKI_API_GET_REVISION +
        "&titles=" +
        pageName.replace(/ /g, "_") +
        "&rvstart=" +
        date +
        "T23%3A59%3A59.999Z"
    )
    var data = await response.json()
  } catch (error) {
    console.error("Error fetching data:", error)
  }

  // Parse JSON response and extract the revid
  const revId = data.query.pages[0].revisions[0].revid
  // Open corresponding revision page in current tab
  const oldPageUrl = MEDIAWIKI_API_ENDPOINT + "&oldid=" + revId

  chrome.tabs.update({ url: oldPageUrl })
}

/**
 * Main function - runs when the popup is opened
 */
document.addEventListener("DOMContentLoaded", () => {
  const submitButton = document.getElementById("submit-button")
  const datePicker = document.getElementById("date-picker")

  // Submit button is disabled by default
  submitButton.disabled = true

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    // Get currently open tab
    var currentUrl = tabs[0].url
    // Raw page name is the article name in the URL format
    var wikipediaPageName = ""

    // Check if the current page is a Wikipedia page, display page data and form if so
    if (isWikipediaPage(currentUrl)) {
      console.log("Current tab is a Wikipedia page.")
      document.getElementById("placeholder-message").style.display = "none"
      wikipediaPageName = await getWikipediaPageName(currentUrl)
      displayWikipediaPageData(wikipediaPageName)
    } else {
      console.log("Current tab is not a Wikipedia page.")
      document.getElementById("form-body").style.display = "none"
    }

    /* After the user selects a date in the date picker, enable the submit button 
    if the date is between page creation date and current date*/
    datePicker.addEventListener("input", () => {
      submitButton.disabled = datePicker.value && isSelectedDateValid(datePicker) ? false : true
    })

    // Open the revision when the submit button is clicked
    submitButton.addEventListener("click", async () => {
      const inputDate = document.getElementById("date-picker").value
      await openPageInSelectedDate(wikipediaPageName, inputDate)
    })
  })
})

// module.exports is used when running the tests with Node
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    isWikipediaPage,
    isSelectedDateValid,
    getWikipediaPageName,
    getCreationDate,
  }
}
