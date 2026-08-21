//
//  FEBluetoothSDK.h
//  FEBluetoothSDK
//
//  Created by ericj on 2020/5/20.
//  Copyright © 2020 Feasycom. All rights reserved.
//
//

#import <Foundation/Foundation.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import "FEPeripheral.h"

// SDK 版本
#define SDK_VERSION @"1.0.4"

/// 连接状态
typedef NS_ENUM(NSInteger, CONNECTSTATE) {
    CONNECTSTATE_SUCCESS,       // 连接成功
    CONNECTSTATE_FAIL,          // 连接失败
    CONNECTSTATE_DISCONNECT,    // 断开连接
};

NS_ASSUME_NONNULL_BEGIN

@interface FEFilter : NSObject

/// 是否过滤信号值
@property (nonatomic, assign) BOOL isFilterRSSI;
/// 是否过滤名称
@property (nonatomic, assign) BOOL isFilterName;
/// 过滤最小信号值（达不到此信号过滤掉, 设置范围是 -100 ~ 0, 不要大于maxRSSI）
@property (nonatomic, assign) NSInteger minRSSI;
/// 过滤最大信号值（超过此信号过滤掉, 设置范围是 -100 ~ 0，不要小于minRSSI）
@property (nonatomic, assign) NSInteger maxRSSI;
/// 过滤设备名（包含此名称的才回调）
@property (nonatomic, strong) NSString *filtrationName;

@end

typedef void(^ScanBlock)(FEPeripheral* peripheral, BOOL isNew);
typedef void(^ConnectStateBlock)(FEPeripheral * _Nonnull peripheral, CONNECTSTATE connectState);

@interface FEBluetoothSDK : NSObject <CBCentralManagerDelegate>

/// 单例对象
+ (instancetype)sharedFEBluetoothSDK;
/// 是否显示调试信息
@property (nonatomic, assign) BOOL isShowLog;
/// 中心管理者
@property (nonatomic, strong) CBCentralManager *centraManage;
/// 过滤
@property (nonatomic, strong) FEFilter *filter;
/// 搜索到的外设数组
@property (nonatomic, strong) NSMutableArray<FEPeripheral *> *scanPeripherals;
/// 已经连接的外设数组
@property (nonatomic, strong) NSMutableArray<FEPeripheral *> *peripherals;

/// 蓝牙状态回调
- (void)stateChange:(void(^)(CBCentralManager *manager))central;

/// 搜索普通通讯设备
/// @param scanBlock 回调（peripheral:搜索到的设备）
/// 返回YES为已打开蓝牙，NO为未打开蓝牙
- (BOOL)scan:(ScanBlock)scanBlock;

/// 停止搜索
- (void)stopScan;

/// 排序
/// @param sortedComplete 排序完成
- (void)sort:(void(^)(NSMutableArray<FEPeripheral *>* scanPeripherals))sortedComplete;

/// 连接设备进入普通通讯模式（基础连接）
/// @param peripheral 设备
/// @param connectStateBlock 是否连接成功回调，断开连接也从这里回调
- (void)connect:(FEPeripheral *)peripheral connectState:(ConnectStateBlock)connectStateBlock;

/// 连接设备进入普通通讯模式（基础连接）
/// @param peripheral 设备
/// @param isUseFacp 是否使用Facp，默认使用
/// @param connectStateBlock 是否连接成功回调，断开连接也从这里回调
- (void)connectToCommunication:(FEPeripheral *)peripheral useFacp:(BOOL)isUseFacp connectState:(ConnectStateBlock)connectStateBlock;

/// 连接设备进入指令模式（基础连接+指令模式）
/// @param peripheral 设备
/// @param connectStateBlock 是否连接成功回调，断开连接也从这里回调
/// @discussion 如果基础连接成功，但是未能进入指令模式，将会主动断开基础连接
- (void)connectToModify:(FEPeripheral *)peripheral connectState:(ConnectStateBlock)connectStateBlock;

/// 连接设备进入空中升级模式（基础连接+升级模式）
/// @param isFactory 是否恢复出厂设置
/// @param peripheral 设备
/// @param connectStateBlock 是否连接成功回调，断开连接也从这里回调
/// @discussion 如果基础连接成功，但是未能进入升级模式，将会主动断开基础连接
- (void)connectToOTAWithFactory:(BOOL)isFactory peripheral:(FEPeripheral *)peripheral connectState:(ConnectStateBlock)connectStateBlock;

/// 断开设备
/// @param peripheral 设备
- (void)disconnect:(FEPeripheral *)peripheral complete:(void(^)(FEPeripheral *peripheral))complete;

/// 清空设备列表（scanPeripherals 的数据）
- (void)clear;

#pragma mark - api专属，请勿使用
- (void)instruction:(NSString *)key value:(nullable id)value;
@end

NS_ASSUME_NONNULL_END
