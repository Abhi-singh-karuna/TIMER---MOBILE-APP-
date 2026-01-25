import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
} from 'react-native';
import { styles } from './styles';
import { GeneralSectionProps } from './types';
import DailyStartTimeSection from './DailyStartTimeSection';

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
            {isLandscape && <Text style={styles.sectionTitleLandscape}>GENERAL SETTINGS</Text>}
            <View style={styles.behaviorList}>
                <DailyStartTimeSection
                    isLandscape={isLandscape}
                    dailyStartMinutes={dailyStartMinutes}
                    onDailyStartMinutesChange={onDailyStartMinutesChange}
                />
                <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                        <Text style={styles.settingLabel}>Disable Past Timers</Text>
                        <Text style={styles.settingDescription}>Restrict interactions and prevent edits on previous dates.</Text>
                    </View>
                    <TouchableOpacity onPress={() => onPastTimersDisabledChange(!isPastTimersDisabled)} style={[styles.customSwitch, isPastTimersDisabled && styles.customSwitchActive]}>
                        <View style={[styles.switchKnob, isPastTimersDisabled && styles.switchKnobActive]} />
                    </TouchableOpacity>
                </View>
                <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                        <Text style={styles.settingLabel}>Disable Past Tasks</Text>
                        <Text style={styles.settingDescription}>Restrict scheduling and prevent task edits on previous dates.</Text>
                    </View>
                    <TouchableOpacity onPress={() => onPastTasksDisabledChange(!isPastTasksDisabled)} style={[styles.customSwitch, isPastTasksDisabled && styles.customSwitchActive]}>
                        <View style={[styles.switchKnob, isPastTasksDisabled && styles.switchKnobActive]} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}
