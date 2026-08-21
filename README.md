# RE4000 BT Module OTA — code extract

This repository contains **only** the BT-module firmware-update (OTA) code
extracted from the RE4000 Updater React Native app, for review by Feasycom.
It is a source extract, not a buildable app — every file is a verbatim copy of
the production code (paths noted below), so what you see here is exactly what
runs on users' phones.

The BT module is updated with the **Feasycom SDK** (XMODEM BLE OTA):

- **Android**: `Fsc_Core_Lib-release.aar` — `FscCoreSdk` for scan/connect,
  `XmodemBleOta` for the transfer.
- **iOS**: `libFEBluetoothSDK.a` (headers in `ios/FeasycomSDK/`) —
  `FEBluetoothSDK` for scan, `connectToOTAWithFactory:` + `FEOTA` for the
  transfer.

Both platforms are bridged to JavaScript through a single native module named
`FscSdk` with an identical event/API surface.

## Repository layout

| Path | Origin in the app | What it is |
|---|---|---|
| `js/FscSdk.ts` | `src/services/FscSdk.ts` | TypeScript wrapper around the `FscSdk` native module (API + event names) |
| `js/BtModuleUpdateFlow.ts` | `src/screens/MainScreen.tsx` (extract) | The full OTA orchestration: fw1036 → disconnect → scan → `startOta` → completion detection → `BTRESTREBOOT` finalization. **Reference extract, not compilable** — see its header |
| `js/BtFirmwareDownloader.ts` | `src/services/BtFirmwareDownloader.ts` | Downloads the `.dfu` file (Firebase Storage) to the local cache |
| `js/BtFirmwareChecker.ts` | `src/services/BtFirmwareChecker.ts` | Version comparison logic (device-reported BT version vs. latest) |
| `android/FscSdkModule.java` | `android/app/src/main/java/com/reactble/` | Android native module: `FscCoreSdk` init/scan/connect + `XmodemBleOta` |
| `android/FscSdkPackage.java` | same | React Native package registration |
| `android/libs/Fsc_Core_Lib-release.aar` | `android/app/libs/` | The Feasycom Android SDK binary the app ships with |
| `ios/FscSdkModule.h/.mm` | `ios/ReactBLE/` | iOS native module: `FEBluetoothSDK` scan, `connectToOTAWithFactory:NO`, `FEOTA` transfer |
| `ios/FeasycomSDK/` + `FeasycomSDK.podspec` | `ios/` | The Feasycom iOS SDK (headers + `libFEBluetoothSDK.a`) as consumed via CocoaPods |
| `docs/scanner-commands.md` | — | The scanner-side commands surrounding the OTA (`fw1036`, `exec: BTRESTREBOOT`) |

## How it is wired into the app

Android (`android/app/build.gradle` + `MainApplication.kt`):

```gradle
// Feasycom SDK
implementation files('libs/Fsc_Core_Lib-release.aar')
```

```kotlin
packageList = PackageList(this).packages.apply {
  add(FscSdkPackage())
}
```

iOS (`Podfile`):

```ruby
# Feasycom BLE SDK (static library)
pod 'FeasycomSDK', :path => './FeasycomSDK.podspec'
```

## Update flow summary

1. **Version check** (`BtFirmwareChecker`): the scanner reports its BT module
   version (e.g. `V2.9.1 20250427`); an update is offered when the numeric
   core differs from the latest published version.
2. **Download** (`BtFirmwareDownloader`): the `.dfu` file is downloaded to the
   local cache first — the device is not touched until the firmware is in hand.
3. **Release the module**: on scanner firmware 2.0+ the app sends the text
   command `fw1036` over its own BLE link to the scanner, which releases the
   BT module for OTA (see `docs/scanner-commands.md`), then disconnects.
4. **Scan + OTA** (`FscSdk` native module): the Feasycom SDK scans for the
   module (matched by MAC on Android / CoreBluetooth UUID on iOS) and
   `startOta(filePath, address)` runs the XMODEM transfer. The SDK manages
   its own BLE connection.
5. **Completion detection** (`BtModuleUpdateFlow.ts`): because `OTA_SUCCESS`
   does not fire reliably after a successful flash (the module reboots and
   disconnects silently), success is inferred:
   - `OTA_SUCCESS` event → success;
   - disconnect or 10 s progress stall at **≥ 99 %** → success;
   - disconnect/stall below 99 % → failure;
   - no progress event within 15 s of `startOta` → failure.
6. **Finalize**: the app reconnects to the scanner (retrying up to 60 s — the
   module takes a while to reboot and re-advertise) and sends
   `exec: BTRESTREBOOT`, which factory-resets the module. The module reboots
   again, dropping the link — that drop is the expected success signature.

## How the .dfu gets from the phone to the module (code trace)

The app never parses or re-chunks the `.dfu` — it hands the local file to the
Feasycom SDK, which performs the XMODEM transfer over its own BLE connection.
The complete phone-side chain:

1. `js/BtModuleUpdateFlow.ts` — after the scan matches the module:
   `FscSdk.startOta(localPath, foundAddress)` (with a 10 s guard on the
   native call resolving).
2. `js/FscSdk.ts` → `FscSdk.startOta(filePath, deviceAddress)` — crosses the
   React Native bridge to the native module.
3. **Android** — `android/FscSdkModule.java`, `startOta()`:
   ```java
   BluetoothDevice targetDevice = FscCoreSdk.getInstance()
           .getBluetoothAdapter().getRemoteDevice(deviceAddress);
   File otaFile = new File(filePath);
   XmodemBleOta.getInstance().setOtaFile(otaFile);
   XmodemBleOta.getInstance().startOta(targetDevice, callback);
   ```
   From here the transfer runs entirely inside `Fsc_Core_Lib-release.aar`
   (`XmodemBleOta`), reporting back via `XmodemOtacallback`
   (`onprogress` = percent, `onsuccess`, `onfailure`).
4. **iOS** — `ios/FscSdkModule.mm`, `startOta:` + `beginOtaTransfer:`:
   ```objc
   NSData *firmwareData = [NSData dataWithContentsOfFile:path];
   [[FEBluetoothSDK sharedFEBluetoothSDK]
       connectToOTAWithFactory:NO peripheral:peripheral connectState:...];
   // on CONNECTSTATE_SUCCESS, on the main queue:
   FEOTA *ota = [[FEOTA alloc] initWithPeripheral:peripheral];
   [ota infoFromData:firmwareData complete:...];   // parse the .dfu
   [ota startProgress:... finish:... abort:... timeout:...];  // XMODEM transfer
   ```
   From here the transfer runs entirely inside `libFEBluetoothSDK.a` (`FEOTA`).

The cloud-download step (`js/BtFirmwareDownloader.ts`) exists only to produce
`localPath`; any local `.dfu` file works the same way.

## Platform notes / known behaviors

- **Progress unit**: both platforms emit progress as a percentage (0→~100).
  Android forwards `XmodemOtacallback.onprogress` directly; iOS computes
  `finishLength / len * 100` from `FEOTA startProgress`.
- **iOS**: `FEOTA startProgress` silently does nothing unless the OTA
  connection is up (`peripheral.isConnected`) — it also registers `FEOTA` as
  the peripheral's receive callback, without which the module's XMODEM `S`
  polls are never answered and the module aborts with `CAN CAN CAN`. The app
  therefore connects with `connectToOTAWithFactory:NO` first and only starts
  the transfer on `CONNECTSTATE_SUCCESS`, dispatched to the main queue so
  `FEOTA`'s `NSTimer`s fire.
- **iOS**: the scan match ends the scan early (`stopScan`) once the target
  UUID is seen; Android keeps its full scan window (known-working path, left
  untouched).
- **Android**: scan results are filtered to names starting with `FSC` /
  `RE4000`.
- **Addressing**: Android matches the module by MAC address; iOS by
  CoreBluetooth UUID (no MAC available), compared case-insensitively.
