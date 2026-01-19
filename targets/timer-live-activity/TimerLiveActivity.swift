import ActivityKit
import SwiftUI
import WidgetKit

struct TimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TimerAttributes.self) { context in
            // ==========================================
            // LOCK SCREEN UI
            // ==========================================
            LockScreenView(context: context)
        } dynamicIsland: { context in
            // ==========================================
            // DYNAMIC ISLAND
            // ==========================================
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    DynamicIslandLeadingView(context: context)
                }
                
                DynamicIslandExpandedRegion(.trailing) {
                    DynamicIslandTrailingView(context: context)
                }
                
                DynamicIslandExpandedRegion(.bottom) {
                    DynamicIslandBottomView(context: context)
                }
                
            } compactLeading: {
                CompactLeadingView(context: context)
                
            } compactTrailing: {
                CompactTrailingView(context: context)
                
            } minimal: {
                MinimalView(context: context)
            }
        }
    }
}

// MARK: - Helper function
private func isTimerCompleted(status: String, endTime: Date) -> Bool {
    return status == "Completed" || (status == "Running" && endTime < Date())
}

// MARK: - Dynamic Island Components

struct DynamicIslandLeadingView: View {
    let context: ActivityViewContext<TimerAttributes>
    
    var isTimerDone: Bool {
        isTimerCompleted(status: context.state.status, endTime: context.state.endTime)
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(isTimerDone ? "COMPLETED" : context.state.status.uppercased())
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(isTimerDone ? .green : .cyan)
            
            Text(context.state.timerName)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
        }
    }
}

struct DynamicIslandTrailingView: View {
    let context: ActivityViewContext<TimerAttributes>
    
    var isTimerDone: Bool {
        isTimerCompleted(status: context.state.status, endTime: context.state.endTime)
    }
    
    var body: some View {
        HStack(spacing: 12) {
            if isTimerDone {
                Text("Done!")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundColor(.green)
            } else if context.state.status == "Running" {
                Text(context.state.endTime, style: .timer)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(.white)
            } else {
                Text("||")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(.orange)
            }
            
            ZStack {
                Circle()
                    .fill(Color.white.opacity(0.1))
                    .frame(width: 36, height: 36)
                
                Image(systemName: isTimerDone ? "checkmark" : (context.state.status == "Running" ? "pause.fill" : "play.fill"))
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(isTimerDone ? .green : .white)
            }
        }
    }
}

struct DynamicIslandBottomView: View {
    let context: ActivityViewContext<TimerAttributes>
    
    var isTimerDone: Bool {
        isTimerCompleted(status: context.state.status, endTime: context.state.endTime)
    }
    
    var body: some View {
        if isTimerDone {
            Color.clear.frame(height: 0)
        } else {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.white.opacity(0.1))
                    
                    RoundedRectangle(cornerRadius: 3)
                        .fill(
                            LinearGradient(
                                colors: [.cyan, .blue],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geometry.size.width * CGFloat(context.state.progress / 100.0))
                }
            }
            .frame(height: 4)
            .padding(.top, 8)
        }
    }
}

struct CompactLeadingView: View {
    let context: ActivityViewContext<TimerAttributes>
    
    var isTimerDone: Bool {
        isTimerCompleted(status: context.state.status, endTime: context.state.endTime)
    }
    
    var body: some View {
        Image(systemName: isTimerDone ? "checkmark.circle.fill" : (context.state.status == "Running" ? "timer" : "pause.fill"))
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(isTimerDone ? .green : .cyan)
    }
}

struct CompactTrailingView: View {
    let context: ActivityViewContext<TimerAttributes>
    
    var isTimerDone: Bool {
        isTimerCompleted(status: context.state.status, endTime: context.state.endTime)
    }
    
    var body: some View {
        if isTimerDone {
            Text("Done")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.green)
        } else if context.state.status == "Running" {
            Text(context.state.endTime, style: .timer)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundColor(.cyan)
                .frame(minWidth: 50)
        } else {
            Text("||")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.orange)
        }
    }
}

struct MinimalView: View {
    let context: ActivityViewContext<TimerAttributes>
    
    var isTimerDone: Bool {
        isTimerCompleted(status: context.state.status, endTime: context.state.endTime)
    }
    
    var body: some View {
        Image(systemName: isTimerDone ? "checkmark.circle.fill" : (context.state.status == "Running" ? "timer" : "pause.fill"))
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(isTimerDone ? .green : .cyan)
    }
}

// MARK: - Lock Screen View

struct LockScreenView: View {
    let context: ActivityViewContext<TimerAttributes>
    
    var isCompleted: Bool {
        isTimerCompleted(status: context.state.status, endTime: context.state.endTime)
    }
    
    var accentColor: Color {
        if isCompleted {
            return .green
        }
        switch context.state.status {
        case "Running": return .cyan
        case "Paused": return .orange
        default: return .cyan
        }
    }
    
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 24)
                .fill(isCompleted ? Color.black : Color(red: 0.05, green: 0.08, blue: 0.12))
                .overlay(
                    RoundedRectangle(cornerRadius: 24)
                        .stroke(
                            LinearGradient(
                                colors: isCompleted
                                    ? [Color.green.opacity(0.5), Color.green.opacity(0.2)]
                                    : [accentColor.opacity(0.4), accentColor.opacity(0.1)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1.5
                        )
                )
            
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(isCompleted ? "COMPLETED" : context.state.status.uppercased())
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(isCompleted ? .black : accentColor)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(
                            Capsule()
                                .fill(isCompleted ? Color.green : accentColor.opacity(0.15))
                        )
                        .overlay(
                            Capsule()
                                .stroke(isCompleted ? Color.green : accentColor.opacity(0.3), lineWidth: 1)
                        )
                    
                    Text(context.state.timerName)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                    
                    if isCompleted {
                        Text("Timer Complete! 🎉")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.green)
                    } else if context.state.status == "Running" {
                        Text(context.state.endTime, style: .timer)
                            .font(.system(size: 42, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .monospacedDigit()
                    } else {
                        Text("PAUSED")
                            .font(.system(size: 36, weight: .bold, design: .rounded))
                            .foregroundColor(.white.opacity(0.6))
                    }
                }
                
                Spacer()
                
                ZStack {
                    Circle()
                        .fill(isCompleted ? Color.green.opacity(0.2) : Color.white.opacity(0.08))
                        .frame(width: 60, height: 60)
                    
                    Circle()
                        .stroke(isCompleted ? Color.green.opacity(0.5) : Color.white.opacity(0.2), lineWidth: 2)
                        .frame(width: 60, height: 60)
                    
                    Image(systemName: isCompleted ? "checkmark" : (context.state.status == "Running" ? "pause.fill" : "play.fill"))
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(isCompleted ? .green : .white)
                }
            }
            .padding(20)
        }
    }
}
