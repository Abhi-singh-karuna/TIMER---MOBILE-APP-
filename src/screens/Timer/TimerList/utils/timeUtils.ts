// Helper function to parse time string (HH:MM:SS or MM:SS) to seconds
export const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
        // HH:MM:SS format
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    // MM:SS format (backwards compatibility)
    return parts[0] * 60 + parts[1];
};

// Calculate completion percentage with borrowed time awareness
export const getCompletionPercentage = (currentTime: string, totalTime: string, borrowedSeconds: number = 0): number => {
    const current = parseTimeToSeconds(currentTime);
    const originalTotal = parseTimeToSeconds(totalTime);
    const total = originalTotal + borrowedSeconds;
    if (total === 0) return 0;
    const elapsed = total - current;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
};

// Format seconds to HH:MM:SS
export const formatTotalTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Format borrowed time for display (e.g. +30 min or 1 hr 20 min)
export const formatBorrowedTime = (seconds: number): string => {
    if (seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
        return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
    }
    return `+${m} min`;
};

// Format saved time (e.g. Saved 2 min or Saved 1 hr)
export const formatSavedTime = (seconds: number): string => {
    if (seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
        return m > 0 ? `Saved ${h}h ${m}m` : `Saved ${h}h`;
    }
    return `Saved ${m} min`;
};

// Format as 00:00:00 with borrowed time included
export const getExpandedTotal = (total: string, borrowedSecs: number): string => {
    const originalSecs = parseTimeToSeconds(total);
    return formatTotalTime(originalSecs + borrowedSecs);
};

// Date constants
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format date to YYYY-MM-DD string
export const formatDate = (date: Date): string => {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
};

// Format ISO string to time (HH:MM)
export const formatISOToTime = (isoString?: string): string => {
    if (!isoString || isoString === '--:--') return '--:--';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (e) {
        return isoString;
    }
};
