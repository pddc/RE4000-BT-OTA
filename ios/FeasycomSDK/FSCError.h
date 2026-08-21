//
//  FSCError.h
//  FeasyWIFI
//
//  Created by chenchanghua on 2021/12/29.
//  Copyright © 2021 Feasycom. All rights reserved.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface FSCError : NSObject

extern NSString * const FSCCommomErrorDomain;
typedef NS_ENUM(NSUInteger, FSCCommomError){
    
    FSCCommomError_BTConnecteLack     = 4001,    // 缺少必要的蓝牙连接
    
    FSCCommomError_ParameterLack      = 5001,    // 缺少必要的参数
    FSCCommomError_NetworkLack        = 5002,    // 缺少必要的网络前提
    
    FSCCommomError_BTSendDataTimeoout = 6001,    // 发送数据超时
    
    FSCCommomError_ATExcutionFailed   = 7001,    // AT指令执行失败
};


@end

NS_ASSUME_NONNULL_END
