import { Platform } from 'react-native';
import TimerModule from '../../modules/timer-module';
import { Timer } from '../constants/data';

// Helper to convert HH:MM:SS or MM:SS to total seconds
const timeToSeconds = (time: string): number => {
    const parts = time.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parts[0] * 60 + parts[1];
};

const calculateProgress = (timer: Timer): number => {
    const currentRemainingSeconds = timeToSeconds(timer.time);
    const originalTotalSeconds = timeToSeconds(timer.total);
    const borrowedSeconds = timer.borrowedTime || 0;
    const totalAllocatedSeconds = originalTotalSeconds + borrowedSeconds;

    if (totalAllocatedSeconds <= 0) return 100;

    const elapsed = totalAllocatedSeconds - currentRemainingSeconds;
    return Math.min(100, Math.max(0, Math.round((elapsed / totalAllocatedSeconds) * 100)));
};

export const startLiveActivity = (timer: Timer) => {
    console.log('[LiveActivity] startLiveActivity called for:', timer.title);
    if (Platform.OS !== 'ios') {
        console.log('[LiveActivity] Platform is not iOS, skipping.');
        return;
    }
    if (!TimerModule) {
        console.log('[LiveActivity] TimerModule is MISSING (likely Expo Go). Skipping.');
        return;
    }

    // Stop any existing Live Activity first to prevent duplicates
    console.log('[LiveActivity] Stopping any existing activity before starting new one');
    TimerModule.stopActivity();

    const currentSeconds = timeToSeconds(timer.time);
    const endTime = Date.now() / 1000 + currentSeconds;
    const progress = calculateProgress(timer);

    console.log('[LiveActivity] Calling native startActivity', { timerName: timer.title, endTime, progress });
    TimerModule.startActivity(
        timer.id.toString(),
        timer.title,
        endTime,
        progress
    );
};

export const updateLiveActivity = (timer: Timer) => {
    console.log('[LiveActivity] updateLiveActivity called for:', timer.title, 'Status:', timer.status);
    if (Platform.OS !== 'ios' || !TimerModule) return;

    const currentSeconds = timeToSeconds(timer.time);
    const endTime = Date.now() / 1000 + currentSeconds;
    const progress = calculateProgress(timer);
    const status = timer.status;

    console.log('[LiveActivity] Calling native updateActivity', { status, progress, endTime });
    TimerModule.updateActivity(status, progress, endTime);
};

export const stopLiveActivity = () => {
    console.log('[LiveActivity] stopLiveActivity called');
    if (Platform.OS !== 'ios' || !TimerModule) return;
    TimerModule.stopActivity();
};
