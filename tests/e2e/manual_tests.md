
## Manual end-to-end tests for Wikipedia Time Travel

Unfortunately, support for programmaticaly testing extension popups is still very limited. Therefore, we have to rely on manual testing for several scenarios.

### Test 1: Open the popup

1. On Chrome, click on the Wikipedia Time Travel icon in the Extensions area.
  
    **Expected**: The popup opens.

### Test 2: Open the popup in a Wikipedia page and see the loading animation

1. Open the page for Earth on Wikipedia: https://en.wikipedia.org/wiki/Earth.
2. Open the Wikipedia Time Travel popup.
  
    **Expected**: The popup shows for a brief moment the loading animation.

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


