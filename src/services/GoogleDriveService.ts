import type { User, SignInResponse } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { AppOwnership } from 'expo-constants';

import {
    AUTO_SYNC_FREQUENCY_KEY,
    AUTO_SYNC_TIME_KEY,
    LAST_SYNC_TIMESTAMP_KEY,
    AutoSyncFrequency
} from '../constants/data';

// Safety wrapper for GoogleSignin to prevent crashes in Expo Go
const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

let GoogleSignin: any = null;
let statusCodes: any = {};

if (!isExpoGo) {
    const GoogleSigninModule = require('@react-native-google-signin/google-signin');
    GoogleSignin = GoogleSigninModule.GoogleSignin;
    statusCodes = GoogleSigninModule.statusCodes;
} else {
    // Mock for Expo Go to prevent "undefined" errors
    GoogleSignin = new Proxy({}, {
        get: () => () => {
            throw new Error('Google Sign-In is not supported in Expo Go. Please use a development build.');
        }
    });
}

interface BackupData {
    [key: string]: string | null;
}

// Replace with your actual iOS Client ID from Google Cloud Console
const IOS_CLIENT_ID = '833418074077-o7r6osq6t8h56dcqkeuoau36rf4i8h4k.apps.googleusercontent.com';

const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
const BACKUP_FILE_NAME = 'chronoscope_backup.json';

// list of all storage keys to backup
const STORAGE_KEYS = [
    '@timers',
    '@timer_app_tasks',
    '@timer_filler_color',
    '@timer_slider_button_color',
    '@timer_text_color',
    '@timer_active_preset_index',
    '@timer_completion_sound',
    '@timer_sound_repetition',
    '@timer_enable_future',
    '@timer_is_past_disabled',
    '@task_is_past_disabled',
    '@timer_quick_messages',
    '@timer_categories',
    '@timer_leave_days',
    '@timer_app_daily_start_minutes',
    '@timer_app_time_of_day_slots_v1',
    '@timer_app_day_notes_v1',
    '@timer_app_landscape_color',
    '@timer_active_id',
];

export const configureGoogleSignIn = () => {
    GoogleSignin.configure({
        scopes: SCOPES,
        iosClientId: IOS_CLIENT_ID,
    });
};

export const signInWithGoogle = async (): Promise<User | null> => {
    try {
        await GoogleSignin.hasPlayServices();
        const response: SignInResponse = await GoogleSignin.signIn();

        if (response.type === 'success') {
            return response.data;
        } else {
            // Handle cancelled or other non-success types if needed
            return null;
        }
    } catch (error: unknown) {
        const err = error as { code?: string };
        if (err.code === statusCodes.SIGN_IN_CANCELLED) {
            return null; // Silent return for cancel
        } else if (err.code === statusCodes.IN_PROGRESS) {
            throw new Error('Sign in in progress');
        } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            throw new Error('Play services not available');
        } else {
            throw error;
        }
    }
};

export const signOutGoogle = async () => {
    try {
        await GoogleSignin.signOut();
    } catch (error) {
        console.error('Sign out error:', error);
    }
};

export const getCurrentUser = async (): Promise<User | null> => {
    try {
        const response: SignInResponse = await GoogleSignin.signInSilently();
        if (response.type === 'success') {
            return response.data;
        }
        return null;
    } catch (error) {
        return null;
    }
};

export const isSignedIn = async () => {
    return await GoogleSignin.isSignedIn();
};

export const getAccessToken = async () => {
    try {
        const { accessToken } = await GoogleSignin.getTokens();
        return accessToken;
    } catch (error) {
        console.error('Failed to get access token:', error);
        return null;
    }
};

/**
 * Backup all app data to Google Drive appDataFolder
 */
export const backupToDrive = async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Not signed in');

    // 1. Collect all data
    const allData: BackupData = {};
    const pairs = await AsyncStorage.multiGet(STORAGE_KEYS);
    console.log('Collecting data for backup, keys found:', pairs.filter(p => p[1] !== null).map(p => p[0]));

    pairs.forEach(([key, value]) => {
        allData[key] = value;
    });

    const body = JSON.stringify(allData);

    // 2. Check if file already exists
    const listResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILE_NAME}' and parents in 'appDataFolder'&spaces=appDataFolder`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    );
    const listData = await listResponse.json();
    const existingFile = listData.files && listData.files[0];

    // 3. Upload (Create or Update)
    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';

    if (existingFile) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`;
        method = 'PATCH';
    }

    const boundary = 'foo_bar_baz';
    const metadata = JSON.stringify({
        name: BACKUP_FILE_NAME,
        parents: existingFile ? undefined : ['appDataFolder'],
    });

    const multipartBody =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n` +
        `--${boundary}--`;

    const uploadResponse = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
    });

    if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(`Upload failed: ${errorData.error?.message || 'Unknown error'}`);
    }

    return await uploadResponse.json();
};

/**
 * Restore all app data from Google Drive appDataFolder
 */
export const restoreFromDrive = async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Not signed in');

    // 1. Find the file
    const listResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILE_NAME}' and parents in 'appDataFolder'&spaces=appDataFolder`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    );
    const listData = await listResponse.json();
    const existingFile = listData.files && listData.files[0];

    if (!existingFile) {
        throw new Error('No backup file found on Google Drive');
    }

    // 2. Download the file content
    const downloadResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    );

    if (!downloadResponse.ok) {
        throw new Error('Failed to download backup file');
    }

    const data: BackupData = await downloadResponse.json();

    // 3. Restore to AsyncStorage
    const pairs: [string, string][] = [];
    Object.entries(data).forEach(([key, value]) => {
        if (value !== null) {
            pairs.push([key, value]);
        }
    });

    if (pairs.length > 0) {
        await AsyncStorage.multiSet(pairs);
    }

    return true;
};

/**
 * Checks if an auto-sync is required based on settings and performs it if needed.
 */
export const checkAndPerformAutoSync = async () => {
    try {
        const [frequency, timeStr, lastSyncStr] = await Promise.all([
            AsyncStorage.getItem(AUTO_SYNC_FREQUENCY_KEY),
            AsyncStorage.getItem(AUTO_SYNC_TIME_KEY),
            AsyncStorage.getItem(LAST_SYNC_TIMESTAMP_KEY),
        ]);

        const typedFrequency = (frequency as AutoSyncFrequency) || 'Off';
        if (typedFrequency === 'Off') return;

        const targetTime = timeStr || '02:00';
        const lastSync = lastSyncStr ? new Date(lastSyncStr) : new Date(0);
        const now = new Date();

        // Check if we already synced today
        const todayAtTargetTime = new Date(now);
        const [targetHours, targetMins] = targetTime.split(':').map(Number);
        todayAtTargetTime.setHours(targetHours, targetMins, 0, 0);

        // If it's before the target time today, we should check against yesterday's target
        if (now < todayAtTargetTime) {
            todayAtTargetTime.setDate(todayAtTargetTime.getDate() - 1);
        }

        // Has it been overdue?
        let isDue = false;
        if (typedFrequency === 'Daily') {
            isDue = lastSync < todayAtTargetTime;
        } else if (typedFrequency === 'Weekly') {
            const daysSinceLast = (now.getTime() - lastSync.getTime()) / (1000 * 3600 * 24);
            isDue = daysSinceLast >= 7 && now >= todayAtTargetTime;
        } else if (typedFrequency === 'Monthly') {
            const monthsSinceLast = (now.getFullYear() - lastSync.getFullYear()) * 12 + (now.getMonth() - lastSync.getMonth());
            isDue = monthsSinceLast >= 1 && now >= todayAtTargetTime;
        }

        if (isDue) {
            console.log(`Auto-sync starting (Frequency: ${typedFrequency}, Overdue since: ${todayAtTargetTime.toLocaleString()})`);
            await backupToDrive();
            const timestamp = new Date().toISOString();
            await AsyncStorage.setItem(LAST_SYNC_TIMESTAMP_KEY, timestamp);
            console.log('Auto-sync completed at', timestamp);
        }
    } catch (error) {
        console.error('Auto-sync check failed:', error);
    }
};
