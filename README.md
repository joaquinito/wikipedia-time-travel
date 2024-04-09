# Wikipedia Time Travel

<p align="center">
  <img src="icons/wtt_icon2.png" alt="wtt logo" width="200">
  <br>
  <a rel="noreferrer noopener" href="https://chromewebstore.google.com/detail/wikipedia-time-travel/fibnhbiiflnnpjamjjdlcdmhljibkpbp"><img alt="Chrome Web Store" src="https://storage.googleapis.com/web-dev-uploads/image/WlD8wC6g8khYWPJUsQceQkhXSlv1/UV4C4ybeBTsZt43U4xis.png"></a> 
</p>

Wikipedia Time Travel is a browser extension that lets you check how the text and images of Wikipedia pages have changed over time. It gets the version of a Wikipedia page that was most recent at the end of any date of your choice. Additionally, it tells you when the page was created.

## Installation on Google Chrome (unpacked extension)

1. Clone this repository to your local machine.
2. Open the Extension Management page by navigating to `chrome://extensions`. The Extension Management page can also be opened by clicking on the Chrome menu, hovering over `Extensions` then selecting `Manage Extensions`.
3. Enable Developer Mode by clicking the `Developer mode` toggle switch in upper right corner.
4. Click the `Load unpacked` button and select this extension's folder.
5. The extension should now be installed and ready to use in the extensions list.

## How to use

1. Navigate to any Wikipedia page.
2. Click on the extension icon in the browser toolbar.
3. Enter the date you want to check the page for.
4. Click on the `Go` button.
5. The page will be reloaded with the version of the page that was most recent at the end of the date you entered.


## Running tests 

Pre-requisite: Install Node.js.

1. Open a terminal on the root of the project.
2. Install dependencies: `npm install`
3. Run unit tests: `npm test`
4. Run end-to-end tests: `npm run e2e` 

## Feedback and contributions

If you'd like to raise an issue, please do so in the Issues section of this repository. If you'd like to contribute, please fork this repository and submit a pull request.