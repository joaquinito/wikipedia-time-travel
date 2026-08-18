# Wikipedia Time Travel

<p align="center">
  <img src="icons/wtt_icon2.png" alt="wtt logo" width="200">
  <br>
  <a rel="noreferrer noopener" href="https://chromewebstore.google.com/detail/wikipedia-time-travel/fibnhbiiflnnpjamjjdlcdmhljibkpbp"><img alt="Chrome Web Store" src="https://storage.googleapis.com/web-dev-uploads/image/WlD8wC6g8khYWPJUsQceQkhXSlv1/UV4C4ybeBTsZt43U4xis.png"></a> 
</p>

Wikipedia Time Travel is a browser extension that lets you check how the text and images of Wikipedia pages have changed over time. It gets the version of a Wikipedia page that was most recent at the end of any date of your choice. Additionally, it tells you when the page was created.

## Screenshots

The popup follows Wikipedia's own visual language — a serif wordmark over a hairline rule, the
neutral grey scale and the progressive blue of the Vector 2022 skin — and follows the browser
between light and dark mode.

| Light | Dark |
| --- | --- |
| <img src="img/screenshots/popup_light.png" alt="Popup on a Wikipedia article, light mode" width="320"> | <img src="img/screenshots/popup_dark.png" alt="Popup on a Wikipedia article, dark mode" width="320"> |

| Loading | Not a Wikipedia page |
| --- | --- |
| <img src="img/screenshots/popup_loading.png" alt="Popup while the article data is loading" width="320"> | <img src="img/screenshots/popup_no_wikipedia_page.png" alt="Popup on a page that is not a Wikipedia page" width="320"> |

## Using it from the Wikipedia page itself

Besides the toolbar popup, the extension can add a **Time travel** button to the top of every
Wikipedia article, immediately to the left of the language selector. Clicking it opens the same
date picker without leaving the page.

This is on by default and can be turned off with the *Show on Wikipedia pages* checkbox at the
bottom of the popup. Turning it on or off takes effect straight away, without reloading the page.

## Installation on Google Chrome (unpacked extension)

1. Clone this repository to your local machine.
2. Open the Extension Management page by navigating to `chrome://extensions`. The Extension Management page can also be opened by clicking on the Chrome menu, hovering over `Extensions` then selecting `Manage Extensions`.
3. Enable Developer Mode by clicking the `Developer mode` toggle switch in upper right corner.
4. Click the `Load unpacked` button and select this extension's folder.
5. The extension should now be installed and ready to use in the extensions list.

## How to use

1. Navigate to any Wikipedia page.
2. Click on the extension icon in the browser toolbar, or on the `Time travel` button next to the
   language selector at the top of the page.
3. Enter the date you want to check the page for.
4. Click on the `Go` button.
5. The page will be reloaded with the version of the page that was most recent at the end of the date you entered.


## Project layout

| Path | What it holds |
| --- | --- |
| `popup/` | The toolbar popup |
| `content/` | The in-page widget, injected into Wikipedia articles |
| `shared/` | MediaWiki API calls and settings storage, used by both |

## Running tests 

Pre-requisite: Install Node.js.

1. Open a terminal on the root of the project.
2. Install dependencies: `npm install`
3. Run unit tests: `npm test`
4. Run end-to-end tests: `npm run e2e` 

## Feedback and contributions

If you'd like to raise an issue, please do so in the Issues section of this repository. If you'd like to contribute, please fork this repository and submit a pull request.