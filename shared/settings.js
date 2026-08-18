/*
Reading and writing the extension's settings.

Loaded as a plain script by both the popup page and the in-page widget, in the
same way as shared/mediawiki.js.
*/

const WTT_SETTING_IN_PAGE_WIDGET = "showInPageWidget"

/* Defaults are passed to chrome.storage.sync.get(), so a setting that has
never been written still comes back with a usable value. */
const WTT_SETTINGS_DEFAULTS = {
  [WTT_SETTING_IN_PAGE_WIDGET]: true,
}

/**
 * Read every setting, falling back to the defaults above.
 * @returns {Promise<object>} - The stored settings
 */
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(WTT_SETTINGS_DEFAULTS, (settings) => resolve(settings))
  })
}

/**
 * Store a single setting.
 * @param {string} key - Setting name
 * @param {*} value - Value to store
 * @returns {Promise<void>}
 */
function setSetting(key, value) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [key]: value }, () => resolve())
  })
}

/**
 * Call back whenever a setting is changed, from anywhere in the extension.
 * @param {function(string, *): void} callback - Receives the key and its new value
 */
function onSettingChanged(callback) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return
    }
    for (const [key, change] of Object.entries(changes)) {
      callback(key, change.newValue)
    }
  })
}

// module.exports is used when running the tests with Node
if (typeof module !== "undefined" && module.exports) {
  module.exports = { WTT_SETTING_IN_PAGE_WIDGET, WTT_SETTINGS_DEFAULTS }
}
