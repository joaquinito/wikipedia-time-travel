# Wikipedia Time Travel

<p align="center">
  <img src="img/icons/wtt_icon_1024.png" alt="wtt logo" width="200">
  <br>
  <a rel="noreferrer noopener" href="https://chromewebstore.google.com/detail/wikipedia-time-travel/fibnhbiiflnnpjamjjdlcdmhljibkpbp"><img alt="Chrome Web Store" src="https://developer.chrome.com/static/docs/webstore/branding/image/UV4C4ybeBTsZt43U4xis.png"></a> 
</p>

Wikipedia Time Travel is a browser extension that lets you check how the text and images of Wikipedia pages have changed over time. It gets the version of a Wikipedia page that was most recent at the end of any date of your choice. Additionally, it tells you when the page was created.

## Installation on Google Chrome (unpacked extension)

1. Clone this repository to your local machine.
2. Open the Extension Management page by navigating to `chrome://extensions`. The Extension Management page can also be opened by clicking on the Chrome menu, hovering over `Extensions` then selecting `Manage Extensions`.
3. Enable Developer Mode by clicking the `Developer mode` toggle switch in upper right corner.
4. Click the `Load unpacked` button and select this extension's folder.
5. The extension should now be installed and ready to use in the extensions list.

## Installation on Mozilla Firefox (from file)

1. Clone this repository to your local machine.
2. Open `about:debugging` in Firefox.
3. Select `This Firefox` in the sidebar.
4. Click the `Load Temporary Add-on` button and select this extension's `manifest.json` file.
5. The extension should now be installed and ready to use until Firefox is restarted.

## How to use

1. Navigate to any Wikipedia page and click the extension icon in the toolbar.
2. The popup shows the page name and the date it was created.
3. Pick a date in one of two ways:
   - **Quick jump**: choose an amount and a unit (e.g. `2 years ago`), then click the arrow button. This is relative to the date currently being shown.
   - **Exact date**: choose a day, month and year in the date picker, then click the arrow button.
4. The tab reloads with the version of the page that was most recent at the end of that day, and the popup shows a `Showing page on <date>` notice.


## Running tests 

Pre-requisite: Install Node.js.

1. Open a terminal on the root of the project.
2. Install dependencies: `npm install`
3. Run unit tests: `npm test`
4. Run end-to-end tests: `npm run e2e` 

## Feedback and contributions

If you'd like to raise an issue, please do so in the Issues section of this repository. 

If you'd like to contribute, please fork this repository and submit a pull request.