import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    Modal,
    Pressable,
    StyleSheet as RNStyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import Constants, { AppOwnership } from 'expo-constants';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { styles } from './styles';
import { WheelPicker } from '../../../components/WheelPicker';
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
import { DataManagementSectionProps } from './types';

export default function DataManagementSection({
    isLandscape,
    onClearTime,
    onClearTask,
    onClearAllData,
}: DataManagementSectionProps) {
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
            if (Constants.appOwnership === AppOwnership.Expo) {
                setStatus('Cloud Sync is not supported in Expo Go.');
                return;
            }

            const userInfo = await getCurrentUser();
            if (userInfo) setUser(userInfo);

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
            Alert.alert('Not Supported', 'Cloud Sync requires a native builds.');
            return;
        }
        setLoading(true);
        try {
            const userInfo = await signInWithGoogle();
            if (userInfo) {
                setUser(userInfo);
                setStatus('Signed in successfully');
            }
        } catch (error: any) {
            Alert.alert('Sign In Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        Alert.alert('Sign Out', 'Disable automatic cloud backups?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign Out',
                style: 'destructive',
                onPress: async () => {
                    await signOutGoogle();
                    setUser(null);
                    setStatus('Signed out');
                }
            }
        ]);
    };

    const handleBackup = async () => {
        Alert.alert('Cloud Backup', 'Overwrite existing cloud data with local data?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Backup Now',
                onPress: async () => {
                    setLoading(true);
                    try {
                        await backupToDrive();
                        const now = new Date().toISOString();
                        await AsyncStorage.setItem(LAST_SYNC_TIMESTAMP_KEY, now);
                        setLastSyncDisplay(new Date(now).toLocaleString());
                        Alert.alert('Success', 'Cloud backup complete!');
                    } catch (error: any) {
                        Alert.alert('Backup Error', error.message);
                    } finally {
                        setLoading(false);
                    }
                }
            }
        ]);
    };

    const handleRestore = async () => {
        Alert.alert('Cloud Restore', 'Overwrite local data with cloud backup?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Restore Now',
                onPress: async () => {
                    setLoading(true);
                    try {
                        await restoreFromDrive();
                        Alert.alert('Success', 'Data restored! Please go back to refresh.');
                    } catch (error: any) {
                        Alert.alert('Restore Error', error.message);
                    } finally {
                        setLoading(false);
                    }
                }
            }
        ]);
    };

    const handleExport = async () => {
        setLoading(true);
        try {
            const keys = await AsyncStorage.getAllKeys();
            const pairs = await AsyncStorage.multiGet(keys);
            const allData = Object.fromEntries(pairs);
            const fileUri = FileSystem.cacheDirectory + 'timer_app_data_export.json';
            await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(allData, null, 2));
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri);
            }
        } catch (error) {
            Alert.alert('Export Error', 'Failed to export data');
        } finally {
            setLoading(false);
        }
    };

    const renderActionBtn = (label: string, icon: keyof typeof MaterialIcons.glyphMap, onPress: () => void, color = '#fff', desc?: string) => (
        <TouchableOpacity style={localStyles.actionCard} onPress={onPress} activeOpacity={0.7}>
            <View style={[localStyles.actionIconWrap, { backgroundColor: color === '#fff' ? 'rgba(255,255,255,0.05)' : color + '20' }]}>
                <MaterialIcons name={icon} size={20} color={color} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[localStyles.actionTitle, { color }]}>{label}</Text>
                {desc && <Text style={localStyles.actionDesc} numberOfLines={1}>{desc}</Text>}
            </View>
            <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
    );

    return (
        <ScrollView style={isLandscape ? localStyles.containerLandscape : localStyles.containerPortrait} showsVerticalScrollIndicator={false}>
            <Text style={isLandscape ? styles.sectionTitleLandscape : styles.sectionTitle}>DATA MANAGEMENT</Text>

            <View style={localStyles.sectionCard}>
                <Text style={localStyles.cardTitle}>CLOUD SYNC (GOOGLE DRIVE)</Text>
                <View style={localStyles.statusRow}>
                    <View style={[localStyles.statusDot, { backgroundColor: user ? '#4CAF50' : 'rgba(255,255,255,0.2)' }]} />
                    <Text style={localStyles.statusText}>
                        {user ? user.user?.email : 'Not signed in'}
                    </Text>
                    {user && (
                        <TouchableOpacity onPress={handleSignOut} style={localStyles.signOutBtn}>
                            <MaterialIcons name="logout" size={16} color="#FF6B6B" />
                        </TouchableOpacity>
                    )}
                </View>

                {!user ? (
                    <TouchableOpacity style={localStyles.primaryBtn} onPress={handleSignIn} disabled={loading}>
                        {loading ? <ActivityIndicator size="small" color="#000" /> : (
                            <>
                                <MaterialIcons name="login" size={18} color="#000" />
                                <Text style={localStyles.primaryBtnText}>Sign in to Sync</Text>
                            </>
                        )}
                    </TouchableOpacity>
                ) : (
                    <>
                        <View style={localStyles.freqRow}>
                            {(['Off', 'Daily', 'Weekly'] as AutoSyncFrequency[]).map(freq => (
                                <TouchableOpacity
                                    key={freq}
                                    style={[localStyles.freqChip, autoSyncFrequency === freq && localStyles.freqChipActive]}
                                    onPress={() => updateAutoSyncFrequency(freq)}
                                >
                                    <Text style={[localStyles.freqText, autoSyncFrequency === freq && localStyles.freqTextActive]}>{freq}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {autoSyncFrequency !== 'Off' && (
                            <TouchableOpacity style={localStyles.timePickerRow} onPress={openTimePicker}>
                                <Text style={localStyles.timePickerLabel}>Auto-backup at</Text>
                                <Text style={localStyles.timePickerValue}>{autoSyncTime}</Text>
                            </TouchableOpacity>
                        )}
                        <View style={localStyles.dualBtnRow}>
                            <TouchableOpacity style={localStyles.secondaryBtn} onPress={handleBackup} disabled={loading}>
                                <MaterialIcons name="cloud-upload" size={18} color="#fff" />
                                <Text style={localStyles.secondaryBtnText}>Backup</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={localStyles.secondaryBtn} onPress={handleRestore} disabled={loading}>
                                <MaterialIcons name="cloud-download" size={18} color="#fff" />
                                <Text style={localStyles.secondaryBtnText}>Restore</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
                <Text style={localStyles.hint}>Last sync: {lastSyncDisplay}</Text>
            </View>

            <View style={localStyles.sectionCard}>
                <Text style={localStyles.cardTitle}>LOCAL CLEANUP</Text>
                {renderActionBtn('Clear Timers', 'schedule', onClearTime, '#fff', 'Remove all saved timers')}
                <View style={localStyles.divider} />
                {renderActionBtn('Clear Tasks', 'task-alt', onClearTask, '#fff', 'Remove all saved tasks')}
                <View style={localStyles.divider} />
                {renderActionBtn('Clear All Data', 'delete-forever', onClearAllData, '#FF6B6B', 'Wipe everything including settings')}
            </View>

            <View style={localStyles.sectionCard}>
                <Text style={localStyles.cardTitle}>EXPORT</Text>
                {renderActionBtn('Export Data (JSON)', 'file-download', handleExport, '#fff', 'Share or save a debug copy')}
            </View>

            <View style={{ height: 40 }} />

            <Modal
                visible={pickerVisible}
                transparent
                animationType="fade"
                supportedOrientations={['portrait', 'landscape']}
            >
                <Pressable style={localStyles.modalOverlay} onPress={() => setPickerVisible(false)}>
                    <Pressable style={localStyles.modalCard} onPress={e => e.stopPropagation()}>
                        <Text style={localStyles.modalTitle}>BACKUP TIME</Text>
                        <View style={localStyles.pickerRow}>
                            <WheelPicker data={Array.from({ length: 24 }, (_, i) => i)} value={pickerHour} onChange={setPickerHour} />
                            <Text style={localStyles.pickerSep}>:</Text>
                            <WheelPicker data={Array.from({ length: 60 }, (_, i) => i)} value={pickerMinute} onChange={setPickerMinute} />
                        </View>
                        <TouchableOpacity style={localStyles.primaryBtn} onPress={() => updateAutoSyncTime(pickerHour, pickerMinute)}>
                            <Text style={localStyles.primaryBtnText}>Set Time</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </ScrollView >
    );
}

const localStyles = RNStyleSheet.create({
    containerPortrait: { paddingHorizontal: 4 },
    containerLandscape: { flex: 1 },
    sectionCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    cardTitle: {
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
        marginBottom: 16,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    statusText: { color: '#fff', fontSize: 13, fontWeight: '500', flex: 1 },
    signOutBtn: { padding: 4 },
    primaryBtn: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    primaryBtnText: { color: '#000', fontSize: 14, fontWeight: '800' },
    dualBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    secondaryBtn: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.06)',
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    secondaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 4 },
    actionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    actionIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionTitle: { fontSize: 14, fontWeight: '600' },
    actionDesc: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
    hint: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 12, textAlign: 'center' },
    freqRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    freqChip: {
        flex: 1,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    freqChipActive: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderColor: 'rgba(255,255,255,0.3)',
    },
    freqText: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '700' },
    freqTextActive: { color: '#fff' },
    timePickerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        marginBottom: 12,
    },
    timePickerLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
    timePickerValue: { color: '#fff', fontSize: 15, fontWeight: '800' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center' },
    modalCard: { backgroundColor: '#111', borderRadius: 24, padding: 24, width: '80%', maxWidth: 320, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    modalTitle: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'center', letterSpacing: 1, marginBottom: 20 },
    pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    pickerSep: { color: '#fff', fontSize: 24, marginHorizontal: 10, opacity: 0.5 },
});
