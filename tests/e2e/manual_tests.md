
## Manual end-to-end tests for Wikipedia Time Travel

Unfortunately, support for programmaticaly testing extension popups is still very limited. Therefore, we have to rely on manual testing for several scenarios.

### Test 1: Open the popup

1. On Chrome, click on the Wikipedia Time Travel icon in the Extensions area.
  
    **Expected**: The popup opens.

### Test 2: Open the popup in a Wikipedia page and see the loading animation

1. Open the page for Earth on Wikipedia: https://en.wikipedia.org/wiki/Earth.
2. Open the Wikipedia Time Travel popup.
  
    **Expected**: The popup shows for a brief moment the loading skeleton (three shimmering
    placeholder blocks). The popup does not change height when the article data replaces it.

### Test 3: Select a date by using the date picker

1. Open the page for Earth on Wikipedia: https://en.wikipedia.org/wiki/Earth.
2. Open the Wikipedia Time Travel popup.
3. Click on the calendar icon of date input field.
4. Select a date from the calendar.
   
    **Expected**: The date input field is updated with the selected date and the "Go" button is enabled.

### Test 4: Select a date by typing the date

1. Open the page for Earth on Wikipedia: https://en.wikipedia.org/wiki/Earth.
2. Open the Wikipedia Time Travel popup.
3. Click on the date input field and type a date between the creation date and the current date.
   
    **Expected**: The "Go" button is enabled.

### Test 5: Get the version of the Wikipedia page for Earth on 7 April 2014

1. Open the page for Earth on Wikipedia: https://en.wikipedia.org/wiki/Earth.
2. Open the Wikipedia Time Travel popup.
2. Select the date 7 April 2014.
3. Click on the "Go" button.
   
    **Expected**: The Wikipedia page for Earth with ID 602452976 is displayed.

### Test 6: The popup follows the browser colour scheme

1. Set the operating system (or Chrome, in `chrome://settings/appearance`) to dark mode.
2. Open the page for Earth on Wikipedia: https://en.wikipedia.org/wiki/Earth.
3. Open the Wikipedia Time Travel popup.

    **Expected**: The popup uses a dark background with light text, matching Wikipedia's own
    dark mode. The date picker's calendar overlay is also dark.

4. Switch back to light mode and reopen the popup.

    **Expected**: The popup uses a white background with dark text.

### Test 7: The empty state is shown outside Wikipedia

1. Open any page that is not on `wikipedia.org`.
2. Open the Wikipedia Time Travel popup.

    **Expected**: The popup shows only the header and a bordered panel with a globe icon and the
    message "Open a Wikipedia page to use this extension." No article name, date or `Go` button
    is shown.

### Test 8: The in-page widget appears next to the language selector

1. Open the page for Earth on Wikipedia: https://en.wikipedia.org/wiki/Earth.

    **Expected**: A `Time travel` button is shown at the top of the page, immediately to the left
    of the language selector ("N languages"), styled like the rest of the page titlebar.

2. Click on the `Time travel` button.

    **Expected**: A panel opens below the button, showing "Page created on 6 November 2001"
    (or the same date in the browser's format), a date input and a disabled `Go` button.

3. Select the date 7 April 2014 and click `Go`.

    **Expected**: The Wikipedia page for Earth with ID 602452976 is displayed.

### Test 9: The in-page panel closes the way a menu should

1. Open the page for Earth on Wikipedia and click the `Time travel` button.
2. Press `Escape`.

    **Expected**: The panel closes and focus returns to the `Time travel` button.

3. Open the panel again and click anywhere else on the article.

    **Expected**: The panel closes.

### Test 10: The in-page widget can be turned off

1. Open the page for Earth on Wikipedia, leaving the tab open.
2. Open the Wikipedia Time Travel popup and untick `Show on Wikipedia pages`.

    **Expected**: The `Time travel` button disappears from the article without reloading it.

3. Reload the page.

    **Expected**: The `Time travel` button is still absent.

4. Tick `Show on Wikipedia pages` again.

    **Expected**: The `Time travel` button comes back, again without a reload.

### Test 11: The in-page widget follows Wikipedia's appearance setting

1. Open the page for Earth on Wikipedia.
2. In the `Appearance` menu of the sidebar, switch the colour to `Dark`.

    **Expected**: The `Time travel` button and its panel use Wikipedia's dark colours, including
    the date input's calendar control.

3. Switch back to `Light`, then to `Automatic`.

    **Expected**: The widget follows in each case.

### Test 12: The in-page widget works on an old revision

1. Open an old revision directly, e.g.
   https://en.wikipedia.org/w/index.php?&oldid=602452976.

    **Expected**: The `Time travel` button is present and, once opened, shows the creation date of
    the Earth article. Picking another date opens the revision for that date.

### Test 13: Turning the widget on reaches tabs that were already open

1. Open the page for Earth on Wikipedia with `Show on Wikipedia pages` unticked.
2. Leaving that tab open, open the popup and tick `Show on Wikipedia pages`.

    **Expected**: The `Time travel` button appears in the article without reloading it.

3. Close the popup, open it again and untick, then tick the checkbox once more.

    **Expected**: The button disappears and reappears, and only one `Time travel` button is ever
    present.

### Test 14: The setting reports itself as unavailable on a stale extension

This covers the case where the extension's files have changed on disk but the extension has not
been reloaded, so Chrome is still running an older manifest without the `storage` permission.

1. Load the extension, then remove `"storage"` from the `permissions` of `manifest.json` without
   reloading the extension in `chrome://extensions`.
2. Open the popup.

    **Expected**: The `Show on Wikipedia pages` checkbox is disabled and the text below it reads
    "Unavailable. Reload the extension in chrome://extensions." The rest of the popup still works.

### Test 15: Infobox ages are recomputed for the revision

1. Open the article for a living person with a date of birth in the infobox, for example
   https://en.wikipedia.org/wiki/Brian_May, and note the age shown under "Born".
2. Travel back to 1 January 2010.

    **Expected**: The age under "Born" is the age that person was in January 2010, not today's
    age, and it is underlined with a dotted line. Hovering over it shows the revision date and the
    age the article itself renders.

3. Untick `Adjust ages to the revision` in the popup.

    **Expected**: The age goes back to the one the article renders, without reloading the page.

### Test 16: Ages that must not move are left alone

1. Open an article for someone who has died, for example
   https://en.wikipedia.org/wiki/Steve_Jobs, and travel back to 1 January 2013.

    **Expected**: The "(aged 56)" next to the date of death is unchanged and not underlined - it is
    the age reached, computed from two fixed dates.

2. Open an article whose subject has only a year of birth in the infobox and travel back.

    **Expected**: The "(age N–N)" range is unchanged and not underlined.

3. Open a current article, not an old revision.

    **Expected**: No age is underlined anywhere; the extension leaves current pages alone.
