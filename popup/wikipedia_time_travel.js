/*
Popup for Wikipedia Time Travel.

The MediaWiki calls live in shared/mediawiki.js and the settings helpers in
shared/settings.js; the popup page loads both before this script.
*/

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
 * Display the article name and creation date on the popup
 * @param {string} pageName - Name of the Wikipedia page
 * @param {string} language - Language code of the Wikipedia page (e.g. "en", "es")
 */
async function displayWikipediaPageData(pageName, language) {
  try {
    var creationDate = await getCreationDate(pageName, language)
  } catch (error) {
    console.error("Error fetching data:", error)
    document.getElementById("error-message").style.display = "block"
    document.getElementById("loader").style.display = "none"
    document.body.classList.add("is-ready")
    return
  }

  //Update min and max date for the date picker
  document.getElementById("date-picker").min = creationDate
  document.getElementById("date-picker").max = getTodayIsoDate()

  // Display the article name, creation date and form
  document.getElementById("article-name").textContent = pageName
  document.getElementById("article-creation-date").textContent =
    "Page created on " + formatCreationDate(creationDate)
  document.getElementById("form-body").style.display = "block"
  document.getElementById("loader").style.display = "none"

  // Fades the content in once the skeleton is replaced by real data
  document.body.classList.add("is-ready")
}

/**
 * Redirect current tab to the Wikipedia page revision that was most recent in
 * at the end of the selected date.
 * @param {string} pageName - Name of the Wikipedia page
 * @param {string} language - Language code of the Wikipedia page (e.g. "en", "es")
 * @param {string} date - Date in the format "YYYY-MM-DD"
 */
async function openPageInSelectedDate(pageName, language, date) {
  try {
    const oldPageUrl = await getRevisionUrlForDate(pageName, language, date)
    chrome.tabs.update({ url: oldPageUrl })
  } catch (error) {
    console.error("Error fetching data:", error)
  }
}

/**
 * Show the current value of the in-page widget setting, and store any change.
 */
async function setUpSettings() {
  const checkbox = document.getElementById("in-page-widget-checkbox")

  const settings = await getSettings()
  checkbox.checked = settings[WTT_SETTING_IN_PAGE_WIDGET]

  checkbox.addEventListener("change", () => {
    setSetting(WTT_SETTING_IN_PAGE_WIDGET, checkbox.checked)
  })
}

/**
 * Main function - runs when the popup is opened
 */
document.addEventListener("DOMContentLoaded", async () => {
  const submitButton = document.getElementById("submit-button")
  const datePicker = document.getElementById("date-picker")

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

  setUpSettings()
})
