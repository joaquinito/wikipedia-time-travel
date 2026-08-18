/*
Helpers for talking to the MediaWiki API and for reading Wikipedia URLs.

This file is loaded as a plain script by both the popup page and the in-page
widget (as the first entry of the content script list), so everything here is
declared in the shared script scope rather than exported as a module. The
CommonJS tail at the bottom is only there so the unit tests can require it.
*/

const MEDIAWIKI_INDEX_ENDPOINT = ".wikipedia.org/w/index.php?"
const MEDIAWIKI_API_QUERY = ".wikipedia.org/w/api.php?action=query&prop=info&format=json&origin=*"
const MEDIAWIKI_API_GET_REVISION =
  ".wikipedia.org/w/api.php?action=query&format=json&prop=revisions&formatversion=2&rvlimit=1&rvprop=timestamp%7Cids&origin=*"
const MEDIAWIKI_API_GET_FIRST_REVISION =
  ".wikipedia.org/w/api.php?action=query&format=json&prop=revisions&formatversion=2&rvlimit=1&rvprop=timestamp%7Cids&origin=*&rvdir=newer"

/* Locales for which the browser's own long date format is used as-is. Any
other locale falls back to en-GB, so the English label reads correctly. */
const ENGLISH_LOCALE_CODES = [
  "en", "en-AU", "en-BZ", "en-CA", "en-GB", "en-HK", "en-IN",
  "en-IE", "en-MY", "en-NZ", "en-SG", "en-UK", "en-US", "en-ZA",
]

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
 * Today's date, in the format used by input[type="date"]
 * @returns {string} - Date in the format "YYYY-MM-DD"
 */
function getTodayIsoDate() {
  return new Date().toISOString().split("T")[0]
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
          queryParams.get("oldid")
      )
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
 * @param {string} language - Language code of the Wikipedia page (e.g. "en", "es")
 * @returns {string} - Date in the format "YYYY-MM-DD"
 */
async function getCreationDate(pageName, language) {
  const response = await fetch(
    "https://" +
      language +
      MEDIAWIKI_API_GET_FIRST_REVISION +
      "&titles=" +
      pageName.replace(/ /g, "_")
  )
  const data = await response.json()

  const creation_timestamp = data.query.pages[0].revisions[0].timestamp
  return creation_timestamp.split("T")[0]
}

/**
 * Get the URL of the revision of a Wikipedia page that was the most recent one
 * at the end of the given date.
 * @param {string} pageName - Name of the Wikipedia page
 * @param {string} language - Language code of the Wikipedia page (e.g. "en", "es")
 * @param {string} date - Date in the format "YYYY-MM-DD"
 * @returns {string} - URL of the revision page
 */
async function getRevisionUrlForDate(pageName, language, date) {
  const response = await fetch(
    "https://" +
      language +
      MEDIAWIKI_API_GET_REVISION +
      "&titles=" +
      pageName.replace(/ /g, "_") +
      "&rvstart=" +
      date +
      "T23%3A59%3A59.999Z"
  )
  const data = await response.json()

  const revId = data.query.pages[0].revisions[0].revid
  return "https://" + language + MEDIAWIKI_INDEX_ENDPOINT + "&oldid=" + revId
}

/**
 * Format a date for display, according to the language of the browser.
 * @param {string} date - Date in the format "YYYY-MM-DD"
 * @returns {string} - Date in a long format (e.g. "November 6, 2001")
 */
function formatCreationDate(date) {
  const dateFormatOptions = { day: "numeric", month: "long", year: "numeric" }
  const dateObj = new Date(date)
  const browserLanguage = navigator.language

  return ENGLISH_LOCALE_CODES.includes(browserLanguage)
    ? dateObj.toLocaleDateString(browserLanguage, dateFormatOptions)
    : dateObj.toLocaleDateString("en-GB", dateFormatOptions)
}

// module.exports is used when running the tests with Node
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    isWikipediaPage,
    isSelectedDateValid,
    getPageLanguage,
    getTodayIsoDate,
    getWikipediaPageName,
    getCreationDate,
    getRevisionUrlForDate,
    formatCreationDate,
  }
}
