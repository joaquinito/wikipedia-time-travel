const DATE_FORMAT_OPTIONS = { day: "numeric", month: "long", year: "numeric" }
const ENGLISH_LOCALE_CODES = ["en", "en-AU", "en-BZ", "en-CA", "en-GB", "en-HK", "en-IN",
                               "en-IE", "en-MY", "en-NZ", "en-SG",  "en-UK", "en-US", "en-ZA"]

// Date of the revision currently displayed by the popup, so quick jumps can be made
// relative to it instead of always relative to today
let currentlyShownDate = null

const MEDIAWIKI_INDEX_ENDPOINT = ".wikipedia.org/w/index.php?"
const MEDIAWIKI_API_QUERY = ".wikipedia.org/w/api.php?action=query&prop=info&format=json&origin=*"
const MEDIAWIKI_API_GET_REVISION =
  ".wikipedia.org/w/api.php?action=query&format=json&prop=revisions&formatversion=2&rvlimit=1&rvprop=timestamp%7Cids&origin=*"
const MEDIAWIKI_API_GET_FIRST_REVISION =
  ".wikipedia.org/w/api.php?action=query&format=json&prop=revisions&formatversion=2&rvlimit=1&rvprop=timestamp%7Cids&origin=*&rvdir=newer"

// Browser fetch() cannot set the User-Agent header itself, so identify via the header
// MediaWiki's API etiquette recommends instead: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
const API_REQUEST_HEADERS = {
  "Api-User-Agent": "WikipediaTimeTravel/1.0 (https://github.com/joaquinito/wikipedia-time-travel)",
}


/**
 * Get the URL of the currently active tab
 * @returns {string} - URL of the currently active tab
 */
function getCurrentTabUrl() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0]
      resolve(currentTab.url)
    })
  })
}

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
 * Get the language code of the Wikipedia page
 * @param {string} url - URL of the page
 * @returns {string} - Language code of the Wikipedia page (e.g. "en", "es")
 * */
function getPageLanguage(url) {
  const urlObj = new URL(url)
  return urlObj.hostname.split(".")[0]
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

  return selectedDate >= creationDate && selectedDate <= today ? true : false
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
  // Parameterized Wikipedia article URL
  if (url.includes("wikipedia.org/w/index.php")) {
    const parsedUrl = new URL(url)
    const queryParams = new URLSearchParams(parsedUrl.search)

    if (queryParams.has("title")) {
      const pageRawName = queryParams.get("title")
      return decodeURIComponent(pageRawName).replace(/_/g, " ")
    }
    if (queryParams.has("oldid")) {
      // If title is not present in the URL, get the title using the MediaWiki API
      const response = await fetch(
        "https://" +
          getPageLanguage(url) +
          MEDIAWIKI_API_QUERY +
          "&revids=" +
          queryParams.get("oldid"),
        { headers: API_REQUEST_HEADERS }
      )
      const data = await response.json()
      const pageId = Object.keys(data.query.pages)
      return data.query.pages[pageId].title
    }
    throw new Error("Could not extract article name from URL.")
  }
}

/**
 * Get the revision id from a Wikipedia URL, if it has one
 * @param {string} url - URL of the page
 * @returns {string|null} - Revision id, or null if the URL has none
 */
function getRevisionIdFromUrl(url) {
  const urlObj = new URL(url)
  const queryParams = new URLSearchParams(urlObj.search)
  return queryParams.get("oldid")
}

/**
 * Format a "YYYY-MM-DD" date string as a long-form date, following the browser's locale
 * @param {string} dateString - Date in the format "YYYY-MM-DD"
 * @returns {string} - Long-form date, e.g. "10 July 2020" or "July 10, 2020"
 */
function formatDateForDisplay(dateString) {
  const dateObj = new Date(dateString)
  const browserLanguage = navigator.language
  return ENGLISH_LOCALE_CODES.includes(browserLanguage)
    ? dateObj.toLocaleDateString(browserLanguage, DATE_FORMAT_OPTIONS)
    : dateObj.toLocaleDateString("en-GB", DATE_FORMAT_OPTIONS)
}

/**
 * Get the date N days/weeks/months/years before a reference date, in "YYYY-MM-DD" format,
 * clamped to minDate so it never lands before the page existed.
 * @param {number|string} amount - How many units to go back
 * @param {string} unit - One of "days", "weeks", "months", "years"
 * @param {string} minDate - Earliest allowed date, in "YYYY-MM-DD" format
 * @param {string} [referenceDate] - Date to count back from, in "YYYY-MM-DD" format. Defaults to today
 * @returns {string} - Date in the format "YYYY-MM-DD"
 */
function getRelativeDateString(amount, unit, minDate, referenceDate) {
  const n = parseInt(amount, 10) || 1
  const date = referenceDate ? new Date(referenceDate) : new Date()

  if (unit === "days") date.setDate(date.getDate() - n)
  else if (unit === "weeks") date.setDate(date.getDate() - n * 7)
  else if (unit === "months") date.setMonth(date.getMonth() - n)
  else date.setFullYear(date.getFullYear() - n)

  const dateString = date.toISOString().split("T")[0]
  return dateString < minDate ? minDate : dateString
}

/**
 * Get the creation date of a Wikipedia page, by calling the MediaWiki API.
 * @param {string} pageName - Page name
 * @param {string} language - Language code of the Wikipedia page (e.g. "en", "es")
 * @returns {string} - Date in the format "YYYY-MM-DD"
 */
async function getCreationDate(pageName, language) {
  try {
    var response = await fetch(
      "https://" +
        language +
        MEDIAWIKI_API_GET_FIRST_REVISION +
        "&titles=" +
        pageName.replace(/ /g, "_"),
      { headers: API_REQUEST_HEADERS }
    )
    var data = await response.json()
  } catch (error) {
    console.error("Error fetching data:", error)
  }

  const creation_timestamp = data.query.pages[0].revisions[0].timestamp
  return creation_timestamp.split("T")[0]
}

/**
 * Remember the date that was requested to reach a given revision, so the popup can
 * later remind the user what they were looking at.
 * @param {string|number} revId - Revision id
 * @param {string} date - Date in the format "YYYY-MM-DD"
 */
function rememberFetchedDate(revId, date) {
  chrome.storage.local.get({ fetchedDates: {} }, (result) => {
    const fetchedDates = result.fetchedDates
    fetchedDates[revId] = date
    chrome.storage.local.set({ fetchedDates })
  })
}

/**
 * Recall the date that was previously requested to reach a given revision, if any
 * @param {string|number} revId - Revision id
 * @returns {Promise<string|undefined>} - Date in the format "YYYY-MM-DD", or undefined
 */
function recallFetchedDate(revId) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ fetchedDates: {} }, (result) => {
      resolve(result.fetchedDates[revId])
    })
  })
}

/**
 * Display the article name and creation date on the popup
 * @param {string} pageName - Name of the Wikipedia page
 * @param {string} language - Language code of the Wikipedia page (e.g. "en", "es")
 */
async function displayWikipediaPageData(pageName, language) {

  // Get the creation date of the page, display it according to the browser's locale
  const creationDate = await getCreationDate(pageName, language)
  const creationDateLongFormat = formatDateForDisplay(creationDate)

  //Update min and max date for the date picker
  document.getElementById("date-picker").min = creationDate
  document.getElementById("date-picker").max = new Date().toISOString().split("T")[0]

  // Display the article name, creation date and form
  document.getElementById("article-name").textContent = pageName
  document.getElementById("article-creation-date").textContent =
    "Page created on " + creationDateLongFormat  
  document.getElementById("form-body").style.display = "block"
  document.getElementById("loader").style.display = "none"

  // Fades the content in once the skeleton is replaced by real data
  document.body.classList.add("is-ready")
}

/**
 * Show the "Currently showing page on <date>" notice below the creation date,
 * unless that date is today, in which case this is simply the current version of the page.
 * @param {string} date - Date in the format "YYYY-MM-DD"
 */
function displayFetchedDateNotice(date) {
  currentlyShownDate = date

  const today = new Date().toISOString().split("T")[0]
  if (date === today) return

  document.getElementById("viewing-date-notice").textContent =
    "🕰️ Currently showing page on " + formatDateForDisplay(date)
  document.getElementById("viewing-date-notice").style.display = "block"
}

/**
 * Redirect current tab to the Wikipedia page revision that was most recent in
 * at the end of the selected date.
 * @param {string} pageName - Name of the Wikipedia page
 * * @param {string} language - Language code of the Wikipedia page (e.g. "en", "es")
 * @param {string} date - Date in the format "YYYY-MM-DD"
 */
async function openPageInSelectedDate(pageName, language, date) {
  try {
    var response = await fetch(
      "https://" +
        language +
        MEDIAWIKI_API_GET_REVISION +
        "&titles=" +
        pageName.replace(/ /g, "_") +
        "&rvstart=" +
        date +
        "T23%3A59%3A59.999Z",
      { headers: API_REQUEST_HEADERS }
    )
    var data = await response.json()
  } catch (error) {
    console.error("Error fetching data:", error)
  }

  // Parse JSON response and extract the revid
  const revId = data.query.pages[0].revisions[0].revid
  // Remember the requested date, so a later visit to this revision can show it again
  rememberFetchedDate(revId, date)
  // Update the popup's own notice right away, without waiting for it to be reopened
  displayFetchedDateNotice(date)
  // Open corresponding revision page in current tab
  const oldPageUrl = "https://" + language + MEDIAWIKI_INDEX_ENDPOINT + "&oldid=" + revId
  chrome.tabs.update({ url: oldPageUrl })
}

/**
 * Main function - runs when the popup is opened
 */
document.addEventListener("DOMContentLoaded", async () => {
  const submitButton = document.getElementById("submit-button")
  const datePicker = document.getElementById("date-picker")
  const relativeGoButton = document.getElementById("relative-go-button")
  const relativeAmountInput = document.getElementById("relative-amount")
  const relativeUnitSelect = document.getElementById("relative-unit")

  // Submit button is disabled by default
  submitButton.disabled = true

  // If end-to-end tests are running, use the test URL provided in the query string
  const URL_PARAMS = new URLSearchParams(window.location.search)
  const testParam = URL_PARAMS.get("testUrl")

  // Get the URL of the current tab (or use the test URL if provided)
  const currentUrl = (testParam === null ? await getCurrentTabUrl() : testParam)

  var wikipediaPageName = ""
  var wikipediaPageLanguage = ""

  // Check if the current page is a Wikipedia page, display page data and form if so
  if (isWikipediaPage(currentUrl)) {
    console.log("Current tab is a Wikipedia page.")
    document.getElementById("placeholder-message").style.display = "none"
    wikipediaPageName = await getWikipediaPageName(currentUrl)
    wikipediaPageLanguage = getPageLanguage(currentUrl)
    displayWikipediaPageData(wikipediaPageName, wikipediaPageLanguage)

    // If this revision was reached through this extension before, remind the user
    // what date they last jumped to
    const revId = getRevisionIdFromUrl(currentUrl)
    if (revId) {
      const rememberedDate = await recallFetchedDate(revId)
      if (rememberedDate) displayFetchedDateNotice(rememberedDate)
    }

  } else {
    console.log("Current tab is not a Wikipedia page.")
    document.getElementById("placeholder-message").style.display = "block"
    document.getElementById("loader").style.display = "none"
    document.body.classList.add("is-ready")
  }

  /* After the user selects a date in the date picker, enable the submit button 
  if the date is between page creation date and current date */
  datePicker.addEventListener("input", () => {
    submitButton.disabled = datePicker.value && isSelectedDateValid(datePicker) ? false : true
  })

  // Open the revision when the submit button is clicked
  submitButton.addEventListener("click", async () => {
    const inputDate = document.getElementById("date-picker").value
    await openPageInSelectedDate(wikipediaPageName, wikipediaPageLanguage, inputDate)
  })

  // Open the revision closest to N days/weeks/months/years before the currently shown date
  // (or today, if no jump has been made yet) when the quick jump button is clicked
  relativeGoButton.addEventListener("click", async () => {
    const targetDate = getRelativeDateString(
      relativeAmountInput.value,
      relativeUnitSelect.value,
      datePicker.min,
      currentlyShownDate
    )
    await openPageInSelectedDate(wikipediaPageName, wikipediaPageLanguage, targetDate)
  })
})

// module.exports is used when running the tests with Node
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    isWikipediaPage,
    isSelectedDateValid,
    getPageLanguage,
    getWikipediaPageName,
    getCreationDate,
    getRelativeDateString,
    getRevisionIdFromUrl,
    formatDateForDisplay,
  }
}
