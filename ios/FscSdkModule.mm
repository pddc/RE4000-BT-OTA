//
//  FscSdkModule.m
//  BleOtaApp
//
//  React Native native module bridging the Feasycom iOS BLE SDK.
//  Mirrors the Android FscSdkModule.java — same event names, same JS API.
//

#import "FscSdkModule.h"
#import <React/RCTLog.h>
#import <CoreBluetooth/CoreBluetooth.h>

// SDK headers (from ios/FeasyBlueSDK/)
#import "FEBluetoothSDK.h"
#import "FEPeripheral.h"
#import "FEOTA.h"

// ─── Event names (must match NativeFscSdk.ts) ────────────────────────────────
static NSString *const EVENT_DEVICE_FOUND  = @"onDeviceFound";
static NSString *const EVENT_SCAN_STOPPED  = @"onScanStopped";
static NSString *const EVENT_CONNECTED     = @"onConnected";
static NSString *const EVENT_DISCONNECTED  = @"onDisconnected";
static NSString *const EVENT_OTA_PROGRESS  = @"onOtaProgress";
static NSString *const EVENT_OTA_SUCCESS   = @"onOtaSuccess";
static NSString *const EVENT_OTA_FAILURE   = @"onOtaFailure";

@implementation FscSdkModule {
    // Scanned peripherals keyed by UUID string (iOS has no MAC address)
    NSMutableDictionary<NSString *, FEPeripheral *> *_peripherals;
    // The peripheral currently being used for OTA
    FEPeripheral *_otaPeripheral;
    // Current FEOTA instance
    FEOTA *_ota;
}

RCT_EXPORT_MODULE(FscSdk);

// ─── RCTEventEmitter ─────────────────────────────────────────────────────────

- (NSArray<NSString *> *)supportedEvents {
    return @[
        EVENT_DEVICE_FOUND,
        EVENT_SCAN_STOPPED,
        EVENT_CONNECTED,
        EVENT_DISCONNECTED,
        EVENT_OTA_PROGRESS,
        EVENT_OTA_SUCCESS,
        EVENT_OTA_FAILURE,
    ];
}

- (void)startObserving {
    RCTLogInfo(@"[FscSdk] JS event listeners attached");
}

- (void)stopObserving {
    RCTLogInfo(@"[FscSdk] JS event listeners detached");
}

// ─── Init ────────────────────────────────────────────────────────────────────

- (instancetype)init {
    if (self = [super init]) {
        _peripherals = [NSMutableDictionary new];
    }
    return self;
}

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

- (void)sendEventSafe:(NSString *)name body:(id)body {
    if (![NSThread isMainThread]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self sendEventSafe:name body:body];
        });
        return;
    }

    @try {
        [self sendEventWithName:name body:body];
    } @catch (NSException *e) {
        RCTLogWarn(@"[FscSdk] sendEventWithName %@ threw: %@", name, e.reason);
    }
}

- (void)emitDisconnect:(NSString *)reason {
    [self sendEventSafe:EVENT_DISCONNECTED body:@{ @"reason": reason ?: @"unknown" }];
}

// ─── SDK Init ────────────────────────────────────────────────────────────────

RCT_EXPORT_METHOD(initialize:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    // Access the shared SDK instance now to trigger CBCentralManager creation.
    // iOS initializes the BT stack asynchronously — touching the singleton here
    // gives it time to reach CBManagerStatePoweredOn before the user taps Scan.
    FEBluetoothSDK *sdk = [FEBluetoothSDK sharedFEBluetoothSDK];
    sdk.isShowLog = YES;

    // Register for BT state changes so we can log when it becomes ready
    [sdk stateChange:^(CBCentralManager *manager) {
        RCTLogInfo(@"[FscSdk] CBCentralManager state changed: %ld", (long)manager.state);
    }];

    // Explicitly disable all filters so ALL BLE devices are returned during scan
    FEFilter *filter = sdk.filter;
    if (filter) {
        filter.isFilterRSSI = NO;
        filter.isFilterName = NO;
        filter.filtrationName = nil;
    }

    resolve(@YES);
}

// ─── BLE Scan ────────────────────────────────────────────────────────────────

// Helper: attempt to start a BLE scan, retrying once after a delay if the
// CBCentralManager hasn't finished initializing yet (returns NO on first call).
- (void)attemptScan:(int)durationSeconds
           attempt:(int)attempt
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject {

    [_peripherals removeAllObjects];

    FEBluetoothSDK *sdk = [FEBluetoothSDK sharedFEBluetoothSDK];
    CBManagerState btState = sdk.centraManage ? sdk.centraManage.state : CBManagerStateUnknown;
    RCTLogInfo(@"[FscSdk] attemptScan attempt=%d, BT state=%ld", attempt, (long)btState);

    BOOL started = [sdk scan:^(FEPeripheral *peripheral, BOOL isNew) {
        NSString *uuid = peripheral.peripheral.identifier.UUIDString;
        NSString *advertisedName = peripheral.advertisementData[CBAdvertisementDataLocalNameKey];
        NSString *name = advertisedName.length > 0 ? advertisedName : (peripheral.peripheral.name ?: @"");
        NSInteger rssi = peripheral.RSSI ? peripheral.RSSI.integerValue : 0;

        RCTLogInfo(@"[FscSdk] Device found: '%@' (%@) RSSI=%ld", name, uuid, (long)rssi);

        self->_peripherals[uuid] = peripheral;

        [self sendEventSafe:EVENT_DEVICE_FOUND body:@{
            @"name": name.length > 0 ? name : @"Unknown",
            @"address": uuid,   // UUID on iOS (no MAC address available)
            @"rssi": @(rssi),
        }];
    }];

    RCTLogInfo(@"[FscSdk] scan: returned %@", started ? @"YES" : @"NO");

    if (!started) {
        if (attempt < 5) {
            // CBCentralManager may still be initializing — retry after 1.5s
            RCTLogInfo(@"[FscSdk] BLE not ready yet, retrying scan in 1.5s (attempt %d)", attempt);
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.5 * NSEC_PER_SEC)),
                           dispatch_get_main_queue(), ^{
                [self attemptScan:durationSeconds attempt:attempt + 1 resolve:resolve reject:reject];
            });
        } else {
            reject(@"SCAN_ERROR", @"Bluetooth is not enabled or not ready", nil);
        }
        return;
    }

    // Auto-stop after durationSeconds
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(durationSeconds * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        [[FEBluetoothSDK sharedFEBluetoothSDK] stopScan];
        [self sendEventSafe:EVENT_SCAN_STOPPED body:nil];
    });

    resolve(@YES);
}

RCT_EXPORT_METHOD(startScan:(int)durationSeconds
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    [self attemptScan:durationSeconds attempt:1 resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(stopScan:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    [[FEBluetoothSDK sharedFEBluetoothSDK] stopScan];
    [self sendEventSafe:EVENT_SCAN_STOPPED body:nil];
    resolve(@YES);
}

// ─── BLE Connect (legacy — not needed for OTA, kept for compatibility) ────────

RCT_EXPORT_METHOD(connect:(NSString *)deviceId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    FEPeripheral *peripheral = _peripherals[deviceId];
    if (!peripheral) {
        reject(@"CONNECT_ERROR", @"Device not found in scan results", nil);
        return;
    }

    [[FEBluetoothSDK sharedFEBluetoothSDK] connect:peripheral connectState:^(FEPeripheral *p, CONNECTSTATE state) {
        if (state == CONNECTSTATE_SUCCESS) {
            [self sendEventSafe:EVENT_CONNECTED body:@{ @"address": deviceId }];
        } else if (state == CONNECTSTATE_DISCONNECT) {
            [self emitDisconnect:@"state_disconnected"];
        } else {
            [self emitDisconnect:@"connect_failed"];
        }
    }];

    resolve(@YES);
}

RCT_EXPORT_METHOD(disconnect:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (_otaPeripheral) {
        [[FEBluetoothSDK sharedFEBluetoothSDK] disconnect:_otaPeripheral complete:^(FEPeripheral *p) {
            self->_otaPeripheral = nil;
        }];
    }
    resolve(@YES);
}

// ─── OTA ─────────────────────────────────────────────────────────────────────

RCT_EXPORT_METHOD(startOta:(NSString *)assetName
                  deviceAddress:(NSString *)deviceId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {

    FEPeripheral *peripheral = _peripherals[deviceId];
    if (!peripheral) {
        reject(@"OTA_ERROR", @"Device not found — please scan first", nil);
        return;
    }

    // Resolve firmware path: absolute path (downloaded file) or bundle asset name
    NSString *path;
    if ([assetName hasPrefix:@"/"]) {
        path = assetName;
    } else {
        NSString *assetBaseName = [assetName stringByDeletingPathExtension];
        NSString *assetExt = [assetName pathExtension];
        path = [[NSBundle mainBundle] pathForResource:assetBaseName ofType:assetExt];
    }
    if (!path || ![[NSFileManager defaultManager] fileExistsAtPath:path]) {
        reject(@"OTA_ERROR", [NSString stringWithFormat:@"Firmware file not found: %@", assetName], nil);
        return;
    }

    NSData *firmwareData = [NSData dataWithContentsOfFile:path];
    if (!firmwareData) {
        reject(@"OTA_ERROR", @"Failed to read firmware file", nil);
        return;
    }

    _otaPeripheral = peripheral;

    RCTLogInfo(@"[FscSdk] startOta target: '%@' (%@), firmware=%@ (%lu bytes)",
               peripheral.peripheral.name ?: @"<no name>",
               peripheral.peripheral.identifier.UUIDString,
               [path lastPathComponent],
               (unsigned long)firmwareData.length);

    // startProgress checks peripheral.isConnected and silently does nothing if
    // the OTA connection isn't up yet (it also registers FEOTA as the
    // peripheral's receive callback — without that, the module's XMODEM 'S'
    // polls are never answered and the module aborts with CAN CAN CAN).
    // So: connect first, and only start the transfer on CONNECTSTATE_SUCCESS.
    __block BOOL otaStarted = NO;

    // Connect in OTA mode — SDK manages the BLE connection internally
    [[FEBluetoothSDK sharedFEBluetoothSDK]
        connectToOTAWithFactory:NO
        peripheral:peripheral
        connectState:^(FEPeripheral *p, CONNECTSTATE state) {
            NSString *stateName = state == CONNECTSTATE_SUCCESS ? @"SUCCESS"
                                : state == CONNECTSTATE_FAIL ? @"FAIL"
                                : state == CONNECTSTATE_DISCONNECT ? @"DISCONNECT"
                                : [NSString stringWithFormat:@"UNKNOWN(%ld)", (long)state];
            RCTLogInfo(@"[FscSdk] OTA connectState=%@ for '%@' (%@)",
                       stateName,
                       p.peripheral.name ?: @"<no name>",
                       p.peripheral.identifier.UUIDString);
            if (state == CONNECTSTATE_SUCCESS) {
                if (otaStarted) return;
                otaStarted = YES;
                // FEOTA arms NSTimers — run on the main queue so they fire.
                dispatch_async(dispatch_get_main_queue(), ^{
                    [self beginOtaTransfer:firmwareData peripheral:peripheral];
                });
            } else if (state == CONNECTSTATE_DISCONNECT) {
                // Disconnected during or after OTA
                [self emitDisconnect:@"ota_disconnect"];
            } else if (state == CONNECTSTATE_FAIL) {
                [self emitDisconnect:@"ota_connect_failed"];
                [self sendEventSafe:EVENT_OTA_FAILURE body:@{ @"reason": @"Failed to connect for OTA" }];
            }
        }];

    resolve(@YES);
}

// Parse the firmware file and start the XMODEM transfer. Must only be called
// once the OTA connection is established (peripheral.isConnected == YES).
- (void)beginOtaTransfer:(NSData *)firmwareData peripheral:(FEPeripheral *)peripheral {
    FEOTA *ota = [[FEOTA alloc] initWithPeripheral:peripheral];
    ota.isShowLog = YES;
    _ota = ota;

    [ota infoFromData:firmwareData
             complete:^(NSString *bootloader, NSString *binCrc, NSInteger length,
                        NSString *versionRange, NSString *modelType, NSInteger modelTypeNum,
                        NSString *uploadModel, NSString *crc) {

        RCTLogInfo(@"[FscSdk] OTA firmware parsed: length=%ld bootloader=%@ versionRange=%@ modelType=%@(%ld) uploadModel=%@ crc=%@/%@",
                   (long)length, bootloader, versionRange, modelType, (long)modelTypeNum, uploadModel, binCrc, crc);
        RCTLogInfo(@"[FscSdk] Calling FEOTA startProgress on '%@' (%@), isConnected=%d",
                   peripheral.peripheral.name ?: @"<no name>",
                   peripheral.peripheral.identifier.UUIDString,
                   peripheral.isConnected);

        [ota startProgress:^(float progress, NSInteger len, NSInteger finishLength) {
            // Calculate percentage: (completed bytes / total bytes) * 100
            float percentage = (len > 0) ? ((float)finishLength / (float)len) * 100.0f : 0.0f;
            RCTLogInfo(@"[FscSdk] OTA progress: %.1f%% (%ld/%ld bytes)", percentage, (long)finishLength, (long)len);
            [self sendEventSafe:EVENT_OTA_PROGRESS body:@{ @"progress": @(percentage) }];
        }
        finish:^{
            RCTLogInfo(@"[FscSdk] OTA finish callback");
            [self sendEventSafe:EVENT_OTA_SUCCESS body:nil];
            // Device reboots → connection drops
            self->_otaPeripheral = nil;
            [self emitDisconnect:@"ota_success_reboot"];
        }
        abort:^{
            RCTLogInfo(@"[FscSdk] OTA aborted");
            [self sendEventSafe:EVENT_OTA_FAILURE body:@{ @"reason": @"OTA aborted" }];
            self->_otaPeripheral = nil;
            [self emitDisconnect:@"ota_aborted"];
        }
        timeout:^{
            RCTLogInfo(@"[FscSdk] OTA timeout");
            [self sendEventSafe:EVENT_OTA_FAILURE body:@{ @"reason": @"OTA timed out" }];
            self->_otaPeripheral = nil;
            [self emitDisconnect:@"ota_timeout"];
        }];

    } faile:^{
        RCTLogError(@"[FscSdk] Failed to parse firmware file");
        [self sendEventSafe:EVENT_OTA_FAILURE body:@{ @"reason": @"Failed to parse firmware file" }];
    }];
}

@end
