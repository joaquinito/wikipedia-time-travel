
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
