import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Platform,
    Dimensions,
    useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Timer } from '../constants/data';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface DeleteModalProps {
    visible: boolean;
    timer: Timer | null;
    onCancel: () => void;
    onReset: () => void;
    onDelete: () => void;
}

export default function DeleteModal({ visible, timer, onCancel, onReset, onDelete }: DeleteModalProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;
    if (!timer) return null;

    const handleDelete = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onDelete();
    };

    const handleCancel = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onCancel();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            supportedOrientations={['portrait', 'landscape']}
            onRequestClose={handleCancel}
        >
            <View style={styles.overlay}>
                {Platform.OS !== 'web' && <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />}
                <View style={styles.dimLayer} />

                <View style={[styles.modal, isLandscape && styles.modalLandscape]}>
                    {/* Title */}
                    <Text style={styles.title}>Delete Timer?</Text>

                    {/* Subtitle */}
                    <Text style={styles.subtitle}>This action cannot be undone.</Text>
                    <Text style={styles.timerInfo}>{timer.title.toUpperCase()} – {timer.total}</Text>

                    {/* Buttons Row */}
                    <View style={[styles.buttonRow, isLandscape && styles.buttonRowLandscape]}>
                        <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn} activeOpacity={0.7}>
                            <Text style={styles.cancelText}>CANCEL</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} activeOpacity={0.7}>
                            <Text style={styles.deleteText}>DELETE</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    dimLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },

    modal: {
        width: SCREEN_WIDTH * 0.85,
        maxWidth: 380,
        backgroundColor: 'rgba(25, 35, 45, 0.95)',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingTop: 28,
        paddingBottom: 24,
        paddingHorizontal: 24,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.5,
                shadowRadius: 30,
                shadowOffset: { width: 0, height: 15 },
            },
        }),
    },

    modalLandscape: {
        width: '70%',
        maxWidth: 500,
        paddingTop: 20,
        paddingBottom: 20,
    },

    buttonRowLandscape: {
        marginTop: 10,
    },

    title: {
        fontSize: 24,
        fontWeight: '600',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 12,
    },

    subtitle: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        marginBottom: 4,
    },

    timerInfo: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.35)',
        textAlign: 'center',
        letterSpacing: 1.5,
        marginBottom: 28,
    },

    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },

    cancelBtn: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.15)',
        paddingVertical: 14,
        alignItems: 'center',
    },

    cancelText: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1.5,
    },

    deleteBtn: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(255,60,80,0.5)',
        paddingVertical: 14,
        alignItems: 'center',
    },

    deleteText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#FF3C50',
        letterSpacing: 1.5,
    },
});
