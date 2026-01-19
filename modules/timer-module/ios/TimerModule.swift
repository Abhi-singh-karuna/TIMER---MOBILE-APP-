import Foundation
import ActivityKit
import React

@objc(TimerModule)
class TimerModule: NSObject {
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc(startActivity:timerName:endTime:progress:)
  func startActivity(name: String, timerName: String, endTime: Double, progress: Double) {
    if #available(iOS 16.2, *) {
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      
      let attributes = TimerAttributes(name: name)
      let state = TimerAttributes.ContentState(
        endTime: Date(timeIntervalSince1970: endTime),
        progress: progress,
        status: "Running",
        timerName: timerName
      )
      
      do {
        _ = try Activity.request(
          attributes: attributes,
          content: .init(state: state, staleDate: nil),
          pushType: nil
        )
      } catch {
        print("Error starting activity: \(error.localizedDescription)")
      }
    }
  }

  @objc(updateActivity:progress:endTime:)
  func updateActivity(status: String, progress: Double, endTime: Double) {
    if #available(iOS 16.2, *) {
      Task {
        let updatedState = TimerAttributes.ContentState(
          endTime: Date(timeIntervalSince1970: endTime),
          progress: progress,
          status: status,
          timerName: ""
        )
        
        for activity in Activity<TimerAttributes>.activities {
          await activity.update(using: updatedState)
        }
      }
    }
  }

  @objc
  func stopActivity() {
    if #available(iOS 16.2, *) {
      Task {
        for activity in Activity<TimerAttributes>.activities {
          await activity.end(dismissalPolicy: .immediate)
        }
      }
    }
  }
}

