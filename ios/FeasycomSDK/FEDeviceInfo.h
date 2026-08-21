//
//  FEDeviceInfo.h
//  FEBluetoothSDK
//
//  Created by ericj on 2020/5/22.
//  Copyright © 2020 Feasycom. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <CoreBluetooth/CoreBluetooth.h>

//// 模块类型
//typedef NS_ENUM(NSInteger, MODULE_TYPE) {
//    MODULE_TYPE_UNKNOWN,         // 未知类型
//    MODULE_TYPE_BLE,             // ble
//    MODULE_TYPE_BEACON,          // beacon
//};
//
//// 协议类型
//typedef NS_ENUM(NSInteger, PROTOCOLTYPE) {
//    PROTOCOLTYPE_UNKNOWN,       // 未知协议
//    PROTOCOLTYPE_DEFAULT,       // 通用协议
//    PROTOCOLTYPE_FACP2,         // FACP2
//};

NS_ASSUME_NONNULL_BEGIN

@interface FEDeviceInfo : NSObject

/// 模块名
@property (nonatomic, copy, nullable) NSString *modelName;
/// mac地址
@property (nonatomic, copy, nullable) NSString *mac;
/// 硬件版本
@property (nonatomic, copy, nullable) NSString *device_version;
/// 软件版本
@property (nonatomic, copy, nullable) NSString *system_version;
/// 设备厂家
@property (nonatomic, copy, nullable) NSString *owner;

/// 设备名
@property (nonatomic, copy, nullable) NSString *name;






/// 空中升级模块信息
@property (nonatomic, copy, nullable) NSString *appVersion;
@property (nonatomic, copy, nullable) NSString *firmwareVersion;
@property (nonatomic, copy, nullable) NSString *module;
@property (nonatomic, assign) NSInteger module_number;


/// 设备名-特征
@property (nonatomic, strong, nullable) CBCharacteristic *nameCharacteristic;
/// mac地址-特征
@property (nonatomic, strong, nullable) CBCharacteristic *macCharacteristic;
/// 硬件版本-特征
@property (nonatomic, strong, nullable) CBCharacteristic *device_versionCharacteristic;
/// 软件版本-特征
@property (nonatomic, strong, nullable) CBCharacteristic *system_versionCharacteristic;
/// 厂家-特征
@property (nonatomic, strong, nullable) CBCharacteristic *ownerCharacteristic;

///// 模块类型
//@property (nonatomic) MODULE_TYPE moduleType;
///// 协议类型
//@property (nonatomic) PROTOCOLTYPE protocolType;

/// 将特征值「写入」到对应的信息中
- (void)infoFromCharacteristic:(CBCharacteristic *)characteristic;

/// 根据特征「读取」对应的信息
- (NSString *)getReadValueOfCharacteristic:(CBCharacteristic *)characteristic;

/// 清除数据，设备名除外
- (void)clear;

@end

NS_ASSUME_NONNULL_END
