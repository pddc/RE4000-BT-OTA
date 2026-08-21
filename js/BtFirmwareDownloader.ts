/**
 * BtFirmwareDownloader Service
 * Downloads BT module firmware (.dfu files) from Firebase Storage.
 * Storage path: gs://re4000-f7c03.firebasestorage.app/firmware/BT/{filename}
 */

import storage from '@react-native-firebase/storage';
import ReactNativeBlobUtil from 'react-native-blob-util';

export type DownloadProgress = {
  received: number;
  total: number;
  percentage: number;
};

export class BtFirmwareDownloader {
  /**
   * Download BT firmware file from Firebase Storage.
   * 
   * @param filename  Firmware filename (e.g., "291.dfu")
   * @param onProgress  Progress callback
   * @returns  Local file path to the downloaded firmware
   */
  static async download(
    filename: string,
    onProgress: (p: DownloadProgress) => void
  ): Promise<string> {
    console.log('[BT FW Download] Downloading:', filename);

    // Storage reference: gs://re4000-f7c03.firebasestorage.app/firmware/BT/{filename}
    const storageRef = storage()
      .ref(`firmware/BT/${filename}`);

    // Local destination path
    const destPath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;

    // Delete existing file if present
    try {
      await ReactNativeBlobUtil.fs.unlink(destPath);
    } catch (_) {
      // File doesn't exist, ignore
    }

    // Get download URL
    const downloadUrl = await storageRef.getDownloadURL();
    console.log('[BT FW Download] Download URL obtained');

    // Download with progress tracking
    const res = await ReactNativeBlobUtil.config({
      path: destPath,
      fileCache: true,
    })
      .fetch('GET', downloadUrl)
      .progress({ count: 10 }, (received, total) => {
        const pct = total > 0 ? Math.round((received / total) * 100) : 0;
        onProgress({ received, total, percentage: pct });
      });

    const statusCode = res.respInfo?.status ?? 0;
    console.log('[BT FW Download] HTTP status:', statusCode);

    if (statusCode !== 200) {
      await ReactNativeBlobUtil.fs.unlink(destPath).catch(() => {});
      throw new Error(`Download failed with status ${statusCode}`);
    }

    console.log('[BT FW Download] Downloaded to:', destPath);
    return destPath;
  }
}
