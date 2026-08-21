/**
 * FscSdk.ts
 * TypeScript wrapper around the FscSdk native module.
 * Provides BLE OTA firmware update functionality using Feasycom SDK.
 */

import { NativeModules, NativeEventEmitter } from 'react-native';

const { FscSdk } = NativeModules;

if (!FscSdk) {
  console.warn(
    'FscSdk native module is not available. ' +
      'Make sure you are running on Android/iOS and the module is registered.',
  );
}

export const FscSdkEmitter = new NativeEventEmitter(FscSdk ?? {});

// ─── Event name constants ────────────────────────────────────────────────────

export const Events = {
  DEVICE_FOUND: 'onDeviceFound',
  SCAN_STOPPED: 'onScanStopped',
  CONNECTED: 'onConnected',
  DISCONNECTED: 'onDisconnected',
  OTA_PROGRESS: 'onOtaProgress',
  OTA_SUCCESS: 'onOtaSuccess',
  OTA_FAILURE: 'onOtaFailure',
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BleDevice {
  name: string;
  address: string;
  rssi: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assertModule(): void {
  if (!FscSdk) {
    throw new Error('FscSdk native module is not available.');
  }
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Initialize the Feasycom SDK. Must be called once before any other method.
 */
export function initialize(): Promise<boolean> {
  assertModule();
  return FscSdk.initialize();
}

/**
 * Start BLE scanning for the given duration (in seconds).
 * Listen to Events.DEVICE_FOUND for discovered devices.
 * Listen to Events.SCAN_STOPPED when the scan ends.
 */
export function startScan(durationSeconds: number = 20): Promise<boolean> {
  assertModule();
  return FscSdk.startScan(durationSeconds);
}

/**
 * Stop an ongoing BLE scan.
 */
export function stopScan(): Promise<boolean> {
  assertModule();
  return FscSdk.stopScan();
}

/**
 * Connect to a BLE device by its MAC address (Android) or UUID (iOS).
 * Listen to Events.CONNECTED / Events.DISCONNECTED for state changes.
 */
export function connect(address: string): Promise<boolean> {
  assertModule();
  return FscSdk.connect(address);
}

/**
 * Disconnect from the currently connected BLE device.
 */
export function disconnect(): Promise<boolean> {
  assertModule();
  return FscSdk.disconnect();
}

/**
 * Start OTA firmware upgrade using a local file path.
 * The SDK manages the BLE connection internally — no prior connect() call needed.
 * @param filePath      Local file path to the .dfu firmware file
 * @param deviceAddress MAC address (Android) or UUID (iOS) of the target device
 * Listen to Events.OTA_PROGRESS, Events.OTA_SUCCESS, Events.OTA_FAILURE.
 */
export function startOta(filePath: string, deviceAddress: string): Promise<boolean> {
  assertModule();
  return FscSdk.startOta(filePath, deviceAddress);
}
