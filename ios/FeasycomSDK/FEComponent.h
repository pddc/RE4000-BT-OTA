//
//  FEComponent.h
//  FEBluetoothSDK
//
//  Created by ericj on 2020/5/22.
//  Copyright © 2020 Feasycom. All rights reserved.
//

#import <Foundation/Foundation.h>


NS_ASSUME_NONNULL_BEGIN

@interface FEComponent : NSObject

/// mac地址格式化
/// @"DC0D30001FAA" -> @"DC:0D:30:00:1F:AA"
/// @param data mac的data数据（默认UTF8编码）
+ (NSString *)macOfData:(NSData *)data;

/// 数据分包
/// @param data 待分包的数据
/// @param length 每包长度
+ (NSMutableArray *)subcontractData:(NSData *)data eachLength:(NSInteger)length;

/// 根据开始时间计算过去了多长时间，字符串（时间格式：hh：mm：ss）
/// @param timeInterval 开始的时间戳
/// 结束的时间戳 为 当前时间
+ (NSString *)timeIntervalToNow:(NSTimeInterval)timeInterval;

/// 将间隔时间（秒）转换为字符串（时间格式：hh：mm：ss）
/// 2000 - 1000 = 1000 -> @"00:16:40"
/// @param startTimeInterval 开始的时间戳
/// @param endTimeImterval 结束的时间戳
+ (NSString *)timeIntervalWith:(NSTimeInterval)startTimeInterval to:(NSTimeInterval)endTimeImterval;

@end

NS_ASSUME_NONNULL_END
