import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

/**
 * Request notification permissions from the user
 * Should be called on app start
 */
export async function requestNotificationPermissions(): Promise<boolean> {
    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('Notification permissions not granted');
            return false;
        }

        // Android-specific channel setup
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('timer-completion', {
                name: 'Timer Completion',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#00E5FF',
                sound: 'default',
            });
        }

        return true;
    } catch (error) {
        console.error('Error requesting notification permissions:', error);
        return false;
    }
}

/**
 * Schedule a notification for when the timer completes
 * @param timerId - Unique timer ID
 * @param secondsRemaining - Seconds until timer completes
 * @param timerName - Name of the timer for the notification
 * @returns The notification ID (for cancellation)
 */
export async function scheduleTimerNotification(
    timerId: number,
    secondsRemaining: number,
    timerName: string
): Promise<string | null> {
    try {
        // Cancel any existing notification for this timer
        await cancelTimerNotification(timerId.toString());

        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: '⏰ Timer Complete!',
                body: `"${timerName}" has finished`,
                sound: true,
                priority: Notifications.AndroidNotificationPriority.HIGH,
                data: { timerId },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: Math.max(1, secondsRemaining),
            },
        });

        console.log(`Scheduled notification ${notificationId} for timer ${timerId} in ${secondsRemaining}s`);
        return notificationId;
    } catch (error) {
        console.error('Error scheduling notification:', error);
        return null;
    }
}

/**
 * Cancel a scheduled notification for a timer
 * @param notificationId - The notification ID to cancel
 */
export async function cancelTimerNotification(notificationId: string | undefined): Promise<void> {
    if (!notificationId) return;

    try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
        console.log(`Cancelled notification ${notificationId}`);
    } catch (error) {
        console.error('Error cancelling notification:', error);
    }
}

/**
 * Cancel all timer notifications
 */
export async function cancelAllTimerNotifications(): Promise<void> {
    try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        console.log('Cancelled all scheduled notifications');
    } catch (error) {
        console.error('Error cancelling all notifications:', error);
    }
}

/**
 * Calculate remaining time based on when the timer started
 * Used when returning from background to get accurate remaining time
 * @param startedTimestamp - Unix timestamp when timer started running
 * @param originalRemainingSeconds - Seconds remaining when timer started
 * @returns Current seconds remaining (or 0 if completed)
 */
export function calculateRemainingTime(
    startedTimestamp: number,
    originalRemainingSeconds: number
): number {
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - startedTimestamp) / 1000);
    const remaining = originalRemainingSeconds - elapsedSeconds;
    return Math.max(0, remaining);
}

/**
 * Convert time string (HH:MM:SS) to seconds
 */
export function timeToSeconds(time: string): number {
    const parts = time.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parts[0] * 60 + parts[1];
}

/**
 * Convert seconds to time string (HH:MM:SS)
 */
export function secondsToTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
