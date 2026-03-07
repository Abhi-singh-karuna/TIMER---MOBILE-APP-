import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Platform,
    useWindowDimensions,
    ScrollView,
    TextInput,
    Modal,
    Pressable,
    StyleSheet as RNStyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants, { AppOwnership } from 'expo-constants';
import { MaterialIcons } from '@expo/vector-icons';
import { styles } from './styles';
import { WheelPicker } from '../../../components/WheelPicker';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
    configureGoogleSignIn,
    signInWithGoogle,
    signOutGoogle,
    getCurrentUser,
    backupToDrive,
    restoreFromDrive
} from '../../../services/GoogleDriveService';
import {
    AUTO_SYNC_FREQUENCY_KEY,
    AUTO_SYNC_TIME_KEY,
    LAST_SYNC_TIMESTAMP_KEY,
    AutoSyncFrequency
} from '../../../constants/data';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@react-native-google-signin/google-signin';

interface BackupScreenProps {
    onBack: () => void;
    isEmbedded?: boolean;
}

export default function BackupScreen({ onBack, isEmbedded }: BackupScreenProps) {
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [status, setStatus] = useState<string>('');
    const [autoSyncFrequency, setAutoSyncFrequency] = useState<AutoSyncFrequency>('Off');
    const [autoSyncTime, setAutoSyncTime] = useState('02:00');
    const [lastSyncDisplay, setLastSyncDisplay] = useState<string>('Never');
    const [pickerVisible, setPickerVisible] = useState(false);
    const [pickerHour, setPickerHour] = useState(2);
    const [pickerMinute, setPickerMinute] = useState(0);

    useEffect(() => {
        configureGoogleSignIn();
        const checkUserStatus = async () => {
            // Check if running in Expo Go
            if (Constants.appOwnership === AppOwnership.Expo) {
                setStatus('Google Sign-In is not supported in Expo Go. Please use a development build.');
                return;
            }

            const userInfo = await getCurrentUser();
            if (userInfo) {
                setUser(userInfo);
            }

            // Load auto-sync settings
            const [freq, time, last] = await Promise.all([
                AsyncStorage.getItem(AUTO_SYNC_FREQUENCY_KEY),
                AsyncStorage.getItem(AUTO_SYNC_TIME_KEY),
                AsyncStorage.getItem(LAST_SYNC_TIMESTAMP_KEY),
            ]);
            if (freq) setAutoSyncFrequency(freq as AutoSyncFrequency);
            if (time) setAutoSyncTime(time);
            if (last) setLastSyncDisplay(new Date(last).toLocaleString());
        };
        checkUserStatus();
    }, []);

    const updateAutoSyncFrequency = async (freq: AutoSyncFrequency) => {
        setAutoSyncFrequency(freq);
        await AsyncStorage.setItem(AUTO_SYNC_FREQUENCY_KEY, freq);
    };

    const updateAutoSyncTime = async (h: number, m: number) => {
        const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        setAutoSyncTime(time);
        await AsyncStorage.setItem(AUTO_SYNC_TIME_KEY, time);
        setPickerVisible(false);
    };

    const openTimePicker = () => {
        const [h, m] = autoSyncTime.split(':').map(Number);
        setPickerHour(h || 0);
        setPickerMinute(m || 0);
        setPickerVisible(true);
    };


    const handleSignIn = async () => {
        if (Constants.appOwnership === AppOwnership.Expo) {
            Alert.alert(
                'Not Supported in Expo Go',
                'Google Sign-In requires a native module that is not available in Expo Go. Please use a development build (npx expo run:ios or npx expo run:android).',
                [{ text: 'OK' }]
            );
            return;
        }

        setLoading(true);
        setStatus('Signing in...');
        try {
            const userInfo = await signInWithGoogle();
            if (userInfo) {
                setUser(userInfo);
                setStatus('Signed in successfully');
            } else {
                setStatus('Sign in cancelled');
            }
        } catch (error: unknown) {
            const err = error as Error;
            console.error(err);
            Alert.alert('Sign In Error', err.message);
            setStatus('Sign in failed');
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        Alert.alert(
            'Sign Out',
            'Are you sure you want to sign out? This will disable automatic backups until you sign in again.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await signOutGoogle();
                            setUser(null);
                            setStatus('Signed out');
                        } catch (error) {
                            console.error(error);
                        }
                    }
                }
            ]
        );
    };

    const handleBackup = async () => {
        Alert.alert(
            'Backup Data',
            'This will upload your current local data to Google Drive. It will overwrite any existing backup file on your Drive. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Backup Now',
                    onPress: async () => {
                        setLoading(true);
                        setStatus('Backing up data...');
                        try {
                            await backupToDrive();
                            const now = new Date().toISOString();
                            await AsyncStorage.setItem(LAST_SYNC_TIMESTAMP_KEY, now);
                            setLastSyncDisplay(new Date(now).toLocaleString());
                            Alert.alert('Success', 'Backup completed successfully! Your data is now safe in the cloud.');
                            setStatus('Completed at ' + new Date().toLocaleTimeString());
                        } catch (error: unknown) {
                            const err = error as Error;
                            console.error(err);
                            Alert.alert('Backup Error', err.message);
                            setStatus('Backup failed');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleRestore = async () => {
        Alert.alert(
            'Restore Data',
            'This will overwrite your current local data with the backup from Google Drive. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Restore',
                    onPress: async () => {
                        setLoading(true);
                        setStatus('Restoring data...');
                        try {
                            await restoreFromDrive();
                            const now = new Date().toISOString();
                            await AsyncStorage.setItem(LAST_SYNC_TIMESTAMP_KEY, now);
                            setLastSyncDisplay(new Date(now).toLocaleString());
                            Alert.alert('Success', 'Data restored successfully! Please restart the app or go back to refresh.');
                            setStatus('Restore completed');
                        } catch (error: unknown) {
                            const err = error as Error;
                            console.error(err);
                            Alert.alert('Restore Error', err.message);
                            setStatus('Restore failed');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleExportData = async () => {
        setLoading(true);
        setStatus('Preparing export data...');
        try {
            const keys = await AsyncStorage.getAllKeys();
            const pairs = await AsyncStorage.multiGet(keys);
            const allData: Record<string, any> = {};

            pairs.forEach(([key, value]) => {
                try {
                    allData[key] = value ? JSON.parse(value) : null;
                } catch {
                    allData[key] = value;
                }
            });

            const jsonString = JSON.stringify(allData, null, 2);
            const fileUri = FileSystem.cacheDirectory + 'timer_app_debug_export.json';

            await FileSystem.writeAsStringAsync(fileUri, jsonString);

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'application/json',
                    dialogTitle: 'Export Debug Data',
                });
                setStatus('Export completed');
            } else {
                Alert.alert('Error', 'Sharing is not available on this device');
                setStatus('Export failed');
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Export Error', 'Failed to gather and export data');
            setStatus('Export failed');
        } finally {
            setLoading(false);
        }
    };

    const renderButton = (label: string, icon: keyof typeof MaterialIcons.glyphMap, onPress: () => void, disabled = false, primary = false) => (
        <TouchableOpacity
            style={[
                styles.resetButton,
                { marginBottom: 12 },
                disabled && { opacity: 0.5 },
                primary && { backgroundColor: 'rgba(255, 255, 255, 0.15)', borderColor: 'rgba(255, 255, 255, 0.3)' }
            ]}
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.7}
        >
            <MaterialIcons name={icon} size={20} color="#FFFFFF" />
            <Text style={styles.resetButtonText}>{label}</Text>
        </TouchableOpacity>
    );

    const renderContent = () => (
        <ScrollView style={[!isEmbedded && styles.content, !isEmbedded && { padding: 24 }]} showsVerticalScrollIndicator={false}>
            {/* Status Card */}
            <View style={styles.settingsCardBezel}>
                <View style={styles.settingsCardTrackUnifiedLarge}>
                    <Text style={styles.sectionTitle}>STATUS</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <View style={[styles.dot, { backgroundColor: user ? '#4CAF50' : '#8E8E93', marginRight: 8 }]} />
                                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
                                    {user ? user.user?.email || 'Connected to Google Drive' : 'Not Signed In'}
                                </Text>
                            </View>
                            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                                Last Successful Sync: {lastSyncDisplay}
                            </Text>
                            {status ? (
                                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>{status}</Text>
                            ) : null}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {loading && (
                                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 12 }} />
                            )}
                            {user && (
                                <TouchableOpacity
                                    onPress={handleSignOut}
                                    style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 20,
                                        backgroundColor: 'rgba(255,50,50,0.15)',
                                        borderWidth: 1,
                                        borderColor: 'rgba(255,50,50,0.3)',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    activeOpacity={0.7}
                                    disabled={loading}
                                >
                                    <MaterialIcons name="logout" size={20} color="#FF5252" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </View>

            {/* Actions */}
            {!user && (
                <View style={styles.settingsCardBezel}>
                    <View style={styles.settingsCardTrackUnifiedLarge}>
                        <Text style={styles.sectionTitle}>GOOGLE ACCOUNT</Text>
                        {renderButton('Sign in with Google', 'login', handleSignIn, false, true)}
                    </View>
                </View>
            )}

            {user && (
                <>
                    <View style={styles.settingsCardBezel}>
                        <View style={styles.settingsCardTrackUnifiedLarge}>
                            <Text style={styles.sectionTitle}>AUTO BACKUP</Text>

                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                {(['Off', 'Daily', 'Weekly', 'Monthly'] as AutoSyncFrequency[]).map((freq) => (
                                    <TouchableOpacity
                                        key={freq}
                                        style={[
                                            { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
                                            autoSyncFrequency === freq
                                                ? { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: '#FFFFFF' }
                                                : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.2)' }
                                        ]}
                                        onPress={() => updateAutoSyncFrequency(freq)}
                                    >
                                        <Text style={{ color: autoSyncFrequency === freq ? '#FFFFFF' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700' }}>
                                            {freq.toUpperCase()}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {autoSyncFrequency !== 'Off' && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Backup Time</Text>
                                    <TouchableOpacity
                                        style={{
                                            backgroundColor: 'rgba(255,255,255,0.1)',
                                            paddingHorizontal: 16,
                                            paddingVertical: 10,
                                            borderRadius: 12,
                                            minWidth: 90,
                                            alignItems: 'center',
                                            borderWidth: 1,
                                            borderColor: 'rgba(255,255,255,0.15)'
                                        }}
                                        onPress={openTimePicker}
                                    >
                                        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>{autoSyncTime}</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            <Text style={[styles.sectionDescription, { marginTop: 12 }]}>
                                When enabled, the app will automatically perform a backup when opened if the scheduled time has passed.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.settingsCardBezel}>
                        <View style={styles.settingsCardTrackUnifiedLarge}>
                            <Text style={styles.sectionTitle}>MANUAL OPERATIONS</Text>
                            {renderButton('Backup Now', 'cloud-upload', handleBackup, loading)}
                            {renderButton('Restore Backup', 'cloud-download', handleRestore, loading)}
                            {renderButton('Export Debug Data (JSON)', 'file-download', handleExportData, loading)}

                            <Text style={[styles.sectionDescription, { marginTop: 8 }]}>
                                Backups are stored privately in your Google Drive App Data folder.
                            </Text>
                        </View>
                    </View>
                </>
            )}

            {loading && (
                <View style={{ marginTop: 20, alignItems: 'center', paddingBottom: 40 }}>
                    <ActivityIndicator size="large" color="#FFFFFF" />
                </View>
            )}

            <Modal
                visible={pickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setPickerVisible(false)}
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <Pressable style={modalStyles.overlay} onPress={() => setPickerVisible(false)}>
                        <Pressable style={modalStyles.card} onPress={(e) => e.stopPropagation()}>
                            <Text style={modalStyles.title}>BACKUP TIME</Text>
                            <Text style={modalStyles.subtitle}>Scheduled automatic backup hour</Text>
                            <View style={modalStyles.timeWheelRow}>
                                <View style={modalStyles.timeWheelGroup}>
                                    <WheelPicker data={Array.from({ length: 24 }, (_, i) => i)} value={pickerHour} onChange={setPickerHour} />
                                    <Text style={modalStyles.timeWheelLabel}>HH</Text>
                                </View>
                                <Text style={modalStyles.colon}>:</Text>
                                <View style={modalStyles.timeWheelGroup}>
                                    <WheelPicker data={Array.from({ length: 60 }, (_, i) => i)} value={pickerMinute} onChange={setPickerMinute} />
                                    <Text style={modalStyles.timeWheelLabel}>MM</Text>
                                </View>
                            </View>
                            <View style={modalStyles.timeModalActions}>
                                <TouchableOpacity style={modalStyles.actionBtn} onPress={() => setPickerVisible(false)} activeOpacity={0.75}>
                                    <Text style={modalStyles.actionBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={modalStyles.actionBtnPrimary} onPress={() => updateAutoSyncTime(pickerHour, pickerMinute)} activeOpacity={0.75}>
                                    <Text style={modalStyles.actionBtnTextPrimary}>Set Time</Text>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </Pressable>
                </GestureHandlerRootView>
            </Modal>
        </ScrollView>
    );

    if (isEmbedded) {
        return renderContent();
    }

    return (
        <View style={[styles.container, { backgroundColor: '#000000' }]}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right', 'bottom']}>
                {/* Header */}
                <View style={[styles.header, isLandscape && styles.headerLandscape]}>
                    <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
                        <MaterialIcons name="arrow-back-ios" size={20} color="rgba(255,255,255,0.7)" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>BACKUP & RESTORE</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {renderContent()}
            </SafeAreaView>
        </View>
    );
}

const modalStyles = RNStyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        width: '90%',
        maxWidth: 400,
        backgroundColor: '#0A0A0A',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    title: {
        textAlign: 'center',
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 2,
        color: '#FFFFFF',
        marginBottom: 6,
    },
    subtitle: {
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 20,
    },
    timeWheelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    timeWheelGroup: {
        alignItems: 'center',
    },
    timeWheelLabel: {
        marginTop: 10,
        fontSize: 11,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
    },
    colon: {
        fontSize: 32,
        color: 'rgba(255, 255, 255, 0.45)',
        marginHorizontal: 12,
        marginBottom: 30,
    },
    timeModalActions: {
        flexDirection: 'row',
        gap: 16,
        justifyContent: 'space-between',
    },
    actionBtn: {
        flex: 1,
        height: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    actionBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    actionBtnPrimary: {
        flex: 1,
        height: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
    },
    actionBtnTextPrimary: {
        color: '#000000',
        fontSize: 14,
        fontWeight: '800',
    },
});
