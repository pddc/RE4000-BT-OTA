//
//  FEOTA.h
//  FEBluetoothSDK
//
//  Created by ericj on 2020/7/15.
//  Copyright © 2020 Feasycom. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "FEBluetoothSDK.h"

NS_ASSUME_NONNULL_BEGIN

@interface FEOTA : NSObject
@property (nonatomic, assign) BOOL isShowLog;

/// 初始化
/// @param peripheral 待升级设备
- (instancetype)initWithPeripheral:(FEPeripheral *)peripheral;

/// 解析升级文件信息
/// @param data 文件数据
/// @param complete 完成回调
/// @param faile 失败回调
- (void)infoFromData:(NSData *)data complete:(void(^)(NSString *bootloader, NSString *binCrc, NSInteger length, NSString *versionRange, NSString * _Nullable modelType, NSInteger modelTypeNum, NSString *uploadModel, NSString *crc))complete faile:(void(^)(void))faile;

- (void)infoFromData:(NSData *)data complete:(void(^)(NSString *bootloader, NSString *binCrc, NSInteger length, NSString *versionRange, NSString * _Nullable modelType, NSInteger modelTypeNum, NSString *uploadModel, NSString *crc))complete faile:(nonnull void (^)(void))faile option:(void(^)(NSString *bootloader, NSString *binCrc, NSInteger length, NSString *versionRange, NSString * _Nullable modelType, NSInteger modelTypeNum, NSString *uploadModel, NSString *crc))option;

/// 开始升级
/// @param progress 进度
/// @param transferDidFinish 升级完成
/// @param abort 升级取消
/// @param timeout 升级超时
- (void)startProgress:(void(^)(float progress, NSInteger length, NSInteger finishLength))progress finish:(void(^)(void))transferDidFinish abort:(void(^)(void))abort timeout:(void(^)(void))timeout;

#pragma mark- 以下可忽略

/// 进入升级模式
/// @param isFactory 是否设置出厂设置
+ (void)enterDFUWithFactory:(BOOL)isFactory peripheral:(FEPeripheral *)peripheral writeWithRespond:(BOOL)writeWithRespond complete:(void(^)(BOOL isSuccess, NSString * _Nullable appVersion, NSString * _Nullable firmwareVersion, NSString * _Nullable module))complete;
- (instancetype)init NS_UNAVAILABLE;
@end

NS_ASSUME_NONNULL_END
