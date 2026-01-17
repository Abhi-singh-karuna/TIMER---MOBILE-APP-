import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface EmptyStateProps {
    onAddTimer: () => void;
}

export default function EmptyState({ onAddTimer }: EmptyStateProps) {
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isLandscape = windowWidth > windowHeight;

    // Get current date
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formattedDate = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;

    const renderPortrait = () => (
        <SafeAreaView style={styles.safeArea}>
            {/* HEADER */}
            <View style={styles.header}>
                <Text style={styles.title}>Daily Timers</Text>

                {/* iOS Date Pill */}
                <TouchableOpacity style={styles.datePill} activeOpacity={0.8}>
                    <Text style={styles.dateText}>{formattedDate}</Text>
                    <MaterialIcons name="expand-more" size={16} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
            </View>

            {/* MAIN CONTENT */}
            <View style={styles.main}>
                {/* Dashed Container with radial gradient */}
                <View style={styles.dashedContainer}>
                    {/* Inner radial glow effect */}
                    <View style={styles.radialGlow} />

                    <View style={styles.emptyContent}>
                        {/* Icon Box */}
                        <View style={styles.iconBox}>
                            <MaterialIcons name="timer-off" size={40} color="rgba(255,255,255,0.3)" />
                        </View>

                        {/* Text */}
                        <Text style={styles.emptyTitle}>Your focus list is empty</Text>
                        <Text style={styles.emptySubtitle}>
                            Ready to start a new deep work session?
                        </Text>
                    </View>
                </View>

                {/* Premium Glass Button with Cyan Glow */}
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={onAddTimer}
                        style={styles.addButtonWrapper}
                    >
                        {/* Inner glow layer */}
                        <View style={styles.buttonInnerGlow} />

                        {/* Button content */}
                        <View style={styles.addButton}>
                            <MaterialIcons name="add" size={24} color="#fff" style={styles.buttonIcon} />
                            <Text style={styles.addButtonText}>ADD TIMER</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );

    const renderLandscape = () => (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.landscapeContainer}>
                {/* Left Panel - Branding */}
                <View style={styles.leftPanel}>
                    <View style={styles.brandingBox}>
                        <Text style={styles.titleLandscape}>Daily{'\n'}Timers</Text>
                        <View style={styles.datePillLandscape}>
                            <MaterialIcons name="calendar-today" size={14} color="rgba(255,255,255,0.4)" />
                            <Text style={styles.dateTextLandscape}>{formattedDate}</Text>
                        </View>

                        {/* Decorative Icon */}
                        <View style={styles.iconBoxLandscape}>
                            <MaterialIcons name="timer-off" size={48} color="rgba(255, 255, 255, 0.2)" />
                        </View>
                    </View>
                </View>

                {/* Right Panel - Content & Action */}
                <View style={styles.rightPanel}>
                    <View style={styles.dashedContainerLandscape}>
                        <View style={styles.radialGlow} />
                        <View style={styles.emptyContentLandscape}>
                            <Text style={styles.emptyTitleLandscape}>Your focus list is empty</Text>
                            <Text style={styles.emptySubtitleLandscape}>
                                Ready to start a new deep work session?
                            </Text>

                            <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={onAddTimer}
                                style={[styles.addButtonWrapper, styles.addButtonWrapperLandscape]}
                            >
                                <View style={styles.buttonInnerGlow} />
                                <View style={[styles.addButton, styles.addButtonLandscape]}>
                                    <MaterialIcons name="add" size={24} color="#000" />
                                    <Text style={styles.addButtonText}>ADD TIMER</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );

    return (
        <View style={styles.container}>
            {isLandscape ? renderLandscape() : renderPortrait()}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },

    glowBackground: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        overflow: 'hidden',
    },

    glowOrb: {
        position: 'absolute',
        borderRadius: 9999,
    },

    blueOrb: {
        backgroundColor: '#1e40af',
        width: SCREEN_WIDTH * 1.5,
        height: SCREEN_HEIGHT * 0.6,
        top: -SCREEN_HEIGHT * 0.3,
        left: -SCREEN_WIDTH * 0.5,
        opacity: 0.06,
        transform: [{ scale: 1.5 }],
    },

    blueOrbLandscape: {
        width: SCREEN_HEIGHT * 1.5,
        height: SCREEN_WIDTH * 0.6,
    },

    cyanOrb: {
        backgroundColor: '#00d4ff',
        width: SCREEN_WIDTH * 1.2,
        height: SCREEN_HEIGHT * 0.5,
        bottom: -SCREEN_HEIGHT * 0.15,
        right: -SCREEN_WIDTH * 0.4,
        opacity: 0.05,
        transform: [{ scale: 1.5 }],
    },

    cyanOrbLandscape: {
        width: SCREEN_HEIGHT * 1.2,
        height: SCREEN_WIDTH * 0.5,
    },

    safeArea: {
        flex: 1,
        zIndex: 10,
    },

    // ========== PORTRAIT STYLES ==========
    header: {
        paddingTop: Platform.OS === 'ios' ? 20 : 48,
        paddingBottom: 24,
        alignItems: 'center',
        paddingHorizontal: 24,
    },

    title: {
        fontSize: 34,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -1.4,
        marginBottom: 16,
    },

    datePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    dateText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#fff',
    },

    main: {
        flex: 1,
        paddingHorizontal: 32,
        paddingTop: 16,
        paddingBottom: 48,
    },

    dashedContainer: {
        flex: 1,
        marginBottom: 40,
        borderRadius: 48,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        overflow: 'hidden',
        position: 'relative',
    },

    radialGlow: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
    },

    emptyContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },

    iconBox: {
        width: 80,
        height: 80,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },

    emptyTitle: {
        fontSize: 19,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: -0.3,
        marginBottom: 6,
        textAlign: 'center',
    },

    emptySubtitle: {
        fontSize: 15,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 22,
        textAlign: 'center',
    },

    buttonContainer: {
        alignItems: 'center',
    },

    addButtonWrapper: {
        width: '100%',
        maxWidth: 340,
        position: 'relative',
        borderRadius: 24,
        overflow: 'hidden',
    },

    buttonInnerGlow: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
    },

    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 20,
        paddingHorizontal: 48,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
    },

    buttonIcon: {
        ...Platform.select({
            ios: {
                textShadowColor: 'rgba(255,255,255,0.4)',
                textShadowRadius: 10,
            },
        }),
    },

    addButtonText: {
        fontSize: 16,
        fontWeight: '800',
        color: '#000000',
        letterSpacing: 2,
    },

    // ========== LANDSCAPE STYLES ==========
    landscapeContainer: {
        flex: 1,
        flexDirection: 'row',
        paddingHorizontal: 40,
        paddingVertical: 20,
    },

    leftPanel: {
        flex: 1,
        justifyContent: 'center',
        paddingRight: 40,
    },

    brandingBox: {
        gap: 20,
    },

    titleLandscape: {
        fontSize: 42,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -1.5,
        lineHeight: 46,
    },

    datePillLandscape: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    dateTextLandscape: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 1,
    },

    iconBoxLandscape: {
        width: 100,
        height: 100,
        borderRadius: 32,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
    },

    rightPanel: {
        flex: 1.2,
        justifyContent: 'center',
    },

    dashedContainerLandscape: {
        height: '100%',
        borderRadius: 40,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(15, 15, 15, 0.6)',
        overflow: 'hidden',
    },

    emptyContentLandscape: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },

    emptyTitleLandscape: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 12,
        textAlign: 'center',
    },

    emptySubtitleLandscape: {
        fontSize: 15,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.4)',
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 32,
    },

    addButtonWrapperLandscape: {
        maxWidth: 280,
    },

    addButtonLandscape: {
        paddingVertical: 16,
    },
});

