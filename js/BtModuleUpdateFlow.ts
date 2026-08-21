/**
 * BtModuleUpdateFlow.ts — REFERENCE EXTRACT (not a compilable module)
 *
 * This is the BT-module OTA orchestration extracted verbatim from the app's
 * MainScreen.tsx. It shows the exact sequence, event handling, timers, and
 * thresholds used around the Feasycom SDK (via the FscSdk native module).
 *
 * Symbols not defined here are app UI state / helpers:
 *   setStatus / setBtUpdating / setBtUpdateProgress / setNoticeSheet /
 *   setConnected / setDevice / setFinalizingBt / setBtFinalizeManualNeeded /
 *   setLastUpdateWasBt / setFirmwareComplete  — React state setters (UI only)
 *   bleManager    — the app's own BLE service for the RE4000 scanner link
 *                   (FFF0 service, text commands; see docs/scanner-commands.md)
 *   ensureConnected() — reconnects the app's own BLE link to the scanner
 *   device.id     — MAC address (Android) / CoreBluetooth UUID (iOS) of the scanner
 *
 * High-level sequence:
 *   1. Download .dfu firmware (must succeed before touching the device)
 *   2. New-protocol scanners only: send "fw1036" text command → scanner
 *      releases its BT module for OTA (ACK "fw1036:ack")
 *   3. Disconnect the app's own BLE link to the scanner
 *   4. Scan with the Feasycom SDK for the module, match by address/UUID
 *   5. FscSdk.startOta(localPath, address) → XMODEM OTA (SDK-managed connection)
 *   6. Detect completion (see OTA completion state comment below — the SDK
 *      does not reliably fire OTA_SUCCESS)
 *   7. Finalize: reconnect to the scanner and send "exec: BTRESTREBOOT"
 *      (factory-resets the module; module reboots, link drops — expected)
 */

import { Alert, Platform } from 'react-native';
import * as FscSdk from './FscSdk';
import { BtFirmwareDownloader } from './BtFirmwareDownloader';

// ─────────────────────────────────────────────────────────────────────────────
// BTRESTREBOOT finalization state (from MainScreen.tsx)
//
// A BT module OTA leaves the new module firmware on factory-stale state; the
// scanner must then execute "exec: BTRESTREBOOT" (factory-resets the module and
// wipes its BT pairings). The device reboots after the OTA, so this is a
// reconnect-then-send flow. The pending marker survives an app relaunch and
// expires after 2 minutes — a stale BTRESTREBOOT firing much later would wipe
// the user's pairings when they least expect it.
// ─────────────────────────────────────────────────────────────────────────────

const BT_RESTORE_WINDOW_MS = 2 * 60_000;
const pendingBtRestore: { current: { deviceId: string; expiresAt: number } | null } = { current: null };
const btRestoreInFlight = { current: false };

// writePendingBtRestore() persists the marker to disk in the real app so it
// survives an app relaunch (expiry-bounded); simplified here.
const writePendingBtRestore = (p: { deviceId: string; expiresAt: number } | null) => {
  pendingBtRestore.current = p;
};

// ─────────────────────────────────────────────────────────────────────────────
// Finalization send-site (from MainScreen.tsx — sendPendingBtRestore)
// Fires once a connection to the updated scanner is up with the new protocol
// re-validated — whether the automatic post-OTA reconnect or a manual connect
// got us here.
// ─────────────────────────────────────────────────────────────────────────────

const sendPendingBtRestore = async () => {
  const pending = pendingBtRestore.current;
  if (!pending || btRestoreInFlight.current) return;
  if (Date.now() > pending.expiresAt) { writePendingBtRestore(null); return; }
  // Never factory-reset a different scanner's module (multi-device users).
  if (pending.deviceId !== activeDeviceId) return;
  btRestoreInFlight.current = true;
  try {
    setStatus('Finalizing BT update...');
    // BTRESTREBOOT reboots the module the moment it executes, so the link can
    // drop BEFORE the ack is delivered. Once the command has gone out, a
    // dropped link IS the success signature — only an explicit
    // cmd_not_found, or silence with the link still up, means failure.
    let sent = false;
    let result: 'ok' | 'not_found' | 'timeout' = 'timeout';
    for (let attempt = 0; attempt < 3 && result === 'timeout'; attempt++) {
      try {
        result = await bleManager.sendSerialCommand('BTRESTREBOOT');
        sent = true;
      } catch (e) {
        // Write failed — link already gone. After a successful send that's
        // the reset-reboot; before any send it's a real connection loss.
        console.log('[BtRestore] write failed, sent=', sent, e);
        result = sent ? 'ok' : 'timeout';
        break;
      }
      if (result === 'timeout' && !bleManager.isDeviceConnected()) {
        // Ack never arrived but the module rebooted out from under us —
        // the reset took effect.
        console.log('[BtRestore] ack timeout with link down — treating as success');
        result = 'ok';
        break;
      }
    }
    if (result === 'ok') {
      writePendingBtRestore(null);
      setBtFinalizeManualNeeded(false);
      // The module now factory-resets and reboots — the link dropping right
      // after this is expected, not an error.
      setStatus('BT update finalized.');
      setNoticeSheet({
        tone: 'success',
        title: 'BT update complete',
        message: 'The BT module was reset to factory settings.\nRe-pair your Bluetooth devices with the scanner.',
      });
    } else if (result === 'not_found') {
      // Firmware without exec support — nothing to finalize. Shouldn't
      // happen (BT updates are only offered on new-protocol scanners).
      writePendingBtRestore(null);
      setBtFinalizeManualNeeded(false);
      console.warn('[BtRestore] exec commands not supported by this firmware');
      setStatus('BT module updated.');
    } else {
      // No confirmation — same manual handover as a failed reconnect, with
      // a fresh window for the power-cycle.
      writePendingBtRestore({
        deviceId: pending.deviceId,
        expiresAt: Date.now() + BT_RESTORE_WINDOW_MS,
      });
      setBtFinalizeManualNeeded(true);
      setTimeout(() => setBtFinalizeManualNeeded(false), BT_RESTORE_WINDOW_MS);
      setStatus('BT module updated. Power-cycle your RE4000 and connect to finalize.');
    }
  } finally {
    btRestoreInFlight.current = false;
    setFinalizingBt(false);
  }
};

// In the app this runs from a React effect: whenever the scanner link comes up
// with protocol === 'new' and a pending marker exists, sendPendingBtRestore()
// is invoked.

// ─────────────────────────────────────────────────────────────────────────────
// Main flow (from MainScreen.tsx — handleBtModuleUpdate)
// ─────────────────────────────────────────────────────────────────────────────

const handleBtModuleUpdate = async () => {
  if (!connected || !device || !latestBtVersion) {
    Alert.alert('Error', 'Device must be connected and BT version info available.');
    return;
  }
  // The gate users see when tapping "Update BT Module" below 2.0: a BT
  // update MUST be
  // finalized with "exec: BTRESTREBOOT", which needs app firmware 2.0+.
  if (!scannerFwAtLeast(deviceInfo.app || deviceInfo.version, 2, 0)) {
    setNoticeSheet({
      tone: 'info',
      title: 'Update the Scanner App first',
      message: 'BT module updates require Scanner App 2.0 or later. Update the Scanner App first — the BT module update becomes available on the next connect.',
    });
    return;
  }

  // Accessible from both try and catch so catch can clean up subs on early error
  let cleanupOtaSubsFn: (() => void) | null = null;

  try {
    setBtUpdating(true);
    setBtUpdateProgress(0);
    setStatus('Preparing for BT module update...');

    const deviceAddress = device.id;

    // Download FIRST — don't disturb the scanner until the firmware is
    // actually in hand (a failed download leaves everything untouched).
    setStatus('Downloading BT module firmware...');
    const localPath = await BtFirmwareDownloader.download(
      latestBtVersion.filename,
      (p) => {
        setStatus(`Downloading BT firmware: ${p.percentage}%`);
      }
    );

    // NEW protocol only: tell the scanner to release its BT module for
    // OTA ("fw1036" → ACK "fw1036:ack"). Old-protocol firmware keeps the
    // original disconnect-only flow — it must not receive this command.
    if (bleManager.getProtocolGeneration() === 'new') {
      setStatus('Preparing scanner for BT update...');
      const released = await bleManager.sendCommandWithAck('fw1036');
      if (!released) {
        console.warn('[BtOTA] fw1036 not acknowledged — proceeding anyway');
      }
    }

    setStatus('Disconnecting from RE4000...');
    await bleManager.disconnect();
    setConnected(false);
    setDevice(null);

    // OTA completion state — the SDK does NOT reliably fire OTA_SUCCESS after a
    // successful flash. The device reboots and disconnects silently. Detection
    // (thresholds match the validated BleOtaApp test project):
    //   1. OTA_SUCCESS fires          → immediate success
    //   2. DISCONNECTED fires         → success only if progress ≥ SUCCESS_THRESHOLD %
    //   3. No-progress timeout (10s)  → success only if progress ≥ SUCCESS_THRESHOLD %
    //   4. Startup timeout (15s)      → failure if no progress event ever arrived
    // Progress is a PERCENTAGE (0→~100) on both platforms: Android's
    // XmodemBleOta onprogress and our iOS module both emit percent.
    let lastPct = 0;
    let isCompleted = false;
    let noProgressTimer: ReturnType<typeof setTimeout> | null = null;
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    const NO_PROGRESS_TIMEOUT_MS = 10_000;
    const STARTUP_TIMEOUT_MS = 15_000;
    // A reboot-disconnect below this % is a failed flash, not a success.
    const SUCCESS_THRESHOLD_PCT = 99;

    let progressSub: { remove: () => void };
    let successSub: { remove: () => void };
    let failureSub: { remove: () => void };
    let disconnectedSub: { remove: () => void };

    const cleanupOtaSubs = () => {
      if (noProgressTimer) { clearTimeout(noProgressTimer); noProgressTimer = null; }
      if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
      progressSub?.remove();
      successSub?.remove();
      failureSub?.remove();
      disconnectedSub?.remove();
    };
    cleanupOtaSubsFn = cleanupOtaSubs;

    const markSuccess = () => {
      if (isCompleted) return;
      isCompleted = true;
      cleanupOtaSubs();
      logFirmwareUpdated('bt');
      setBtUpdating(false);
      setBtUpdateProgress(0);
      // In-UI completion (design: no system prompts for happy paths) —
      // the success card/banner shows the BT-specific message.
      setLastUpdateWasBt(true);
      setFirmwareComplete(true);
      setTimeout(() => setFirmwareComplete(false), 8000);
      // Finalization: mark BTRESTREBOOT pending (2-minute window, survives a
      // relaunch) and auto-reconnect; the pending-restore effect sends the
      // command once the link is re-validated. If the reconnect misses, any
      // manual connect inside the window finishes the job.
      writePendingBtRestore({
        deviceId: activeDeviceId ?? '',
        expiresAt: Date.now() + BT_RESTORE_WINDOW_MS,
      });
      setFinalizingBt(true);
      setStatus('BT module updated. Reconnecting to finalize...');
      // The module takes a while to reboot and re-advertise after the OTA
      // (measured on hardware: well past the first reconnect pass). Keep
      // trying for up to 60s — each ensureConnected pass is itself bounded
      // at ~10s — and stop early once the restore effect has cleared the
      // pending marker.
      setTimeout(async () => {
        const retryUntil = Date.now() + 60_000;
        let ok = await ensureConnected();
        while (!ok && Date.now() < retryUntil && pendingBtRestore.current) {
          await new Promise<void>(r => setTimeout(r, 3000));
          if (!pendingBtRestore.current) break;
          ok = await ensureConnected();
        }
        if (!ok && pendingBtRestore.current) {
          // Hand over to the manual path with a fresh 2-minute window —
          // the user needs time to power-cycle and reconnect.
          writePendingBtRestore({
            deviceId: pendingBtRestore.current.deviceId,
            expiresAt: Date.now() + BT_RESTORE_WINDOW_MS,
          });
          setFinalizingBt(false);
          setBtFinalizeManualNeeded(true);
          setTimeout(() => setBtFinalizeManualNeeded(false), BT_RESTORE_WINDOW_MS);
          setStatus('BT module updated. Power-cycle your RE4000 and connect to finalize.');
        }
      }, 3000);
    };

    const markFailure = (reason: string) => {
      if (isCompleted) return;
      isCompleted = true;
      cleanupOtaSubs();
      setBtUpdating(false);
      setBtUpdateProgress(0);
      setStatus(`BT module update failed: ${reason}. You can reconnect to the device.`);
      // Guard alert already covers background-interruption failures.
      if (!transferWasInterrupted()) {
        Alert.alert('Error', `BT module update failed: ${reason}`);
      }
    };

    const resetNoProgressTimer = () => {
      if (noProgressTimer) clearTimeout(noProgressTimer);
      noProgressTimer = setTimeout(() => {
        if (isCompleted) return;
        console.log(`[BtOTA] No progress for 10s at ${lastPct.toFixed(1)}%`);
        if (lastPct >= SUCCESS_THRESHOLD_PCT) {
          markSuccess();
        } else {
          markFailure(`Transfer stalled at ${Math.round(lastPct)}%`);
        }
      }, NO_PROGRESS_TIMEOUT_MS);
    };

    // If the module never starts streaming at all, fail fast with a
    // clearer message than the generic stall (DFU entry + reconnect can
    // take a while, hence the longer window).
    const armStartupTimer = () => {
      startupTimer = setTimeout(() => {
        if (isCompleted || lastPct > 0) return;
        markFailure('Device did not respond — OTA never started');
      }, STARTUP_TIMEOUT_MS);
    };

    progressSub = FscSdk.FscSdkEmitter.addListener(
      FscSdk.Events.OTA_PROGRESS,
      (data: { progress: number }) => {
        if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
        lastPct = data.progress;
        setBtUpdateProgress(data.progress);
        setStatus(`Updating BT module: ${Math.round(data.progress)}%`);
        resetNoProgressTimer();
      }
    );

    successSub = FscSdk.FscSdkEmitter.addListener(
      FscSdk.Events.OTA_SUCCESS,
      () => {
        console.log('[BtOTA] OTA_SUCCESS received');
        markSuccess();
      }
    );

    failureSub = FscSdk.FscSdkEmitter.addListener(
      FscSdk.Events.OTA_FAILURE,
      (data: { reason: string }) => {
        markFailure(data.reason || 'Unknown error');
      }
    );

    // Device reboots after flash → silent BLE disconnect. Only a disconnect
    // at (near-)complete progress is a successful flash; anything earlier
    // means the transfer died mid-stream.
    disconnectedSub = FscSdk.FscSdkEmitter.addListener(
      FscSdk.Events.DISCONNECTED,
      (data: { reason: string }) => {
        if (!isCompleted) {
          console.log(`[BtOTA] Disconnected during OTA: ${data.reason}, at ${lastPct.toFixed(1)}%`);
          if (lastPct >= SUCCESS_THRESHOLD_PCT) {
            markSuccess();
          } else if (lastPct > 0) {
            markFailure(`Connection lost at ${Math.round(lastPct)}%`);
          } else {
            markFailure('Disconnected before OTA started');
          }
        }
      }
    );

    await new Promise<void>(r => setTimeout(r, 2000));

    setStatus('Scanning for BT module...');
    console.log('[BtOTA] Scanning for BT module, target:', deviceAddress);
    let foundAddress: string | null = null;
    const scannedDevices: string[] = [];
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        foundSub.remove();
        stoppedSub.remove();
        resolve();
      };
      const foundSub = FscSdk.FscSdkEmitter.addListener(
        FscSdk.Events.DEVICE_FOUND,
        (data: FscSdk.BleDevice) => {
          console.log('[BtOTA] FscSdk found:', data.name, data.address);
          scannedDevices.push(`${data.name}(${data.address})`);
          if (!foundAddress && data.address.toUpperCase() === deviceAddress.toUpperCase()) {
            foundAddress = data.address;
            console.log('[BtOTA] Target module MATCHED:', data.name, data.address);
            setStatus(`BT module found: ${data.name}`);
            // iOS only: end the scan early once matched. Android keeps the
            // original full-window flow — its OTA path is known-working and
            // stays untouched while we debug iOS.
            if (Platform.OS === 'ios') {
              FscSdk.stopScan().catch(() => {});
              finish();
            }
          }
        }
      );
      const stoppedSub = FscSdk.FscSdkEmitter.addListener(
        FscSdk.Events.SCAN_STOPPED,
        finish
      );
      FscSdk.startScan(15).catch((err: Error) => {
        if (settled) return;
        settled = true;
        foundSub.remove();
        stoppedSub.remove();
        reject(err);
      });
    });

    if (!foundAddress) {
      cleanupOtaSubs();
      const found = scannedDevices.length > 0 ? scannedDevices.join(', ') : 'none';
      console.log('[BtOTA] Target UUID:', deviceAddress, '— FscSdk found:', found);
      throw new Error(`BT module not found. Looking for ${deviceAddress}. Found: ${found}`);
    }

    setStatus('Starting BT module OTA...');
    armStartupTimer();
    await Promise.race([
      FscSdk.startOta(localPath, foundAddress),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('startOta timed out — native module did not respond')), 10000)
      ),
    ]);

  } catch (error) {
    cleanupOtaSubsFn?.();
    setBtUpdating(false);
    setBtUpdateProgress(0);
    const msg = error instanceof Error ? error.message : String(error);
    setStatus(`BT module update error: ${msg}`);
    if (!transferWasInterrupted()) {
      Alert.alert('Error', `BT module update failed: ${msg}`);
    }
  }
};
