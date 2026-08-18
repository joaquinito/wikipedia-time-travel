/*
Ages shown on old revisions.

Templates like {{birth date and age}} do not store an age in the wikitext: the
age is computed by the parser when the page is rendered. Viewing an old
revision re-renders the old wikitext today, so every such age reads as the
age now rather than the age when that revision was current.

This script recomputes those ages against the revision's own timestamp.

It works from the age outwards: it finds the age text first, then looks up
through its ancestors for the hCard microformat date - the <span class="bday">
that the same templates emit - that the age was computed from. Doing it that
way round means the two only have to share some ancestor, rather than sit in
the exact arrangement one template happens to produce.

Loaded as a content script together with shared/mediawiki.js and
shared/settings.js.
*/

const WTT_ADJUSTED_AGE_CLASS = "wtt-adjusted-age"

/* Only complete dates can be turned into an exact age. {{birth year and age}}
emits just "1955", which would give a two year range rather than a number. */
const WTT_COMPLETE_DATE = /^\d{4}-\d{2}-\d{2}$/

/* Elements whose text is never article prose */
const WTT_SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"])

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
    pattern: /\(age([\s ]+)(\d+)\)/,
    rebuild: (match, years) => "(age" + match[1] + years + ")",
  },
  {
    // {{start date and age}} -> "; 49 years ago"
    pattern: /(\d+)([\s ]+)years?([\s ]+)ago/,
    rebuild: (match, years) =>
      years + match[2] + (years === 1 ? "year" : "years") + match[3] + "ago",
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
 * Find every piece of text on the page that looks like a computed age.
 * @param {HTMLElement} root - Element to search within
 * @returns {Array<object>} - One entry per age found
 */
function findAgesOnPage(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement
      if (!parent || WTT_SKIPPED_TAGS.has(parent.tagName)) {
        return NodeFilter.FILTER_REJECT
      }
      // Leave anything this script has already rewritten alone
      if (parent.closest("." + WTT_ADJUSTED_AGE_CLASS)) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const found = []
  while (walker.nextNode()) {
    const textNode = walker.currentNode
    for (const { pattern, rebuild } of WTT_AGE_PATTERNS) {
      const match = textNode.nodeValue.match(pattern)
      if (match) {
        found.push({ textNode, match, rebuild })
        break
      }
    }
  }

  return found
}

/**
 * Find the microformat date an age was computed from, by widening the search
 * out from the age until an ancestor holds one.
 * @param {Text} textNode - The text node holding the age
 * @returns {?HTMLElement} - The date element, or null if there is none nearby
 */
function findDateForAge(textNode) {
  let scope = textNode.parentElement

  while (scope && scope !== document.body) {
    const dates = scope.querySelectorAll(".bday, .dtstart")

    if (dates.length > 0) {
      /* An infobox can hold several dates, so use the last one that comes
      before the age in the document - the one the age was rendered next to. */
      let nearest = null
      for (const date of dates) {
        if (date.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING) {
          nearest = date
        }
      }
      /* The scope is returned as well, so that the check for a date of death
      below looks at exactly the region the date was found in. */
      return { dateElement: nearest || dates[0], scope: scope }
    }

    if (scope.id === "mw-content-text") {
      break
    }
    scope = scope.parentElement
  }

  return null
}

/**
 * Check whether an age sits alongside a date of death, in which case it is the
 * age the subject reached - computed from two dates that do not move, so it
 * must be left as it is.
 * @param {HTMLElement} scope - The region the age and its date were found in
 * @returns {boolean} - True if the age is an age at death
 */
function isAgeAtDeath(scope) {
  return scope.querySelector(".dday, .deathdate") !== null
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
 * Recompute every age on the page against the date of the revision shown.
 * @param {Date} revisionDate - The date the revision was current
 * @returns {object} - Counts of what was found and what was changed
 */
function adjustAgesToRevisionDate(revisionDate) {
  const root = document.getElementById("mw-content-text") || document.body
  const revisionDateLabel = formatCreationDate(revisionDate.toISOString().split("T")[0])

  const ages = findAgesOnPage(root)
  const report = { found: ages.length, changed: 0, withoutDate: 0, atDeath: 0, imprecise: 0 }

  for (const { textNode, match, rebuild } of ages) {
    const date = findDateForAge(textNode)
    if (!date) {
      report.withoutDate++
      continue
    }
    if (isAgeAtDeath(date.scope)) {
      report.atDeath++
      continue
    }

    const birthDate = date.dateElement.textContent.trim()
    if (!WTT_COMPLETE_DATE.test(birthDate)) {
      report.imprecise++
      continue
    }

    const years = ageInYearsAt(birthDate, revisionDate)
    if (years < 0) {
      continue
    }

    const replacement = rebuild(match, years)
    if (replacement !== match[0]) {
      markReplacement(textNode, match, replacement, revisionDateLabel)
      report.changed++
    }
  }

  return report
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
 * Say what happened, so that a page where nothing changed can be told apart
 * from a page the script never looked at.
 * @param {object} report - The counts returned by adjustAgesToRevisionDate
 * @param {string} revisionDateLabel - Human readable date of the revision
 */
function reportAgeAdjustment(report, revisionDateLabel) {
  if (report.changed > 0) {
    console.log(
      "Wikipedia Time Travel: adjusted " +
        report.changed +
        (report.changed === 1 ? " age" : " ages") +
        " to " +
        revisionDateLabel +
        "."
    )
    return
  }

  console.log(
    "Wikipedia Time Travel: no ages adjusted on this revision. " +
      JSON.stringify(report) +
      ". 'found' counts ages matched in the text; the rest were skipped for the reason named."
  )
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
    const label = formatCreationDate(revisionDate.toISOString().split("T")[0])
    reportAgeAdjustment(adjustAgesToRevisionDate(revisionDate), label)
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
