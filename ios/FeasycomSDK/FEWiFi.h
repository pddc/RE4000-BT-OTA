//
//  FEWiFi.h
//  FEBluetoothSDK
//
//  Created by ericj on 2021/2/22.
//  Copyright © 2021 Feasycom. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "FEBluetoothSDK.h"
#import "FEBluetoothSetting.h"

NS_ASSUME_NONNULL_BEGIN

@interface FEWiFi : FEBluetoothSetting

/// 查询Wi-Fi模块当前是否为动态配网模式
/// @param completeBlock 反馈是否为动态配网
- (void)checkConfigDynamicOrStaticNetworkCompleteBlock:(void (^)(BOOL isSwitchedDynamic, NSError * _Nullable error))completeBlock;

/// 使得Wi-Fi模块切换为动态配网模式
/// @param toSwitchDynamic yes - 动态配网，no - 静态配网
/// @param completeBlock 反馈是否切换为动态配网
- (void)switchConfigDynamicOrStaticNetwork:(BOOL)toSwitchDynamic completeBlock:(void (^)(BOOL isSwitchedDynamic, NSError * _Nullable error))completeBlock;

/// 使得Wi-Fi模块进行动态配网
/// @param ssid 网络名称
/// @param pwd 网络密码
/// @param reconnect 是否重新连接，指的是如果已连接的，是否换网络连接
/// @param completeBlock 完成配网回调网络IP地址
- (void)btConfigDynamicNetwork:(NSString *)ssid password:(NSString * _Nullable)pwd reconnect:(BOOL)reconnect completeBlock:(void (^)(NSString * _Nullable IPAddress, NSError * _Nullable error))completeBlock;

/// 使得Wi-Fi模块进行静态配网
/// @param ssid 网络名称
/// @param pwd 网络密码
/// @param statiIp 静态IP地址
/// @param GW GW地址
/// @param MASK 子网掩码地址
/// @param DNS DNS地址
/// @param reonnect 是否重新连接，指的是如果已连接的，是否换网络连接
/// @param completeBlock 完成配网回调网络IP地址
- (void)btConfigStaticNetwork:(NSString *)ssid password:(NSString * _Nullable)pwd staticIp:(NSString *)statiIp GW:(NSString * _Nullable)GW MASK:(NSString * _Nullable)MASK DNS:(NSString * _Nullable)DNS reconnect:(BOOL)reonnect completeBlock:(void (^)(NSString * _Nullable IPAddress, NSError * _Nullable error))completeBlock;

/// 查询Wi-Fi模块当前的IP地址，IPAddress为nil表示查询失败，返回值为NO表示暂时不能配网，可能正在连接或者参数错误
/// @param handler 完成配网回调网络IP地址
- (BOOL)checkIPWithHandler:(void (^)(NSString * _Nullable IPAddress, NSError * _Nullable error))handler;

/// 使得Wi-Fi模块恢复出厂设置
/// @param complete 完成回调
- (BOOL)restore:(void (^)(BOOL, NSError * _Nullable error))complete;

/// 使得Wi-Fi模块自主进行空中升级（模块通过网络自主下载固件并完成升级）
/// @param name 固件名
/// @param progress 升级进度百分比
/// @param complete 完成结果
- (void)otaWithName:(NSString *)name progress:(nullable void(^)(NSNumber *percent))progress complete:(nullable void(^)(BOOL isSuccess, NSError * _Nullable error))complete;

/// 使得Wi-Fi模块自主进行蓝牙配网，IPAddress为nil表示失败，返回值为NO表示暂时不能配网，可能正在连接或者参数错误
/// @param name 网络名称
/// @param pwd 密码
/// @param reconnect 是否重新连接，指的是如果已连接的，是否换网络连接
/// @param disconnect nil为配网成功后不断开连接，有回调会断开
/// @param handler 完成配网回调网络IP地址
- (BOOL)btConfigNetWithName:(NSString *)name password:(NSString *)pwd reconnect:(BOOL)reconnect disconnect:(nullable void(^)(void))disconnect completion:(void (^)(NSString * _Nullable IPAddress, NSError * _Nullable error))handler DEPRECATED_MSG_ATTRIBUTE("Please use -btConfigDynamicNetwork: or -btConfigStaticNetwork:");

/// 查询Wi-Fi模块中固件的版本号
/// @param handler 版本信息回调
- (BOOL)checkVersionWithHandler:(void (^)(NSString * _Nullable version))handler DEPRECATED_MSG_ATTRIBUTE("Please use super class's func -checkVersionComplete:");


- (void)btConfigMQTTWithBroker:(NSString *)broker port:(NSString *)port clientID:(NSString * _Nullable)clientID userName:(NSString *)username password:(NSString * _Nullable)password topic:(NSString * _Nullable)topic reconnect:(BOOL)reonnect completeBlock:(void (^)(NSString * _Nullable IPAddress, NSError * _Nullable error))completeBlock;

- (void)btConfigTCP:(NSString *)server port:(NSString *)port reconnect:(BOOL)reonnect completeBlock:(void (^)(NSString * _Nullable IPAddress, NSError * _Nullable error))completeBlock;

@end

NS_ASSUME_NONNULL_END
