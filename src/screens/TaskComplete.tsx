import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';

interface TaskCompleteProps {
    completedAt: string;
    borrowedTime?: number;
    onRestart: () => void;
    onDone: () => void;
}

export default function TaskComplete({ completedAt, borrowedTime = 0, onRestart, onDone }: TaskCompleteProps) {
    const { width, height } = useWindowDimensions();
    const [isLandscape, setIsLandscape] = React.useState(false);

    // Check orientation on mount and updates
    React.useEffect(() => {
        ScreenOrientation.getOrientationAsync().then(o => {
            setIsLandscape(
                o === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
                o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
            );
        });

        const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
            const o = event.orientationInfo.orientation;
            setIsLandscape(
                o === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
                o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
            );
        });

        return () => {
            ScreenOrientation.removeOrientationChangeListener(subscription);
        };
    }, []);

    return (
        <LinearGradient
            colors={['#080C1A', '#0a3535', '#0a7070']}
            locations={[0, 0.4, 1]}
            style={styles.container}
        >
            {/* Ambient Glow Effects */}
            <View style={[styles.glowOrb1, isLandscape && styles.glowOrb1Landscape]} />
            <View style={[styles.glowOrb2, isLandscape && styles.glowOrb2Landscape]} />
            <View style={[styles.glowOrb3, isLandscape && styles.glowOrb3Landscape]} />

            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.completionBadge}>
                        <MaterialIcons name="check-circle" size={16} color="#00E5FF" />
                        <Text style={styles.completionLabel}>COMPLETED</Text>
                        <Text style={styles.completionPercent}>100%</Text>
                    </View>
                </View>

                {/* Main Content - Split View in Landscape */}
                <View style={[styles.mainContent, isLandscape && styles.mainContentLandscape]}>

                    {/* Left Section - Success Display */}
                    <View style={[styles.successSection, isLandscape && styles.successSectionLandscape]}>
                        {/* Success Circle with Glow */}
                        <View style={[styles.successCircleContainer, isLandscape && styles.successCircleContainerLandscape]}>
                            <View style={styles.successCircleGlow} />
                            <View style={styles.successCircle}>
                                <MaterialIcons name="check" size={isLandscape ? 48 : 56} color="#0a3040" />
                            </View>
                        </View>

                        {/* Title & Subtitle */}
                        <Text style={[styles.title, isLandscape && styles.titleLandscape]}>
                            Task Complete
                        </Text>
                        <Text style={[styles.subtitle, isLandscape && styles.subtitleLandscape]}>
                            FINISHED AT {completedAt}
                        </Text>
                        {borrowedTime > 0 && (
                            <View style={[styles.borrowedBadge, isLandscape && styles.borrowedBadgeLandscape]}>
                                <MaterialIcons name="add-alarm" size={14} color="#00E5FF" />
                                <Text style={styles.borrowedBadgeText}>
                                    EXTENDED BY {Math.floor(borrowedTime / 60)}m {borrowedTime % 60}s
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Right Section - Action Buttons */}
                    <View style={[styles.actionSection, isLandscape && styles.actionSectionLandscape]}>
                        {/* Action Buttons Container */}
                        <View style={[styles.buttonContainer, isLandscape && styles.buttonContainerLandscape]}>

                            {/* Restart Button */}
                            <TouchableOpacity
                                style={[styles.actionButton, styles.restartButton]}
                                onPress={onRestart}
                                activeOpacity={0.8}
                            >
                                <View style={styles.buttonIconContainer}>
                                    <MaterialIcons name="refresh" size={28} color="#00E5FF" />
                                </View>
                                <View style={styles.buttonTextContainer}>
                                    <Text style={styles.buttonTitle}>Restart</Text>
                                    <Text style={styles.buttonSubtitle}>Run again</Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.3)" />
                            </TouchableOpacity>

                            {/* Done Button - Primary */}
                            <TouchableOpacity
                                style={[styles.actionButton, styles.doneButton]}
                                onPress={onDone}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.buttonIconContainer, styles.doneIconContainer]}>
                                    <MaterialIcons name="done-all" size={28} color="#0a3040" />
                                </View>
                                <View style={styles.buttonTextContainer}>
                                    <Text style={[styles.buttonTitle, styles.doneButtonTitle]}>Done</Text>
                                    <Text style={[styles.buttonSubtitle, styles.doneButtonSubtitle]}>Complete task</Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={24} color="rgba(0,0,0,0.3)" />
                            </TouchableOpacity>

                        </View>
                    </View>

                </View>

                {/* Bottom Indicator */}
                <View style={styles.bottomIndicator} />
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },

    safeArea: {
        flex: 1,
    },

    // Ambient Glow Effects
    glowOrb1: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(0, 229, 255, 0.15)',
        top: '30%',
        left: -100,
        ...Platform.select({
            ios: {
                shadowColor: '#00E5FF',
                shadowOpacity: 0.3,
                shadowRadius: 60,
            },
        }),
    },

    glowOrb1Landscape: {
        width: 250,
        height: 250,
        top: '20%',
        left: -80,
    },

    glowOrb2: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(0, 180, 255, 0.12)',
        bottom: '20%',
        right: -60,
    },

    glowOrb2Landscape: {
        width: 180,
        height: 180,
        bottom: '15%',
        right: '40%',
    },

    glowOrb3: {
        position: 'absolute',
        width: 150,
        height: 150,
        borderRadius: 75,
        backgroundColor: 'rgba(0, 229, 255, 0.1)',
        top: '60%',
        right: -40,
    },

    glowOrb3Landscape: {
        width: 120,
        height: 120,
        top: '40%',
        right: -30,
    },

    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 16,
    },

    completionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(0, 229, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.2)',
    },

    completionLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1,
        color: 'rgba(255,255,255,0.6)',
    },

    completionPercent: {
        fontSize: 14,
        fontWeight: '700',
        color: '#00E5FF',
    },

    orientationButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    // Main Content Layout
    mainContent: {
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },

    mainContentLandscape: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 40,
    },

    // Success Section
    successSection: {
        alignItems: 'center',
        marginBottom: 48,
    },

    successSectionLandscape: {
        flex: 1,
        marginBottom: 0,
        paddingRight: 32,
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.1)',
    },

    successCircleContainer: {
        marginBottom: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },

    successCircleContainerLandscape: {
        marginBottom: 24,
    },

    successCircleGlow: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(0, 229, 255, 0.3)',
        ...Platform.select({
            ios: {
                shadowColor: '#00E5FF',
                shadowOpacity: 0.8,
                shadowRadius: 40,
                shadowOffset: { width: 0, height: 0 },
            },
        }),
    },

    successCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: '#00E5FF',
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#00E5FF',
                shadowOpacity: 0.6,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 8 },
            },
        }),
    },

    title: {
        fontSize: 38,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 12,
        textAlign: 'center',
    },

    titleLandscape: {
        fontSize: 32,
        marginBottom: 8,
    },

    subtitle: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
    },

    subtitleLandscape: {
        fontSize: 11,
    },

    // Action Section
    actionSection: {
        width: '100%',
    },

    actionSectionLandscape: {
        flex: 1,
        paddingLeft: 32,
    },

    buttonContainer: {
        gap: 16,
    },

    buttonContainerLandscape: {
        gap: 12,
    },

    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    restartButton: {
        backgroundColor: 'rgba(0, 229, 255, 0.08)',
        borderColor: 'rgba(0, 229, 255, 0.2)',
    },

    doneButton: {
        backgroundColor: '#00E5FF',
        borderColor: '#00E5FF',
    },

    buttonIconContainer: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(0, 229, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },

    doneIconContainer: {
        backgroundColor: 'rgba(0, 0, 0, 0.15)',
    },

    buttonTextContainer: {
        flex: 1,
    },

    buttonTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 2,
    },

    doneButtonTitle: {
        color: '#0a3040',
    },

    buttonSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.5)',
    },

    doneButtonSubtitle: {
        color: 'rgba(0, 0, 0, 0.5)',
    },

    // Bottom Indicator
    bottomIndicator: {
        alignSelf: 'center',
        width: 100,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#00E5FF',
        marginBottom: 24,
    },

    // Borrowed Time Badge
    borrowedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: 'rgba(0, 229, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.2)',
    },
    borrowedBadgeLandscape: {
        marginTop: 8,
    },
    borrowedBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#00E5FF',
        letterSpacing: 1,
    },
});
