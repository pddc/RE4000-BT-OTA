//
//  FEBluetoothSetting.h
//  FEBluetoothSDK
//
//  Created by ericj on 2020/7/1.
//  Copyright © 2020 Feasycom. All rights reserved.
//

//////////////////////////////////////////////////////////////////////////////////////////////////
/// 备注：修改的返回值为是否已发送，返回NO表示没有发送服务
//////////////////////////////////////////////////////////////////////////////////////////////////


#import <Foundation/Foundation.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import "FEPeripheral.h"

NS_ASSUME_NONNULL_BEGIN

typedef void(^CompleteBlock)(NSString * _Nullable key, NSString * _Nullable value, NSError * _Nullable error);

@interface FEBluetoothSetting : NSObject

@property (nonatomic, strong) FEPeripheral *peripheral;
/// 是否显示调试信息
@property (nonatomic) BOOL isShowLog;

- (instancetype)initWithPeripheral:(FEPeripheral *)peripheral;

/// 打开指令模式（修改设备信息前需先打开指令模式）
- (BOOL)openFscAtEngineComplete:(void(^ _Nullable)(BOOL isSuccess))complete;

/// 查询
/// @param instruct 指令
/// @param complete 完成回调isCheck
- (BOOL)check:(NSString *)instruct complete:(CompleteBlock)complete;
- (BOOL)checkVersionComplete:(CompleteBlock)complete;
- (BOOL)checkNameComplete:(CompleteBlock)complete;
- (BOOL)checkBaudComplete:(CompleteBlock)complete;
- (BOOL)checkPinComplete:(CompleteBlock)complete;

/// 修改
/// @param instruct 指令
/// @param value 值
/// @param complete 完成回调
- (BOOL)change:(NSString *)instruct value:(NSString *)value complete:(CompleteBlock)complete;
- (BOOL)changeName:(NSString *)value complete:(CompleteBlock)complete;
- (BOOL)changeBaud:(NSString *)value complete:(CompleteBlock)complete;
- (BOOL)changePin:(NSString *)value complete:(CompleteBlock)complete;

/// 发送其他指令
/// @param instruction 指令
/// @param complete 完成回调
- (BOOL)send:(NSString *)instruction complete:(CompleteBlock)complete;

@end

NS_ASSUME_NONNULL_END
