#!/usr/bin/env sh

# Get the version from manifest.json
version=$(grep '"version":' manifest.json | sed 's/[^0-9.]//g')
echo Creating zip folder for WTT version $version
# Replace . with _
version=$(echo $version | sed 's/\./_/g')

# Zip all necessary files for the extension
zip -r wikipedia_time_travel_$version.zip manifest.json background.js popup/ icons/ 

