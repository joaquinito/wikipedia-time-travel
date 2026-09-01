const DATE_FORMAT_OPTIONS = { day: "numeric", month: "long", year: "numeric" }
const ENGLISH_LOCALE_CODES = ["en", "en-AU", "en-BZ", "en-CA", "en-GB", "en-HK", "en-IN",
                               "en-IE", "en-MY", "en-NZ", "en-SG",  "en-UK", "en-US", "en-ZA"]

// Date of the revision currently displayed by the popup, so quick jumps can be made
// relative to it instead of always relative to today
let currentlyShownDate = null

// Id of the tab this popup is acting on, so a jump can wait for that specific
// tab's navigation to finish loading before clearing its own status message
let currentTabId = null

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

const API_ATTEMPT_TIMEOUT_MS = 15000 // abort a stalled request after this long
const API_RETRIES = 3 // extra attempts after the first

/**
 * Fetch a URL and parse its JSON body, retrying with backoff on a network error,
 * a non-OK response, or a stalled request (each attempt capped by an AbortController).
 * @param {string} url - URL to fetch
 * @param {object} [options] - fetch() options
 * @param {number} [retries] - How many extra attempts to make after the first
 * @returns {Promise<object>} - Parsed JSON body
 */
async function fetchJsonWithRetry(url, options = {}, retries = API_RETRIES) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), API_ATTEMPT_TIMEOUT_MS)
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      if (!response.ok) {
        throw new Error("MediaWiki API responded with HTTP " + response.status)
      }
      return await response.json()
    } catch (error) {
      lastError = error
    } finally {
      clearTimeout(timeoutId)
    }
  }
  throw lastError
}


/**
 * Get the currently active tab
 * @returns {Promise<object>} - The active tab
 */
function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0])
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
 * Check if the selected date is valid (in "YYYY-MM-DD" format, and between the
 * creation date and today). The canonical #date-picker value is only ever set by our
 * own code (from the day/month/year spinner, or from a remembered date recalled from
 * storage), but that stored value isn't guaranteed to still be well-formed, so this
 * guards against a malformed value rather than assuming one.
 * @param {object} datePicker - HTML input holding the canonical "YYYY-MM-DD" value
 * @returns {bool} - True if the selected date is valid, false otherwise
 */
function isSelectedDateValid(datePicker) {
  if (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(datePicker.value)) return false

  const today = new Date().toISOString().split("T")[0]
  const selectedDate = new Date(datePicker.value).toISOString().split("T")[0]
  const creationDate = new Date(datePicker.min).toISOString().split("T")[0]

  return selectedDate >= creationDate && selectedDate <= today ? true : false
}

const AMERICAN_DATE_LOCALE = "en-US"

/**
 * Determine the order the day/month/year spinner segments should appear in, following
 * the browser's locale. American English is the one common locale that puts the month
 * before the day (mm/dd/yyyy); every other locale here uses dd/mm/yyyy.
 * @param {string} locale - e.g. navigator.language
 * @returns {string[]} - ["month", "day", "year"] or ["day", "month", "year"]
 */
function getDateSegmentOrder(locale) {
  return locale === AMERICAN_DATE_LOCALE
    ? ["month", "day", "year"]
    : ["day", "month", "year"]
}

/**
 * Number of days in a given month
 * @param {number} year
 * @param {number} month - 1-indexed (1 = January)
 * @returns {number}
 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

/**
 * Parse a "YYYY-MM-DD" string into its numeric parts
 * @param {string} dateString - Date in the format "YYYY-MM-DD"
 * @returns {{year: number, month: number, day: number}|null} - null if not well-formed
 */
function parseDateParts(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || "")
  if (!match) return null
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: parseInt(match[3], 10),
  }
}

/**
 * Format numeric date parts back into a "YYYY-MM-DD" string
 * @param {{year: number, month: number, day: number}} parts
 * @returns {string} - Date in the format "YYYY-MM-DD"
 */
function formatDateParts(parts) {
  const pad = (n) => String(n).padStart(2, "0")
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
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
      const data = await fetchJsonWithRetry(
        "https://" +
          getPageLanguage(url) +
          MEDIAWIKI_API_QUERY +
          "&revids=" +
          queryParams.get("oldid"),
        { headers: API_REQUEST_HEADERS }
      )
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
  const data = await fetchJsonWithRetry(
    "https://" +
      language +
      MEDIAWIKI_API_GET_FIRST_REVISION +
      "&titles=" +
      pageName.replace(/ /g, "_"),
    { headers: API_REQUEST_HEADERS }
  )

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
 * Show the "Showing page on <date>" notice below the creation date,
 * unless that date is today, in which case this is simply the current version of the page.
 * @param {string} date - Date in the format "YYYY-MM-DD"
 */
function displayFetchedDateNotice(date) {
  currentlyShownDate = date

  const today = new Date().toISOString().split("T")[0]
  if (date === today) return

  document.getElementById("viewing-date-notice").textContent =
    "Showing page on " + formatDateForDisplay(date)
  document.getElementById("viewing-date-notice").style.display = "block"
}

/**
 * Hide the "Showing page on <date>" notice, e.g. while a new jump
 * is in flight and its own status message is showing instead.
 */
function hideFetchedDateNotice() {
  document.getElementById("viewing-date-notice").style.display = "none"
}

/**
 * Show or hide the status line displayed while a revision jump is in flight.
 * The Wikipedia navigation this precedes can itself take several seconds on
 * uncached old revisions, so this is purely to reassure the user the click
 * registered rather than to reflect our own (fast) API calls.
 * Mutually exclusive with the "Showing page on" notice: only one
 * of the two is ever visible at a time.
 * @param {string|null} message - Text to show, or null to hide the status line
 * @param {boolean} [isError] - Whether to style the message as an error
 */
function setJumpStatus(message, isError = false) {
  const status = document.getElementById("jump-status")
  status.textContent = message || ""
  status.hidden = !message
  status.classList.toggle("is-error", isError)
}

/**
 * Navigate a tab to a URL, resolving only once that tab has actually finished
 * loading it. chrome.tabs.update()'s own callback fires as soon as the
 * navigation is *requested*, not once the new page has rendered — and
 * MediaWiki's old-revision renders can take several seconds on a cache miss,
 * so callers that show a "loading" status need this to know when to clear it.
 * @param {number|null} tabId - Id of the tab to navigate, or null if there is no real tab (e.g. tests)
 * @param {string} url - URL to navigate the tab to
 * @returns {Promise<void>}
 */
function navigateTabAndWaitForLoad(tabId, url) {
  return new Promise((resolve) => {
    if (!tabId) {
      chrome.tabs.update({ url })
      resolve()
      return
    }

    function onTabUpdated(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(onTabUpdated)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(onTabUpdated)
    chrome.tabs.update(tabId, { url })
  })
}

/**
 * Redirect current tab to the Wikipedia page revision that was most recent in
 * at the end of the selected date.
 *
 * Note: the navigation this triggers can take several seconds on its own, before
 * this function even returns. Old revisions aren't cached by Wikipedia the way
 * current pages are, so the first time anyone re-visits one, MediaWiki has to
 * fully re-parse it (templates, infoboxes, etc.) rather than serving it from
 * cache. There's nothing to optimize on our end here — it's Wikipedia's server,
 * not this fetch, and it gets fast again once that revision is cached.
 * @param {string} pageName - Name of the Wikipedia page
 * * @param {string} language - Language code of the Wikipedia page (e.g. "en", "es")
 * @param {string} date - Date in the format "YYYY-MM-DD"
 */
async function openPageInSelectedDate(pageName, language, date) {
  const data = await fetchJsonWithRetry(
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

  // Parse JSON response and extract the revid
  const revId = data.query.pages[0].revisions[0].revid
  // Remember the requested date, so a later visit to this revision can show it again
  rememberFetchedDate(revId, date)
  // Open corresponding revision page in current tab, and wait for it to actually finish loading
  const oldPageUrl = "https://" + language + MEDIAWIKI_INDEX_ENDPOINT + "&oldid=" + revId
  await navigateTabAndWaitForLoad(currentTabId, oldPageUrl)
  // Only now update the popup's own notice, so it never overlaps with the loading status
  displayFetchedDateNotice(date)
}

/**
 * Handle a click on either "Go" button: show the loading status, disable the
 * button that triggered it until the navigation actually finishes, and fall
 * back to an inline error message if the jump fails.
 * @param {HTMLButtonElement} button - The button that triggered this jump
 * @param {string} pageName - Name of the Wikipedia page
 * @param {string} language - Language code of the Wikipedia page (e.g. "en", "es")
 * @param {string} date - Date in the format "YYYY-MM-DD"
 */
async function jumpToDate(button, pageName, language, date) {
  button.disabled = true
  hideFetchedDateNotice()
  setJumpStatus("Loading previous version of the page...")
  try {
    await openPageInSelectedDate(pageName, language, date)
    setJumpStatus(null)
  } catch (error) {
    console.error("Error jumping to revision:", error)
    setJumpStatus("⚠️ Could not load that revision. Please try again.", true)
  } finally {
    button.disabled = false
  }
}

/**
 * Wire up a number input's custom up/down spinner buttons (see the .spinner-wrap markup
 * around it) to call the input's own stepUp()/stepDown(), so they respect its min/max/step
 * the same way its native arrows or the keyboard's up/down arrow keys would.
 * @param {HTMLElement} wrap - The .spinner-wrap element containing the input and its buttons
 */
function attachSpinnerButtons(wrap) {
  const input = wrap.querySelector("input[type=number]")

  ;[
    [wrap.querySelector(".spinner-btn-up"), () => input.stepUp()],
    [wrap.querySelector(".spinner-btn-down"), () => input.stepDown()],
  ].forEach(([button, adjust]) => {
    // Prevent the button from stealing focus from the input on click, which would
    // otherwise interrupt whatever the user was doing with it (e.g. mid-typing)
    button.addEventListener("mousedown", (event) => event.preventDefault())
    button.addEventListener("click", () => {
      adjust()
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  })
}

/**
 * Wire up the exact-date spinner: order its day/month/year number inputs to match the
 * browser's locale (see getDateSegmentOrder()), keep them in sync with the canonical
 * (hidden) #date-picker input, and let each one be changed either by its custom up/down
 * buttons (styled like the quick-jump amount field), the keyboard's up/down arrow keys,
 * or by typing a value directly into it.
 * @param {HTMLInputElement} datePicker - The canonical #date-picker input
 * @param {string} locale - e.g. navigator.language
 * @returns {function} - Re-renders the segments from datePicker.value; call after changing
 *   that value programmatically elsewhere (e.g. pre-filling a remembered date)
 */
function setUpDateSpinner(datePicker, locale) {
  const spinner = document.getElementById("date-picker-spinner")

  const segmentInputs = {
    day: document.getElementById("date-segment-day"),
    month: document.getElementById("date-segment-month"),
    year: document.getElementById("date-segment-year"),
  }

  // The .spinner-wrap around each input also holds its up/down buttons, so reordering
  // must move that whole wrapper rather than just the bare input
  const segmentWraps = {
    day: document.querySelector('.spinner-wrap[data-unit="day"]'),
    month: document.querySelector('.spinner-wrap[data-unit="month"]'),
    year: document.querySelector('.spinner-wrap[data-unit="year"]'),
  }

  // Reorder the segments (and the "/" separators between them) to match the locale
  const order = getDateSegmentOrder(locale)
  order.forEach((unit, index) => {
    spinner.appendChild(segmentWraps[unit])
    if (index < order.length - 1) {
      const separator = document.createElement("span")
      separator.className = "date-segment-separator"
      separator.textContent = "/"
      spinner.appendChild(separator)
    }
  })

  function currentParts() {
    return (
      parseDateParts(datePicker.value) ||
      parseDateParts(new Date().toISOString().split("T")[0])
    )
  }

  function render(parts) {
    segmentInputs.day.value = parts.day
    segmentInputs.month.value = parts.month
    segmentInputs.year.value = parts.year
    // The day's own max follows the selected month/year, so e.g. spinning the month
    // from March to April clamps a day of 31 down to that month's last day
    segmentInputs.day.max = daysInMonth(parts.year, parts.month)
  }

  function commit(parts) {
    const clampedParts = { ...parts, day: Math.min(parts.day, daysInMonth(parts.year, parts.month)) }
    render(clampedParts)
    datePicker.value = formatDateParts(clampedParts)
    datePicker.dispatchEvent(new Event("input", { bubbles: true }))
  }

  function sync() {
    render(currentParts())
  }

  Object.entries(segmentInputs).forEach(([unit, input]) => {
    // Number inputs don't support the text-selection APIs (select() throws for them), so
    // there is no built-in way to highlight the pre-filled value for overwriting. Instead,
    // mark the segment as "just focused" and only clear it lazily, right when the first
    // digit is about to be typed — clearing on focus itself would also wipe the value
    // right before an up/down arrow keypress, which should adjust it, not reset it.
    input.addEventListener("focus", () => {
      input.dataset.freshFocus = "true"
    })

    input.addEventListener("keydown", (event) => {
      if (input.dataset.freshFocus !== "true") return
      delete input.dataset.freshFocus
      if (!/^[0-9]$/.test(event.key)) return
      event.preventDefault()
      input.value = event.key
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    input.addEventListener("input", () => {
      if (input.value === "") return
      commit({ ...currentParts(), [unit]: parseInt(input.value, 10) })
    })

    input.addEventListener("blur", sync)
  })

  // Start on today's date, or whatever datePicker.value is already pre-filled with
  commit(currentParts())

  return sync
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

  document.querySelectorAll(".spinner-wrap").forEach(attachSpinnerButtons)

  // The exact date is picked via a segmented day/month/year spinner rather than a native
  // date input, so its look (and its up/down arrows, doubling as a mouse-only way to pick
  // a date) is the same in every browser, instead of depending on the OS/browser's own
  // date picker UI (Firefox's, in particular, can't even open its calendar popup here —
  // a long-standing, unfixed upstream platform bug: the picker is itself an OS-level
  // panel, and panels can't reliably spawn other panels from inside another panel).
  const syncDateSpinner = setUpDateSpinner(datePicker, navigator.language)

  // Submit button is disabled by default
  submitButton.disabled = true

  // If end-to-end tests are running, use the test URL provided in the query string
  const URL_PARAMS = new URLSearchParams(window.location.search)
  const testParam = URL_PARAMS.get("testUrl")

  // Get the current tab (or use the test URL if provided, in which case there is no real tab)
  const currentTab = testParam === null ? await getCurrentTab() : null
  currentTabId = currentTab ? currentTab.id : null
  const currentUrl = currentTab ? currentTab.url : testParam

  var wikipediaPageName = ""
  var wikipediaPageLanguage = ""

  // Check if the current page is a Wikipedia page, display page data and form if so
  if (isWikipediaPage(currentUrl)) {
    console.log("Current tab is a Wikipedia page.")
    document.getElementById("placeholder-message").style.display = "none"
    wikipediaPageName = await getWikipediaPageName(currentUrl)
    wikipediaPageLanguage = getPageLanguage(currentUrl)
    displayWikipediaPageData(wikipediaPageName, wikipediaPageLanguage)

    // If this revision was reached through this extension before, display the requested date 
    // and pre-fill the date picker with it
    const revId = getRevisionIdFromUrl(currentUrl)
    if (revId) {
      const rememberedDate = await recallFetchedDate(revId)
      if (rememberedDate) {
        displayFetchedDateNotice(rememberedDate)
        datePicker.value = rememberedDate
        syncDateSpinner()
      }
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
    await jumpToDate(submitButton, wikipediaPageName, wikipediaPageLanguage, inputDate)
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
    await jumpToDate(relativeGoButton, wikipediaPageName, wikipediaPageLanguage, targetDate)
  })
})

// module.exports is used when running the tests with Node
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    isWikipediaPage,
    isSelectedDateValid,
    getDateSegmentOrder,
    daysInMonth,
    parseDateParts,
    formatDateParts,
    getPageLanguage,
    getWikipediaPageName,
    getCreationDate,
    getRelativeDateString,
    getRevisionIdFromUrl,
    formatDateForDisplay,
    setJumpStatus,
  }
}
