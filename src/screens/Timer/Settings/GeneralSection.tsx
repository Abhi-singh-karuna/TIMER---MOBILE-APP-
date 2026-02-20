import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { styles } from './styles';
import { GeneralSectionProps } from './types';
import DailyStartTimeSection from './DailyStartTimeSection';

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
