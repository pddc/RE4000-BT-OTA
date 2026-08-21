package com.reactble;

import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import com.feasycom.FscCoreSdk;
import com.feasycom.bluetooth.FscBleConnectCallback;
import com.feasycom.bluetooth.FscBleScanCallback;
import com.feasycom.ota.XmodemBleOta;
import com.feasycom.ota.XmodemOtacallback;

import android.bluetooth.le.ScanResult;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

public class FscSdkModule extends ReactContextBaseJavaModule {

    private static final String TAG = "FscSdkModule";
    private static final String MODULE_NAME = "FscSdk";

    // Event names sent to JS
    public static final String EVENT_DEVICE_FOUND    = "onDeviceFound";
    public static final String EVENT_SCAN_STOPPED    = "onScanStopped";
    public static final String EVENT_CONNECTED       = "onConnected";
    public static final String EVENT_DISCONNECTED    = "onDisconnected";
    public static final String EVENT_OTA_PROGRESS    = "onOtaProgress";
    public static final String EVENT_OTA_SUCCESS     = "onOtaSuccess";
    public static final String EVENT_OTA_FAILURE     = "onOtaFailure";

    private final ReactApplicationContext reactContext;

    /** The currently connected BluetoothDevice, needed for startOta() */
    private BluetoothDevice connectedDevice = null;

    public FscSdkModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // ─── Helper ──────────────────────────────────────────────────────────────

    /**
     * Send an event to JS, always dispatched on the JS queue thread to avoid
     * threading issues when called from BLE callbacks (Binder/BT threads).
     */
    private void sendEvent(final String eventName, final Object params) {
        reactContext.runOnJSQueueThread(() -> {
            try {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params);
            } catch (Exception e) {
                Log.e(TAG, "sendEvent failed for " + eventName + ": " + e.getMessage());
            }
        });
    }

    /** Convenience: emit a disconnect event with an optional reason string. */
    private void emitDisconnect(String reason) {
        WritableMap map = Arguments.createMap();
        if (reason != null) map.putString("reason", reason);
        sendEvent(EVENT_DISCONNECTED, map);
    }

    // ─── SDK Init ────────────────────────────────────────────────────────────

    @ReactMethod
    public void initialize(Promise promise) {
        try {
            FscCoreSdk.getInstance().Init(reactContext.getApplicationContext());
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("INIT_ERROR", e.getMessage(), e);
        }
    }

    // ─── BLE Scan ────────────────────────────────────────────────────────────

    @ReactMethod
    public void startScan(int durationSeconds, Promise promise) {
        try {
            long durationMs = durationSeconds * 1000L;
            FscCoreSdk.getInstance().BleScan(durationMs, new FscBleScanCallback() {
                @Override
                public void onBleScanStop() {
                    sendEvent(EVENT_SCAN_STOPPED, null);
                }

                @Override
                public void onScanResult(int callbackType, ScanResult result) {
                    BluetoothDevice device = result.getDevice();
                    String name = null;
                    try { name = device.getName(); } catch (SecurityException ignored) {}

                    // Only report devices whose name starts with "FSC" or "RE4000"
                    if (name == null) return;
                    if (!name.startsWith("FSC") && !name.startsWith("fsc") &&
                        !name.startsWith("RE4000") && !name.startsWith("re4000")) {
                        return;
                    }

                    WritableMap map = Arguments.createMap();
                    map.putString("name", name);
                    map.putString("address", device.getAddress());
                    map.putInt("rssi", result.getRssi());
                    sendEvent(EVENT_DEVICE_FOUND, map);
                }

                @Override
                public void onBatchScanResults(List<ScanResult> results) {
                    for (ScanResult r : results) onScanResult(0, r);
                }

                @Override
                public void onScanFailed(int errorCode) {
                    WritableMap map = Arguments.createMap();
                    map.putInt("errorCode", errorCode);
                    sendEvent(EVENT_SCAN_STOPPED, map);
                }
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SCAN_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void stopScan(Promise promise) {
        try {
            FscCoreSdk.getInstance().StopBleScan();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("STOP_SCAN_ERROR", e.getMessage(), e);
        }
    }

    // ─── BLE Connect ─────────────────────────────────────────────────────────

    @ReactMethod
    public void connect(String address, Promise promise) {
        try {
            android.bluetooth.BluetoothAdapter adapter =
                FscCoreSdk.getInstance().getBluetoothAdapter();
            BluetoothDevice device = adapter.getRemoteDevice(address);

            FscCoreSdk.getInstance().FscBleConnect(device, new FscBleConnectCallback() {
                @Override
                public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                    if (newState == android.bluetooth.BluetoothProfile.STATE_CONNECTED) {
                        connectedDevice = gatt.getDevice();
                        WritableMap map = Arguments.createMap();
                        map.putString("address", address);
                        sendEvent(EVENT_CONNECTED, map);
                    } else if (newState == android.bluetooth.BluetoothProfile.STATE_DISCONNECTED) {
                        connectedDevice = null;
                        Log.d(TAG, "onConnectionStateChange: DISCONNECTED status=" + status);
                        emitDisconnect("state_disconnected");
                    }
                }

                @Override
                public void onPrepared(int mtu) {
                    Log.d(TAG, "BLE prepared, MTU=" + mtu);
                }

                @Override
                public void onpacketSend(byte[] data) {
                    // Suppress per-packet logging to avoid BLE thread overhead during OTA
                }

                @Override
                public void onpacketReceived(byte[] data) {
                    // Suppress per-packet logging to avoid BLE thread overhead during OTA
                }

                @Override
                public void onErro(String error) {
                    // onErro is called for BLE errors including connection drops.
                    // Always emit a disconnect so JS can react regardless of which
                    // internal path the SDK uses to report the lost connection.
                    Log.e(TAG, "BLE onErro: " + error);
                    connectedDevice = null;
                    emitDisconnect("error: " + error);
                }
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("CONNECT_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void disconnect(Promise promise) {
        try {
            FscCoreSdk.getInstance().FscBleDisconnect();
            connectedDevice = null;
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("DISCONNECT_ERROR", e.getMessage(), e);
        }
    }

    // ─── OTA ─────────────────────────────────────────────────────────────────

    /**
     * Starts OTA firmware upgrade using a local file path.
     * @param filePath  absolute path to the firmware file (e.g. "/data/user/0/com.reactble/cache/291.dfu")
     * @param deviceAddress  MAC address of the target BLE device
     */
    @ReactMethod
    public void startOta(String filePath, String deviceAddress, Promise promise) {
        try {
            // Resolve the BluetoothDevice from the MAC address.
            // The OTA SDK manages its own BLE connection internally — no prior
            // connect() call is required.
            BluetoothDevice targetDevice = FscCoreSdk.getInstance()
                    .getBluetoothAdapter()
                    .getRemoteDevice(deviceAddress);

            // Use the file path directly (downloaded from Firebase Storage)
            File otaFile = new File(filePath);
            if (!otaFile.exists()) {
                promise.reject("FILE_NOT_FOUND", "OTA file not found: " + filePath);
                return;
            }

            Log.d(TAG, "Starting OTA with file: " + filePath);
            XmodemBleOta.getInstance().setOtaFile(otaFile);
            XmodemBleOta.getInstance().startOta(targetDevice, new XmodemOtacallback() {
                @Override
                public void onsuccess() {
                    Log.d(TAG, "OTA onsuccess");
                    sendEvent(EVENT_OTA_SUCCESS, null);
                    // Device will reboot → connection drops. Emit disconnect so JS
                    // detects it even if onConnectionStateChange doesn't fire.
                    connectedDevice = null;
                    emitDisconnect("ota_success_reboot");
                }

                @Override
                public void onfailure(String reason) {
                    Log.e(TAG, "OTA onfailure: " + reason);
                    WritableMap map = Arguments.createMap();
                    map.putString("reason", reason);
                    sendEvent(EVENT_OTA_FAILURE, map);
                    // Connection is gone after a failure too.
                    connectedDevice = null;
                    emitDisconnect("ota_failure: " + reason);
                }

                @Override
                public void onprogress(float progress) {
                    WritableMap map = Arguments.createMap();
                    map.putDouble("progress", progress);
                    sendEvent(EVENT_OTA_PROGRESS, map);
                }
            });
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("OTA_ERROR", e.getMessage(), e);
        }
    }

    // ─── Utilities ───────────────────────────────────────────────────────────

    private File copyAssetToFiles(String assetName) throws IOException {
        File outFile = new File(reactContext.getFilesDir(), assetName);
        if (outFile.exists()) outFile.delete();
        try (InputStream in = reactContext.getAssets().open(assetName);
             FileOutputStream out = new FileOutputStream(outFile)) {
            byte[] buf = new byte[4096];
            int len;
            while ((len = in.read(buf)) > 0) out.write(buf, 0, len);
        }
        return outFile;
    }

    // Required for addListener / removeListeners (RN event emitter)
    @ReactMethod
    public void addListener(String eventName) { /* no-op */ }

    @ReactMethod
    public void removeListeners(int count) { /* no-op */ }
}
