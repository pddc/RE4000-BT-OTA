//
//  FEPeripheral.h
//  FEBluetoothSDK
//
//  Created by ericj on 2021/1/22.
//  Copyright © 2021 Feasycom. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import "FEDeviceInfo.h"
@class FEPeripheral;

/// 发送状态
typedef NS_ENUM(NSInteger, FEPeripheralSendState) {
    FEPeripheralSendState_defalut = 0,
    FEPeripheralSendState_sending,
};
/// 当前连接模式(普通通讯、修改设备信息、空中升级)
typedef NS_ENUM(NSInteger, FEPeripheralConnectType){
    FEPeripheralConnectType_default = 0,    // 普通通讯
    FEPeripheralConnectType_modify,         // 修改设备信息
    FEPeripheralConnectType_ota,            // 空中升级
};
/// Facp通讯协议版本
typedef NS_ENUM(NSInteger, FSCFacpType){
    FSCFacpType_2_0 = 0, //
    FSCFacpType_2_1      // 支持报错重传
};

typedef void(^_Nullable ConnectStatusBlock)(FEPeripheral * _Nullable peripheral, CBPeripheralState state);

typedef void(^_Nullable DeviceInfoBlock)(FEPeripheral * _Nonnull peripheral, FEDeviceInfo * _Nullable info);

typedef void(^_Nullable RssiBlock)(FEPeripheral * _Nonnull peripheral, NSNumber * _Nullable RSSI, NSError * _Nullable error);

typedef void(^_Nullable SendBlock)(FEPeripheral * _Nonnull peripheral, NSError* _Nullable error, BOOL pause, BOOL finish);

typedef void(^_Nullable ReceiveBlock)(FEPeripheral * _Nonnull peripheral, CBCharacteristic * _Nonnull characteristic, NSError * _Nullable error);

NS_ASSUME_NONNULL_BEGIN
@interface FEPeripheral : NSObject <CBPeripheralDelegate>

/// 设备信息
@property (nonatomic, strong, nullable) FEDeviceInfo *deviceInfo;
/// 蓝牙目标对象
@property (nonatomic, strong) CBPeripheral *peripheral;
/// 信号值
@property (nonatomic, strong) NSNumber *RSSI;
/// 广播内容对象
@property (nonatomic, strong) NSDictionary *advertisementData;
/// 是否已连接
@property (nonatomic, readonly) BOOL isConnected;
/// 指定Facp通讯协议版本
@property (nonatomic, assign) FSCFacpType facpTpye;

/// mtu大小
@property (nonatomic, readonly) NSInteger mtu_response;
@property (nonatomic, readonly) NSInteger mtu_noResponse;
/// 发送状态
@property (nonatomic, readonly) FEPeripheralSendState sendState;
/// 当前连接模式(普通通讯、修改设备信息、空中升级)
@property (nonatomic, readonly) FEPeripheralConnectType connectType;

// MARK: 附加项，可用可不用
/// 发送数量
@property (nonatomic, readonly) NSInteger sendCount;
/// 接收数量
@property (nonatomic, readonly) NSInteger receiveCount;
/// 发送包数
@property (nonatomic, readonly) NSInteger sePackageCount;
/// 接收包数
@property (nonatomic, readonly) NSInteger rePackageCount;
/// 发送时间
@property (nonatomic, readonly) NSTimeInterval sendTimeInterval;
/// 接收crc32
@property (nonatomic, readonly) NSInteger crc32_re;
/// 发送crc32
@property (nonatomic, readonly) NSInteger crc32_se;
/// 接收的参考数据
@property (nonatomic, strong, readonly) NSMutableData *reData;
/// 累计接收crc32
@property (nonatomic, assign, readonly) NSInteger all_seCRC32;
/// 辅助变量（用户随意自定义使用）
@property (nonatomic, strong) id other;
/// 是否打印日志
@property (nonatomic) BOOL isShowLog;

- (instancetype)initWithPeripheral:(CBPeripheral *)peripheral RSSI:(NSNumber *)RSSI advertisementData:(NSDictionary *)advertisementData;

// MARK: 设置回调 =====================================================================================
/// @param connectStatusBlock 连接状
/// @param deviceInfoBlock 读取模块信息
/// @param rssiBlock 信号值
/// @param sendBlock 发送回调（error：发送错误信息，发送成功为nil。pause：表示是否暂停。finish：表示是否发送完毕）
/// @param receiveBlock 接收数据
- (void)callBackConnectStatus:(ConnectStatusBlock)connectStatusBlock
                   deviceInfo:(DeviceInfoBlock)deviceInfoBlock
                         RSSI:(RssiBlock)rssiBlock
                         send:(SendBlock)sendBlock
                      receive:(ReceiveBlock)receiveBlock;

// MARK: 发送相关 =====================================================================================
/// 发送数据
/// @param data 发送的数据
/// @param isResponse 是否带反馈
/// @param complete 完成（注意：此回调会把callBackConnectStatus的send结果回调覆盖，反之亦然）
- (void)send:(NSData * _Nullable)data withResponse:(BOOL)isResponse complete:(SendBlock)complete;
- (void)send:(NSData * _Nullable)data withResponse:(BOOL)isResponse;

/// 暂停发送
- (void)pauseSend;
/// 停止发送
- (void)stopSend;
/// 继续发送
- (void)continueSend;
/// 剩余待发数量
- (NSInteger)countOfReadyToSend;
/// 清除记录(不清除辅助变量)
- (void)clear;
/// 清除单次记录(不清除辅助变量)
- (void)clearSingleRecord;
/// 清除所有记录(不清除辅助变量)
- (void)clearAllRecord;
/// 读取连接状态，在connectStatus回调
- (void)readConnectStatus;
/// 设置分包大小
- (void)setPackageSize:(NSInteger)size;
/// 是否开启软流控
- (void)softFlowControl:(BOOL)isFlowControl;
/// 发送完成后间隔时间（毫秒）
- (void)sendFinishInterval:(NSInteger)mSeconds;
/// 恢复初始状态
- (void)reInit;
/// 清除特征
- (void)clearCharacteristics;
/// 设置写特征
- (BOOL)setupWriteCharacteristic:(CBCharacteristic *)characteristic;
- (BOOL)setupWriteWithoutResponseCharacteristic:(CBCharacteristic *)characteristic;
/// 获取当前写特征
- (CBCharacteristic*)writeCharacteristic;
- (CBCharacteristic*)writeWithoutResponseCharacteristic;
/// 获取所有写特征
- (NSArray<CBCharacteristic *> *)allWriteCharacteristic;
/// 获取所有不带回调写特征
- (NSArray<CBCharacteristic *> *)allWriteWithoutResponseCharacteristic;
/// 获取所有接收特征
- (NSArray<CBCharacteristic *> *)allNotifyCharacteristic;
/// 获取所有读特征
- (NSArray<CBCharacteristic *> *)allReadCharacteristic;

#pragma mark - api专属，请勿使用
- (void)instruction:(NSString *)key value:(nullable id)value;
@end

NS_ASSUME_NONNULL_END
