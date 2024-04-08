/*
In the end-to-end test the way that we are able to find the extensions url to navigate to is via a service_worker. 
In order to use a service_worker one needs to exist and be specified. 
To get this to work an empty background.js file was added to the project.

Idea taken from here:
https://vivrichards.co.uk/automation/e2e-testing-chrome-extension-using-puppeteer
*/