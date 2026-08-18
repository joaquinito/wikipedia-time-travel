/*
Ages shown on old revisions.

Templates like {{birth date and age}} do not store an age in the wikitext: the
age is computed by the parser when the page is rendered. Viewing an old
revision re-renders the old wikitext today, so every such age reads as the
age now rather than the age when that revision was current.

This script recomputes those ages against the revision's own timestamp. It
only touches ages that are anchored to an hCard microformat date - the
<span class="bday"> that the same templates emit - so it never has to guess at
what a bare number in an article means. Each change is wrapped in a marker
span, so a reader can see that the extension, and not the article, wrote it.

Loaded as a content script together with shared/mediawiki.js and
shared/settings.js.
*/

const WTT_ADJUSTED_AGE_CLASS = "wtt-adjusted-age"

/* How far up from the microformat date to look for the text holding the age.
The templates put both inside the same infobox cell or list item. */
const WTT_AGE_REGION_MAX_DEPTH = 4

/* Only complete dates can be turned into an exact age. {{birth year and age}}
emits just "1955", which would give a two year range rather than a number. */
const WTT_COMPLETE_DATE = /^\d{4}-\d{2}-\d{2}$/

/*
The two shapes an age takes next to a microformat date on the English
Wikipedia. Both keep the original spacing, which is usually a non-breaking
space. Note that "(aged 42)", the age at death produced by
{{death date and age}}, deliberately does not match: it is computed from two
fixed dates and so does not drift.
*/
const WTT_AGE_PATTERNS = [
  {
    // {{birth date and age}} -> "(age 70)"
    pattern: /\(age([\s ]+)(\d+)\)/,
    rebuild: (match, years) => "(age" + match[1] + years + ")",
  },
  {
    // {{start date and age}} -> "; 49 years ago"
    pattern: /(\d+)([\s ]+)(years?)([\s ]+)ago/,
    rebuild: (match, years) =>
      years + match[2] + (years === 1 ? "year" : "years") + match[4] + "ago",
  },
]

/**
 * Get the revision id an old revision URL points at.
 * @param {string} url - URL of the page
 * @returns {?string} - The "oldid" parameter, or null on a current page
 */
function getRevisionIdFromUrl(url) {
  return new URLSearchParams(new URL(url).search).get("oldid")
}

/**
 * Find the element that holds both a microformat date and the age next to it.
 * @param {HTMLElement} dateElement - The <span class="bday"> element
 * @returns {?HTMLElement} - The closest ancestor whose text contains an age
 */
function findAgeRegion(dateElement) {
  let candidate = dateElement.parentElement

  for (let depth = 0; candidate && depth < WTT_AGE_REGION_MAX_DEPTH; depth++) {
    if (WTT_AGE_PATTERNS.some(({ pattern }) => pattern.test(candidate.textContent))) {
      return candidate
    }
    candidate = candidate.parentElement
  }

  return null
}

/**
 * Replace part of a text node with a marker span carrying the new text.
 * @param {Text} textNode - The text node to edit
 * @param {object} match - The result of matching one of the age patterns
 * @param {string} replacement - The text to show instead
 * @param {string} revisionDateLabel - Human readable date, shown in the tooltip
 */
function markReplacement(textNode, match, replacement, revisionDateLabel) {
  const rest = textNode.splitText(match.index)
  rest.nodeValue = rest.nodeValue.slice(match[0].length)

  const marker = document.createElement("span")
  marker.className = WTT_ADJUSTED_AGE_CLASS
  marker.textContent = replacement
  marker.dataset.wttOriginal = match[0]
  marker.title =
    "Wikipedia Time Travel: as of " + revisionDateLabel + ". The article says " + match[0] + "."

  rest.parentNode.insertBefore(marker, rest)
}

/**
 * Rewrite every age inside one region, against the given date.
 * @param {HTMLElement} region - Element holding the age text
 * @param {string} birthDate - Date of birth in the format "YYYY-MM-DD"
 * @param {Date} revisionDate - The date the revision was current
 * @param {string} revisionDateLabel - Human readable date, shown in the tooltip
 * @returns {number} - How many ages were changed
 */
function rewriteAgesIn(region, birthDate, revisionDate, revisionDateLabel) {
  const years = ageInYearsAt(birthDate, revisionDate)
  if (years < 0) {
    return 0
  }

  /* The text nodes are collected before anything is edited, because splitting
  a text node while walking would have the walker visit the new halves. */
  const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT)
  const textNodes = []
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode)
  }

  let changed = 0
  for (const textNode of textNodes) {
    if (textNode.parentElement && textNode.parentElement.closest("." + WTT_ADJUSTED_AGE_CLASS)) {
      continue
    }
    for (const { pattern, rebuild } of WTT_AGE_PATTERNS) {
      const match = textNode.nodeValue.match(pattern)
      if (!match) {
        continue
      }
      const replacement = rebuild(match, years)
      if (replacement !== match[0]) {
        markReplacement(textNode, match, replacement, revisionDateLabel)
        changed++
      }
      break
    }
  }

  return changed
}

/**
 * Recompute every age on the page against the date of the revision shown.
 * @param {Date} revisionDate - The date the revision was current
 * @returns {number} - How many ages were changed
 */
function adjustAgesToRevisionDate(revisionDate) {
  const revisionDateLabel = formatCreationDate(revisionDate.toISOString().split("T")[0])
  let changed = 0

  for (const dateElement of document.querySelectorAll(".bday")) {
    const birthDate = dateElement.textContent.trim()
    if (!WTT_COMPLETE_DATE.test(birthDate)) {
      continue
    }

    const region = findAgeRegion(dateElement)
    if (!region) {
      continue
    }

    /* An age next to a date of death is the age the person reached, computed
    from two dates that do not move, so it must be left alone. */
    if (region.querySelector(".dday, .deathdate")) {
      continue
    }

    changed += rewriteAgesIn(region, birthDate, revisionDate, revisionDateLabel)
  }

  return changed
}

/**
 * Put every age back the way the article rendered it.
 */
function restoreOriginalAges() {
  for (const marker of document.querySelectorAll("." + WTT_ADJUSTED_AGE_CLASS)) {
    marker.replaceWith(document.createTextNode(marker.dataset.wttOriginal))
  }
}

/**
 * Entry point - runs when the content script is injected
 */
;(async () => {
  const revisionId = getRevisionIdFromUrl(window.location.href)

  // Ages only go stale on an old revision; a current page renders them correctly
  if (!revisionId) {
    return
  }

  let revisionDate = null

  async function applyIfEnabled() {
    const settings = await getSettings()
    if (!settings[WTT_SETTING_ADJUST_AGES]) {
      return
    }
    if (!revisionDate) {
      const timestamp = await getRevisionTimestamp(
        revisionId,
        getPageLanguage(window.location.href)
      )
      revisionDate = new Date(timestamp)
    }
    adjustAgesToRevisionDate(revisionDate)
  }

  try {
    await applyIfEnabled()
  } catch (error) {
    console.error("Wikipedia Time Travel: could not adjust the ages on this revision.", error)
  }

  // Switching the setting takes effect without reloading the revision
  onSettingChanged(async (key, newValue) => {
    if (key !== WTT_SETTING_ADJUST_AGES) {
      return
    }
    if (newValue) {
      await applyIfEnabled()
    } else {
      restoreOriginalAges()
    }
  })
})()
