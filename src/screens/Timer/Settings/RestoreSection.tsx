import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { styles } from './styles';
import { RestoreSectionProps } from './types';

export default function RestoreSection({
    isLandscape,
    onClearTime,
    onClearTask,
}: RestoreSectionProps) {
    if (isLandscape) {
        return (
            <View style={[styles.generalTabContainer, styles.restoreLandscapeContainer]}>
                <Text style={styles.sectionTitleLandscape}>RESTORE</Text>
                <View style={styles.restoreLandscapeHeader}>
                    <View style={styles.restoreLandscapeIconWrap}>
                        <MaterialIcons name="restore" size={24} color="rgba(255,255,255,0.9)" />
                    </View>
                    <View>
                        <Text style={styles.restoreLandscapeTitle}>Clear stored data</Text>
                        <Text style={styles.restoreLandscapeSubtitle}>Remove timers or tasks from this device</Text>
                    </View>
                </View>
                <Text style={styles.restoreLandscapeIntro}>
                    Use the options below to permanently delete data from local storage. You will be asked to type &quot;clear all&quot; to confirm. This action cannot be undone.
                </Text>
                <View style={styles.restoreLandscapeDivider} />

                <TouchableOpacity
                    style={styles.restoreActionCard}
                    onPress={onClearTime}
                    activeOpacity={0.75}
                >
                    <View style={styles.restoreActionCardIconWrap}>
                        <MaterialIcons name="schedule" size={22} color="#FFFFFF" />
                    </View>
                    <View style={styles.restoreActionCardContent}>
                        <Text style={styles.restoreActionCardTitle}>Clear Time</Text>
                        <Text style={styles.restoreActionCardDesc}>
                            Remove all saved timers. Your timer list will be empty after this.
                        </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.4)" style={styles.restoreActionCardChevron} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.restoreActionCard}
                    onPress={onClearTask}
                    activeOpacity={0.75}
                >
                    <View style={styles.restoreActionCardIconWrap}>
                        <MaterialIcons name="task-alt" size={22} color="#FFFFFF" />
                    </View>
                    <View style={styles.restoreActionCardContent}>
                        <Text style={styles.restoreActionCardTitle}>Clear Task</Text>
                        <Text style={styles.restoreActionCardDesc}>
                            Remove all saved tasks. Your task list will be empty after this.
                        </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.4)" style={styles.restoreActionCardChevron} />
                </TouchableOpacity>

                <Text style={styles.restoreLandscapeWarning}>
                    Settings, themes, categories and quick messages are not affected. Only timers or tasks are removed.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>RESTORE</Text>
            <Text style={styles.restoreSectionDescription}>
                Clear data from local storage. This cannot be undone.
            </Text>
            <TouchableOpacity
                style={styles.resetButton}
                onPress={onClearTime}
                activeOpacity={0.7}
            >
                <MaterialIcons name="schedule" size={20} color="#FFFFFF" />
                <Text style={styles.resetButtonText}>Clear Time</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.resetButton, { marginTop: 10 }]}
                onPress={onClearTask}
                activeOpacity={0.7}
            >
                <MaterialIcons name="task-alt" size={20} color="#FFFFFF" />
                <Text style={styles.resetButtonText}>Clear Task</Text>
            </TouchableOpacity>
        </View>
    );
}
