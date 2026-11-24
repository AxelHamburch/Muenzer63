# Firmware Release Process (Web Installer)

This guide describes how to build a new firmware release for the Muenzer63 Web Installer (`installer/`).
The installer is published at https://ereignishorizont.xyz/installer/muenzer63/ – after a release, upload the
updated `installer/` folder there as well.

There is only one hardware variant (ESP32 dev board, Waveshare 2.13" e-paper V3, `GxEPD2_213_B74`).

> **⚠️ Always build releases with the `installer` environment.**
> It sets `-DINSTALLER_BUILD=1` and ignores `include/private_data.h`.
> A build from `esp32dev` may contain your personal device string – never publish it!

## 1. Get the current Bitcoin block height

```powershell
(Invoke-WebRequest -Uri "https://mempool.space/api/blocks/tip/height" -UseBasicParsing).Content
```

The version is `v<BLOCKHEIGHT>`, e.g. `v977405`.

## 2. Update platformio.ini

In `[env:installer]` set the version, and update the `Current version` comment:

```ini
-DFIRMWARE_VERSION=\"v977405\"
```

## 3. Build

```powershell
C:\Users\Datenrettung\.platformio\penv\Scripts\platformio.exe run -e installer
```

## 4. Copy the binaries

```powershell
$v = "v977405"
$dir = "installer\firmware\$v"
New-Item -ItemType Directory -Path $dir -Force
Copy-Item ".pio\build\installer\bootloader.bin" $dir
Copy-Item ".pio\build\installer\partitions.bin" $dir
Copy-Item ".pio\build\installer\firmware.bin"   $dir
Copy-Item "$env:USERPROFILE\.platformio\packages\framework-arduinoespressif32\tools\partitions\boot_app0.bin" $dir
```

Check that no device string is contained (must print `0`):

```powershell
(Select-String -Path "$dir\firmware.bin" -Pattern "/api/v1/lnurl/" -SimpleMatch).Count
```

## 5. Create manifest.json

`installer/firmware/<version>/manifest.json`:

```json
{
  "name": "Muenzer63",
  "version": "v977405",
  "new_install_prompt_erase": true,
  "builds": [
    {
      "chipFamily": "ESP32",
      "parts": [
        { "path": "bootloader.bin", "offset": 4096 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "firmware.bin", "offset": 65536 }
      ]
    }
  ]
}
```

## 6. Update installer/index.html

Add the new version at the top of the `<select id="firmware-version">` list, mark it as *Latest*,
and set the `manifest` attribute of `<esp-web-install-button>` to the new version.

## Release overview

| Version | Notes                                   |
|---------|-----------------------------------------|
| v977405 | First Web Installer release             |
