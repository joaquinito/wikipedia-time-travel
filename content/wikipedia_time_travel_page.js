/*
In-page Time Travel widget.

Adds a "Time travel" button to the top of a Wikipedia article, immediately to
the left of the language selector, so the extension can be used without opening
the toolbar popup. The button opens a small panel with the same date picker as
the popup.

Loaded as a content script together with shared/mediawiki.js and
shared/settings.js, which provide the helpers used below.
*/

const WTT_WIDGET_ID = "wtt-widget"
const WTT_ANCHOR_TIMEOUT_MS = 10000

/* Article data, fetched lazily the first time the panel is opened */
const wttState = {
  pageName: null,
  language: null,
  creationDate: null,
  loaded: false,
  loading: false,
}

/**
 * Build the widget's DOM. The markup is static; every value that comes from the
 * article is written with textContent further down.
 * @returns {HTMLElement} - The widget's root element
 */
function createWidget() {
  const widget = document.createElement("div")
  widget.className = "wtt-widget"
  widget.id = WTT_WIDGET_ID
  widget.innerHTML = `
    <button type="button" class="wtt-widget__button" aria-expanded="false" aria-haspopup="dialog">
      <svg class="wtt-widget__button-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"
           fill="none" stroke="currentColor" stroke-width="1.6"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 3.5 A6.5 6.5 0 1 1 3.5 10"/>
        <polygon points="7,3.5 10.4,1.2 10.4,5.8" fill="currentColor" stroke="none"/>
        <path d="M10 6.9 V10.2 H12.9"/>
      </svg>
      <span class="wtt-widget__button-text">Time travel</span>
    </button>

    <div class="wtt-widget__panel" role="dialog" aria-label="Wikipedia Time Travel" hidden>
      <p class="wtt-widget__status">Loading this page's history…</p>
      <div class="wtt-widget__form" hidden>
        <p class="wtt-widget__meta"></p>
        <label class="wtt-widget__label"></label>
        <input class="wtt-widget__date" type="date">
        <button type="button" class="wtt-widget__submit" disabled>
          <span>Go</span>
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 10h11M10.5 5.5 15 10l-4.5 4.5"/>
          </svg>
        </button>
      </div>
    </div>
  `

  /* The label and its input are tied together with a generated id so the label
  keeps working next to Wikipedia's own markup. */
  const dateInput = widget.querySelector(".wtt-widget__date")
  const dateLabel = widget.querySelector(".wtt-widget__label")
  dateInput.id = "wtt-widget-date-picker"
  dateLabel.htmlFor = dateInput.id
  dateLabel.textContent = "Open this page on"

  return widget
}

/**
 * Find where the widget should be inserted, preferring the language selector in
 * the page titlebar of the Vector 2022 skin.
 * @returns {?{parent: HTMLElement, before: ?Node}} - Insertion point, or null
 */
function findWidgetAnchor() {
  // Vector 2022: immediately to the left of the language selector
  const languageButton = document.getElementById("p-lang-btn")
  if (languageButton && languageButton.parentElement) {
    return { parent: languageButton.parentElement, before: languageButton }
  }

  /* Vector 2022 without a language selector, which is the case on pages that
  have no translations and on some old revisions */
  const titlebar = document.querySelector(".vector-page-titlebar")
  if (titlebar) {
    return { parent: titlebar, before: null }
  }

  // Other skins: right after the article title
  const heading = document.getElementById("firstHeading")
  if (heading && heading.parentElement) {
    return { parent: heading.parentElement, before: heading.nextSibling }
  }

  return null
}

/**
 * Fetch the article's name and creation date, then fill in the panel.
 */
async function loadArticleData(widget) {
  if (wttState.loaded || wttState.loading) {
    return
  }
  wttState.loading = true

  const status = widget.querySelector(".wtt-widget__status")
  const form = widget.querySelector(".wtt-widget__form")

  try {
    wttState.language = getPageLanguage(window.location.href)
    wttState.pageName = await getWikipediaPageName(window.location.href)
    wttState.creationDate = await getCreationDate(wttState.pageName, wttState.language)

    const datePicker = widget.querySelector(".wtt-widget__date")
    datePicker.min = wttState.creationDate
    datePicker.max = getTodayIsoDate()

    widget.querySelector(".wtt-widget__meta").textContent =
      "Page created on " + formatCreationDate(wttState.creationDate)

    status.hidden = true
    form.hidden = false
    wttState.loaded = true
  } catch (error) {
    console.error("Wikipedia Time Travel: could not load the page history.", error)
    status.textContent = "Could not load this page's history."
    status.classList.add("wtt-widget__status--error")
  } finally {
    wttState.loading = false
  }
}

/**
 * Open or close the panel.
 */
function setPanelOpen(widget, open) {
  const button = widget.querySelector(".wtt-widget__button")
  const panel = widget.querySelector(".wtt-widget__panel")

  panel.hidden = !open
  button.setAttribute("aria-expanded", String(open))

  if (open) {
    loadArticleData(widget)
  }
}

/**
 * Wire up the widget's interactions.
 */
function attachWidgetListeners(widget) {
  const button = widget.querySelector(".wtt-widget__button")
  const panel = widget.querySelector(".wtt-widget__panel")
  const datePicker = widget.querySelector(".wtt-widget__date")
  const submitButton = widget.querySelector(".wtt-widget__submit")

  button.addEventListener("click", () => setPanelOpen(widget, panel.hidden))

  // The submit button stays disabled until a date within the article's life is picked
  datePicker.addEventListener("input", () => {
    submitButton.disabled = !(datePicker.value && isSelectedDateValid(datePicker))
  })

  datePicker.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !submitButton.disabled) {
      submitButton.click()
    }
  })

  submitButton.addEventListener("click", async () => {
    submitButton.disabled = true
    try {
      window.location.href = await getRevisionUrlForDate(
        wttState.pageName,
        wttState.language,
        datePicker.value
      )
    } catch (error) {
      console.error("Wikipedia Time Travel: could not open the revision.", error)
      submitButton.disabled = false
    }
  })

  // Close on Escape, or on a click anywhere outside the widget
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      setPanelOpen(widget, false)
      button.focus()
    }
  })

  document.addEventListener("click", (event) => {
    if (!panel.hidden && !widget.contains(event.target)) {
      setPanelOpen(widget, false)
    }
  })
}

/**
 * Insert the widget into the page, if it is not there already.
 */
function mountWidget() {
  if (document.getElementById(WTT_WIDGET_ID)) {
    return
  }

  const anchor = findWidgetAnchor()
  if (!anchor) {
    return
  }

  const widget = createWidget()
  anchor.parent.insertBefore(widget, anchor.before)
  attachWidgetListeners(widget)
}

/**
 * Remove the widget from the page.
 */
function unmountWidget() {
  const widget = document.getElementById(WTT_WIDGET_ID)
  if (widget) {
    widget.remove()
  }
}

/**
 * Mount the widget, waiting for the titlebar if the skin renders it late.
 */
function mountWidgetWhenAnchorExists() {
  mountWidget()
  if (document.getElementById(WTT_WIDGET_ID)) {
    return
  }

  const observer = new MutationObserver(() => {
    mountWidget()
    if (document.getElementById(WTT_WIDGET_ID)) {
      observer.disconnect()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  setTimeout(() => {
    observer.disconnect()
    if (!document.getElementById(WTT_WIDGET_ID)) {
      console.warn(
        "Wikipedia Time Travel: could not find the page titlebar, so the in-page " +
          "widget was not added. This skin may not be supported yet."
      )
    }
  }, WTT_ANCHOR_TIMEOUT_MS)
}

/**
 * Entry point - runs when the content script is injected
 */
;(async () => {
  /* Lets the popup know this tab already has the widget, so that switching the
  setting on does not inject a second copy of these scripts. */
  window.wttInPageWidgetLoaded = true

  if (!isWikipediaPage(window.location.href)) {
    return
  }

  const settings = await getSettings()
  if (settings[WTT_SETTING_IN_PAGE_WIDGET]) {
    mountWidgetWhenAnchorExists()
  }

  // Adding or removing the widget takes effect without reloading the page
  onSettingChanged((key, newValue) => {
    if (key !== WTT_SETTING_IN_PAGE_WIDGET) {
      return
    }
    if (newValue) {
      mountWidgetWhenAnchorExists()
    } else {
      unmountWidget()
    }
  })
})()
