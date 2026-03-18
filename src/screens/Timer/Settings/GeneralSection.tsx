import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { styles } from './styles';
import { GeneralSectionProps } from './types';
import DailyStartTimeSection from './DailyStartTimeSection';

const NOTES_LOCKS_ENABLED_KEY = '@timer_app_notes_locks_enabled_v1';
const NOTES_LOCKS_REQUIRE_EVERY_TIME_KEY = '@timer_app_notes_locks_require_every_time_v1';
const NOTES_LOCKS_MAX_ATTEMPTS_KEY = '@timer_app_notes_locks_max_attempts_v1';
const FOLDERS_STORAGE_KEY = '@timer_app_diary_folders';

function SettingCard({
    label,
    description,
    icon,
    isActive,
    onToggle,
    isLandscape
}: {
    label: string,
    description: string,
    icon: any,
    isActive: boolean,
    onToggle: () => void,
    isLandscape?: boolean
}) {
    return (
        <View style={[
            styles.settingsCardBezelExtraSmall,
            isActive && { backgroundColor: 'rgba(0,255,255,0.05)' }
        ]}>
            <View style={[
                styles.settingsCardTrackExtraSmall,
                isActive && { borderColor: 'rgba(0,255,255,0.3)' }
            ]}>
                <View style={[styles.settingRow, { paddingVertical: isLandscape ? 12 : 16 }]}>
                    <View style={[styles.iconWell, isActive && { borderColor: 'rgba(0,255,255,0.4)', backgroundColor: 'rgba(0,255,255,0.1)' }]}>
                        <MaterialIcons name={icon} size={20} color={isActive ? '#00FFFF' : 'rgba(255,255,255,0.4)'} />
                    </View>

                    <View style={styles.settingInfo}>
                        <Text style={[styles.settingLabel, isActive && { color: '#fff', fontWeight: '800' }]}>{label}</Text>
                        <Text style={[styles.settingDescription, isActive && { color: 'rgba(255,255,255,0.6)' }]}>{description}</Text>
                    </View>

                    <TouchableOpacity
                        onPress={() => {
                            onToggle();
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        }}
                        style={[styles.customSwitch, isActive && styles.customSwitchActive]}
                    >
                        <View style={[styles.switchKnob, isActive && styles.switchKnobActive]} />
                    </TouchableOpacity>
                </View>

                {isActive && <View style={styles.settingsCardOuterGlowExtraSmall} pointerEvents="none" />}
            </View>
        </View>
    );
}

export default function GeneralSection({
    isLandscape,
    isPastTimersDisabled,
    onPastTimersDisabledChange,
    isPastTasksDisabled,
    onPastTasksDisabledChange,
    dailyStartMinutes,
    onDailyStartMinutesChange,
}: GeneralSectionProps) {
    const [notesLocksEnabled, setNotesLocksEnabled] = React.useState(true);
    const [notesLocksRequireEveryTime, setNotesLocksRequireEveryTime] = React.useState(false);
    const [notesLocksMaxAttempts, setNotesLocksMaxAttempts] = React.useState(5);

    React.useEffect(() => {
        (async () => {
            try {
                const [enabledRaw, requireRaw] = await Promise.all([
                    AsyncStorage.getItem(NOTES_LOCKS_ENABLED_KEY),
                    AsyncStorage.getItem(NOTES_LOCKS_REQUIRE_EVERY_TIME_KEY),
                ]);
                setNotesLocksEnabled(enabledRaw === null ? true : (enabledRaw === '1' || enabledRaw === 'true'));
                setNotesLocksRequireEveryTime(requireRaw === '1' || requireRaw === 'true');
                const maxRaw = await AsyncStorage.getItem(NOTES_LOCKS_MAX_ATTEMPTS_KEY);
                const n = maxRaw ? Number(maxRaw) : 5;
                setNotesLocksMaxAttempts(Number.isFinite(n) ? Math.max(1, Math.min(20, Math.floor(n))) : 5);
            } catch {
                // ignore
            }
        })();
    }, []);

    const persistNotesLocksEnabled = async (val: boolean) => {
        setNotesLocksEnabled(val);
        try { await AsyncStorage.setItem(NOTES_LOCKS_ENABLED_KEY, val ? '1' : '0'); } catch { /* ignore */ }
    };
    const persistRequireEveryTime = async (val: boolean) => {
        setNotesLocksRequireEveryTime(val);
        try { await AsyncStorage.setItem(NOTES_LOCKS_REQUIRE_EVERY_TIME_KEY, val ? '1' : '0'); } catch { /* ignore */ }
    };
    const persistMaxAttempts = async (val: number) => {
        const n = Math.max(1, Math.min(20, Math.floor(val)));
        setNotesLocksMaxAttempts(n);
        try { await AsyncStorage.setItem(NOTES_LOCKS_MAX_ATTEMPTS_KEY, String(n)); } catch { /* ignore */ }
    };

    const resetAllFolderLocks = async () => {
        try {
            const raw = await AsyncStorage.getItem(FOLDERS_STORAGE_KEY);
            const folders = raw ? JSON.parse(raw) : [];
            const updated = Array.isArray(folders)
                ? folders.map((f: any) => ({ ...f, isLocked: false, lockCode: undefined }))
                : folders;
            await AsyncStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(updated));
        } catch {
            // ignore
        }
    };

    return (
        <View style={styles.generalTabContainer}>
            {isLandscape ? (
                <Text style={styles.sectionTitleLandscape}>GENERAL SETTINGS</Text>
            ) : (
                <View style={[styles.categoriesHeader, { marginBottom: 16 }]}>
                    <Text style={styles.sectionTitle}>GENERAL SETTINGS</Text>
                </View>
            )}

            <View style={styles.behaviorList}>
                <DailyStartTimeSection
                    isLandscape={isLandscape}
                    dailyStartMinutes={dailyStartMinutes}
                    onDailyStartMinutesChange={onDailyStartMinutesChange}
                />

                <SettingCard
                    label="Notes Folder Locks"
                    description="Lock notes folders with 4-digit codes."
                    icon="lock"
                    isActive={notesLocksEnabled}
                    onToggle={() => persistNotesLocksEnabled(!notesLocksEnabled)}
                    isLandscape={isLandscape}
                />

                {notesLocksEnabled && (
                    <>
                        <SettingCard
                            label="Require Code Every Time"
                            description="Ask for code every time you open a locked folder."
                            icon="vpn-key"
                            isActive={notesLocksRequireEveryTime}
                            onToggle={() => persistRequireEveryTime(!notesLocksRequireEveryTime)}
                            isLandscape={isLandscape}
                        />

                        <View style={styles.settingsCardBezelExtraSmall}>
                            <View style={styles.settingsCardTrackExtraSmall}>
                                <View style={[styles.settingRow, { paddingVertical: isLandscape ? 12 : 16 }]}>
                                    <View style={styles.iconWell}>
                                        <MaterialIcons name="pin" size={20} color="rgba(255,255,255,0.4)" />
                                    </View>
                                    <View style={styles.settingInfo}>
                                        <Text style={styles.settingLabel}>Max Wrong Attempts</Text>
                                        <Text style={styles.settingDescription}>
                                            After {notesLocksMaxAttempts} wrong codes, the folder is disabled until restart.
                                        </Text>
                                    </View>
                                    <View style={styles.attemptStepper}>
                                        <TouchableOpacity
                                            onPress={() => persistMaxAttempts(notesLocksMaxAttempts - 1)}
                                            disabled={notesLocksMaxAttempts <= 1}
                                            style={[
                                                styles.attemptStepBtn,
                                                notesLocksMaxAttempts <= 1 && styles.attemptStepBtnDisabled
                                            ]}
                                            activeOpacity={0.8}
                                        >
                                            <MaterialIcons
                                                name="remove"
                                                size={18}
                                                color={notesLocksMaxAttempts <= 1 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.65)'}
                                            />
                                        </TouchableOpacity>
                                        <View style={styles.attemptValuePill}>
                                            <Text style={styles.attemptValueText}>{notesLocksMaxAttempts}</Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => persistMaxAttempts(notesLocksMaxAttempts + 1)}
                                            disabled={notesLocksMaxAttempts >= 20}
                                            style={[
                                                styles.attemptStepBtn,
                                                notesLocksMaxAttempts >= 20 && styles.attemptStepBtnDisabled
                                            ]}
                                            activeOpacity={0.8}
                                        >
                                            <MaterialIcons
                                                name="add"
                                                size={18}
                                                color={notesLocksMaxAttempts >= 20 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.65)'}
                                            />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={() => {
                                resetAllFolderLocks();
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            }}
                            activeOpacity={0.75}
                            style={styles.settingsCardBezelExtraSmall}
                        >
                            <View style={styles.settingsCardTrackExtraSmall}>
                                <View style={[styles.settingRow, { paddingVertical: isLandscape ? 12 : 16 }]}>
                                    <View style={styles.iconWell}>
                                        <MaterialIcons name="delete-forever" size={20} color="rgba(255, 61, 0, 0.75)" />
                                    </View>
                                    <View style={styles.settingInfo}>
                                        <Text style={styles.settingLabel}>Reset All Folder Locks</Text>
                                        <Text style={styles.settingDescription}>Remove all lock codes from notes folders.</Text>
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>
                    </>
                )}

                <SettingCard
                    label="Disable Past Timers"
                    description="Restrict interactions and prevent edits on previous dates."
                    icon="history-toggle-off"
                    isActive={isPastTimersDisabled}
                    onToggle={() => onPastTimersDisabledChange(!isPastTimersDisabled)}
                    isLandscape={isLandscape}
                />

                <SettingCard
                    label="Disable Past Tasks"
                    description="Restrict scheduling and prevent task edits on previous dates."
                    icon="lock-person"
                    isActive={isPastTasksDisabled}
                    onToggle={() => onPastTasksDisabledChange(!isPastTasksDisabled)}
                    isLandscape={isLandscape}
                />
            </View>
        </View>
    );
}
