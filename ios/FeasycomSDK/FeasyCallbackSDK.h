//
//  FeasyCallbackSDK.h
//  FeasyCallbackSDK
//
//  Created by ericj on 2020/6/3.
//  Copyright © 2020 feasycom. All rights reserved.
//

#pragma mark 版本 1.1（新增联系方式）

#import <Foundation/Foundation.h>

typedef NS_ENUM(NSInteger, FEEDBACKTYPE) {
    FEEDBACKTYPE_ADVICE,        // 建议
    FEEDBACKTYPE_BUG,           // 功能异常
    FEEDBACKTYPE_UI,            // 界面异常
    FEEDBACKTYPE_COOPERATION,   // 合作
};

@interface FeasyCallbackSDK : NSObject

/**
 * 用户反馈
 * @param content 反馈内容
 * @param feedbackType 反馈类型
 * @param complete 完成回调
 */

/// 用户反馈
/// @param content 反馈内容
/// @param feedbackType 反馈类型
/// @param contact 联系方式（手机号或邮箱）
/// @param complete 完成回调
+ (NSURLSessionDataTask *)feedback:(NSString *)content feedbackType:(FEEDBACKTYPE)feedbackType contact:(NSString *)contact complete:(void (^)(NSData *data, NSURLResponse *response, NSError *error))complete;

@end
