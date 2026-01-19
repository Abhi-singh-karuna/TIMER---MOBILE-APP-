#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TimerModule, NSObject)

RCT_EXTERN_METHOD(startActivity:(NSString *)name
                  timerName:(NSString *)timerName
                  endTime:(double)endTime
                  progress:(double)progress)

RCT_EXTERN_METHOD(updateActivity:(NSString *)status
                  progress:(double)progress
                  endTime:(double)endTime)

RCT_EXTERN_METHOD(stopActivity)

@end
