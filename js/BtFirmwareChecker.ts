/**
 * BtFirmwareChecker Service
 * Fetches latest BT module firmware version from Firestore (app_config/re4000_updater)
 * and compares against the device's current BT module version.
 *
 * Firestore document structure:
 *   app_config/re4000_updater:
 *     BTfw: "V2.9.1"           // Latest BT module version
 *     BTFile: "291.dfu"        // Firmware filename
 */

import firestore from '@react-native-firebase/firestore';
import type { DeviceInfo } from '../types';

export type BtVersionInfo = {
  version: string;    // e.g., "V2.9.1"
  filename: string;   // e.g., "291.dfu"
};

export class BtFirmwareChecker {
  /**
   * Fetch the latest BT module firmware version and filename from Firestore.
   * Returns null if the check could not be performed (e.g. no network).
   */
  static async fetchLatestBtVersion(): Promise<BtVersionInfo | null> {
    try {
      const doc = await firestore()
        .collection('app_config')
        .doc('re4000_updater')
        .get();

      if (!doc.exists) {
        console.warn('[BtVersionCheck] app_config/re4000_updater not found');
        return null;
      }

      const data = doc.data()!;
      const version: string = data.BTfw ?? '';
      const filename: string = data.BTFile ?? '';

      if (!version || !filename) {
        console.warn('[BtVersionCheck] BTfw or BTFile missing in Firestore');
        return null;
      }

      console.log(`[BtVersionCheck] Latest BT version: ${version}, file: ${filename}`);

      return { version, filename };
    } catch (error) {
      console.warn('[BtVersionCheck] Failed to fetch BT version:', error);
      return null;
    }
  }

  /**
   * Parse the device BT version string to extract just the version number.
   * Example: "V2.9.1 20250427" → "V2.9.1"
   */
  static parseDeviceBtVersion(btString: string): string {
    if (!btString) return '';
    // Split by space and take the first part
    const parts = btString.trim().split(/\s+/);
    return parts[0] || '';
  }

  /**
   * Numeric core of a BT version for comparison — strips a leading "v"/"V"
   * prefix and normalizes case, so "V2.9.1", "v2.9.1", and "2.9.1" all compare
   * equal (the device and Firestore have shipped both prefix casings, which
   * was falsely prompting a 2.9.1 → 2.9.1 update).
   */
  static normalizeVersion(v: string): string {
    return this.parseDeviceBtVersion(v).replace(/^v/i, '').toLowerCase();
  }

  /**
   * Device BT version formatted for the UI: always a lowercase "v" prefix to
   * match the App-FW display ("v2.9.1"), whatever casing the device reports.
   */
  static displayBtVersion(btString: string): string {
    const core = this.normalizeVersion(btString);
    return core ? `v${core}` : '';
  }

  /**
   * Determine if the device needs a BT module firmware update.
   *
   * Gated on whether the device reports a BT version, NOT on the bootloader
   * value: BL 1.2 (old bslinfo) and appinfo both report it → compare and prompt
   * only if it differs; BL 1.1 reports no BT version → never prompt (app update
   * only, after which the device reboots into appinfo and reports everything).
   *
   * @param deviceInfo  Device information from the info command
   * @param latestVersion  Latest BT version from Firestore (e.g., "V2.9.1")
   * @returns true if update is needed, false otherwise
   */
  static needsUpdate(deviceInfo: DeviceInfo, latestVersion: string): boolean {
    // Only prompt a BT update when the device actually reports a BT version —
    // BL 1.2 (old bslinfo) and the new appinfo protocol both do. BL 1.1 reports
    // only uid + bootloader, so its sole path is the app update; we never prompt
    // a BT update there. (The old rule force-updated any device whose bootloader
    // VALUE was 1.1, wrongly catching appinfo devices already on the latest BT.)
    const deviceBtVersion = this.parseDeviceBtVersion(deviceInfo.bt || '');
    if (!deviceBtVersion) {
      console.log('[BtVersionCheck] No BT version reported → no BT update offered');
      return false;
    }

    const parsedLatestVersion = this.parseDeviceBtVersion(latestVersion);
    if (!parsedLatestVersion) {
      console.log('[BtVersionCheck] Could not parse latest BT version → no BT update');
      return false;
    }

    // Compare on the numeric core, ignoring "v"/"V" prefix and case.
    const needsUpdate = this.normalizeVersion(deviceBtVersion) !== this.normalizeVersion(parsedLatestVersion);

    console.log(`[BtVersionCheck] Device: ${deviceBtVersion}, Latest: ${parsedLatestVersion}, Needs update: ${needsUpdate}`);
    
    return needsUpdate;
  }

  /**
   * Check if the device has bootloader v1.1 (old firmware without version info).
   */
  static isBootloaderV1_1(deviceInfo: DeviceInfo): boolean {
    const bootloader = deviceInfo.bootloader || '';
    return bootloader.startsWith('v1.1') || bootloader.startsWith('1.1');
  }
}
