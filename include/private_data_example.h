#ifndef PRIVATE_DATA
#define PRIVATE_DATA

// ########################################
// ###########  OPTIONAL FALLBACK  #########
// ########################################
// Normally the device string is entered with the Web Installer and stored on
// the ESP32 (SPIFFS /config.json). You do NOT need this file in that case.
//
// Fallback: hard-code the device string at build time.
// It is only used when no device string was stored via the Web Installer.
// 1. Copy this file into the same directory and rename it to "private_data.h".
//    -> "private_data.h" is excluded by .gitignore and never uploaded.
// 2. Create an LNbits wallet and enable the Fossa (or LNURLDevice) extension.
// 3. Create a device and paste its string below: URL,secret,currency
// 4. Build with the "esp32dev" environment (the "installer" environment
//    ignores this file on purpose).
const String lnurlDeviceString = "https://demo.lnbits.com/fossa/api/v1/lnurl/idexample,keyexample,EUR";
// #################### EXAMPLE:  "https://demo.lnbits.com/fossa/api/v1/lnurl/idexample,keyexample,EUR"
// ########################################

#endif
