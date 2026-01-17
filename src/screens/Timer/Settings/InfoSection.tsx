import React from 'react';
import {
    View,
    Text,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { styles } from './styles';
import { InfoSectionProps } from './types';

export default function InfoSection({
    isLandscape,
}: InfoSectionProps) {
    if (isLandscape) {
        return (
            <View style={styles.aboutContainerLandscape}>
                <Text style={styles.sectionTitleLandscape}>ABOUT</Text>
                <View style={styles.aboutHeaderLandscape}>
                    <LinearGradient
                        colors={['#FFFFFF', '#CCCCCC']}
                        style={styles.aboutIconContainer}
                    >
                        <MaterialIcons name="timer" size={28} color="#000" />
                    </LinearGradient>
                    <View>
                        <Text style={styles.aboutTextMain}>Timer App</Text>
                        <Text style={styles.aboutTextSub}>Version 1.0.0</Text>
                    </View>
                </View>
                <Text style={styles.aboutDescription}>
                    A high-precision timer designed for focus and productivity. Customize your experience with unique themes and alert sounds.
                </Text>
                <View style={styles.sectionDivider} />
                <View style={styles.aboutFooterRow}>
                    <Text style={styles.aboutFooterText}>Built with React Native & Expo</Text>
                    <Text style={styles.aboutFooterText}>© 2026</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.aboutCard}>
            <Text style={styles.aboutText}>Timer App v1.0.0</Text>
            <Text style={styles.aboutSubtext}>Built with React Native & Expo</Text>
        </View>
    );
}
