import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface EmptyStateProps {
    onAddTimer: () => void;
}

export default function EmptyState({ onAddTimer }: EmptyStateProps) {
    return (
        <LinearGradient
            colors={['#080C1A', '#020305']}
            style={styles.container}
        >
            {/* Soft Glow Background - Subtle orbs with blur */}
            <View style={styles.glowBackground}>
                {/* Blue orb top-left */}
                <View style={[styles.glowOrb, styles.blueOrb]} />
                {/* Cyan orb bottom-right */}
                <View style={[styles.glowOrb, styles.cyanOrb]} />
            </View>

            <SafeAreaView style={styles.safeArea}>
                {/* HEADER */}
                <View style={styles.header}>
                    <Text style={styles.title}>Daily Timers</Text>

                    {/* iOS Date Pill */}
                    <TouchableOpacity style={styles.datePill} activeOpacity={0.8}>
                        <Text style={styles.dateText}>Monday, 21 Aug</Text>
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
        </LinearGradient >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },

    glowBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
    },

    glowOrb: {
        position: 'absolute',
        borderRadius: 9999,
    },

    // Blue orb - very subtle, top left
    blueOrb: {
        backgroundColor: '#1e40af',
        width: width * 1.5,
        height: height * 0.6,
        top: -height * 0.3,
        left: -width * 0.5,
        opacity: 0.06,
        transform: [{ scale: 1.5 }],
    },

    // Cyan orb - very subtle, bottom right
    cyanOrb: {
        backgroundColor: '#00d4ff',
        width: width * 1.2,
        height: height * 0.5,
        bottom: -height * 0.15,
        right: -width * 0.4,
        opacity: 0.05,
        transform: [{ scale: 1.5 }],
    },

    safeArea: {
        flex: 1,
        zIndex: 10,
    },

    header: {
        paddingTop: 48,
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

    // Dashed container with radial gradient effect
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
        backgroundColor: 'rgba(0,247,255,0.04)',
        opacity: 0.6,
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
        // Outer glow shadow
        ...Platform.select({
            ios: {
                shadowColor: '#00F7FF',
                shadowOpacity: 0.4,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 10 },
            },
        }),
    },

    buttonInnerGlow: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,247,255,0.08)',
        borderRadius: 24,
    },

    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 20,
        paddingHorizontal: 48,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 24,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.3)',
    },

    buttonIcon: {
        // Text shadow effect for glow
        ...Platform.select({
            ios: {
                textShadowColor: 'rgba(255,255,255,0.4)',
                textShadowRadius: 10,
            },
        }),
    },

    addButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 2,
        // Text shadow for glow effect
        ...Platform.select({
            ios: {
                textShadowColor: 'rgba(255,255,255,0.4)',
                textShadowRadius: 10,
            },
        }),
    },
});
