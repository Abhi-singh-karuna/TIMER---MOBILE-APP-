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
    const renderRestoreCard = () => (
        <View style={styles.settingsCardBezelSmall}>
            <View style={styles.settingsCardTrackSmall}>
                {/* Clear Time Action */}
                <TouchableOpacity
                    style={[styles.restoreActionCard, { padding: 0 }]}
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

                {/* Divider */}
                <View style={{
                    height: 1,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    marginVertical: 4,
                    marginHorizontal: 12
                }} />

                {/* Clear Task Action */}
                <TouchableOpacity
                    style={[styles.restoreActionCard, { padding: 0 }]}
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

                <View style={styles.settingsCardInteriorShadowSmall} pointerEvents="none" />
                <View style={styles.settingsCardTopRimSmall} pointerEvents="none" />
            </View>
            <View style={styles.settingsCardOuterGlowSmall} pointerEvents="none" />
        </View>
    );

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

                {renderRestoreCard()}

                <Text style={styles.restoreLandscapeWarning}>
                    Settings, themes, categories and quick messages are not affected. Only timers or tasks are removed.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.generalTabContainer}>
            <View style={[styles.categoriesHeader, { marginBottom: 8 }]}>
                <Text style={styles.sectionTitle}>RESTORE</Text>
            </View>
            <Text style={styles.restoreSectionDescription}>
                Clear data from local storage. This action cannot be undone.
            </Text>

            {renderRestoreCard()}

            <Text style={[styles.restoreLandscapeWarning, { marginTop: 8, paddingHorizontal: 4 }]}>
                Settings, themes, categories and quick messages are not affected.
            </Text>
        </View>
    );
}
