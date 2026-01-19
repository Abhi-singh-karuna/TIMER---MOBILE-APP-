import ActivityKit
import Foundation

struct TimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic state fulfillment
        var endTime: Date
        var progress: Double
        var status: String // "Running", "Paused", "Completed"
        var timerName: String
    }

    // Fixed non-changing properties
    var name: String
}
