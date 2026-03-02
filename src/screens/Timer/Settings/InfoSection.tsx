import React from 'react';
import {
    View,
    Text,
} from 'react-native';

import { MaterialIcons } from '@expo/vector-icons';
import { styles } from './styles';
import { InfoSectionProps } from './types';

import { Image } from 'react-native';

export default function InfoSection({
    isLandscape,
}: InfoSectionProps) {
    if (isLandscape) {
        return (
            <View style={styles.aboutContainerLandscape}>
                <Text style={styles.sectionTitleLandscape}>ABOUT</Text>
                <View style={styles.settingsCardBezel}>
                    <View style={styles.settingsCardTrack}>
                        <View style={[styles.aboutHeaderLandscape, { alignItems: 'flex-start' }]}>
                            <View style={styles.aboutIconContainer}>
                                <Image
                                    source={require('../../../../assets/icon.png')}
                                    style={{ width: 64, height: 64, borderRadius: 16 }}
                                />
                            </View>
                            <View style={{ marginLeft: 6 }}>
                                <Text style={styles.aboutTextMain}>Chronoscape</Text>
                                <Text style={styles.aboutTextSub}>Version 1.0.0 (Build 1)</Text>
                                <View style={{ marginTop: 4, flexDirection: 'row', gap: 6 }}>
                                    <View style={styles.settingsCardBezelExtraSmall}>
                                        <View style={[styles.settingsCardTrackExtraSmall, { paddingVertical: 2 }]}>
                                            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' }}>RELEASE</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>

                        <View style={{ marginTop: 16, marginBottom: 16, padding: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                            <Text style={[styles.aboutDescription, { fontSize: 13, lineHeight: 20 }]}>
                                Chronoscape is a professional productivity tool designed to help you master your time.
                                Combines a precision timer, powerful task management, and a unique landscape
                                "Flow Mode" to keep you in the zone.
                            </Text>
                        </View>

                        <View style={{ padding: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Designed By</Text>
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Abhishek Singh</Text>
                            </View>
                        </View>

                        <View style={{ marginTop: 16, marginBottom: 16, padding: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', marginBottom: 12, letterSpacing: 0.5 }}>KEY FEATURES</Text>

                            <View style={{ gap: 12 }}>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <MaterialIcons name="view-timeline" size={18} color="#00E5FF" style={{ marginTop: 2 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 2 }}>Live Landscape Mode</Text>
                                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 16 }}>
                                            Visual timeline of your day. Drag & drop tasks, see overlaps, and track the 'Now' line in real-time.
                                        </Text>
                                    </View>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <MaterialIcons name="timer" size={18} color="#00E676" style={{ marginTop: 2 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 2 }}>Focus Flow</Text>
                                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 16 }}>
                                            Immersive full-screen timer. Distraction-free interface with a satisfying slide-to-complete gesture.
                                        </Text>
                                    </View>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <MaterialIcons name="repeat" size={18} color="#FF9100" style={{ marginTop: 2 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 2 }}>Smart Recurrence</Text>
                                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 16 }}>
                                            Complex repeating schedules (e.g. "Last Fri of Month") handled automatically.
                                        </Text>
                                    </View>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <MaterialIcons name="nights-stay" size={18} color="#B39DDB" style={{ marginTop: 2 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 2 }}>Logical Day</Text>
                                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 16 }}>
                                            For night owls: start your "day" at 4 AM so late-night work counts for today.
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        <View style={styles.sectionDivider} />
                        <View style={styles.aboutFooterRow}>
                            <Text style={styles.aboutFooterText}>© 2026 Chronoscape. All rights reserved.</Text>
                        </View>
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.settingsCardBezel}>
            <View style={[styles.settingsCardTrack, { padding: 20, alignItems: 'center' }]}>
                {/* App Information Section */}
                <View style={{ alignItems: 'center', marginBottom: 24 }}>
                    <Image
                        source={require('../../../../assets/icon.png')}
                        style={{ width: 84, height: 84, borderRadius: 22, backgroundColor: '#111' }}
                    />
                    <Text style={[styles.aboutText, { fontSize: 26, fontWeight: '800', marginTop: 16, marginBottom: 2, color: '#fff' }]}>Chronoscape</Text>
                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '500' }}>Version 1.0.0 (Build 1)</Text>
                </View>

                {/* Slogan Card */}
                <View style={{
                    width: '100%',
                    padding: 16,
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                    marginBottom: 20,
                }}>
                    <Text style={{
                        color: 'rgba(255,255,255,0.8)',
                        textAlign: 'center',
                        fontSize: 14,
                        lineHeight: 22,
                        fontStyle: 'italic',
                        fontWeight: '500'
                    }}>
                        "Time is a landscape. Navigate it with precision."
                    </Text>
                </View>

                {/* Designed By & Features */}
                <View style={{ width: '100%', gap: 20 }}>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 }}>DESIGNED BY</Text>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Abhishek Singh</Text>
                    </View>

                    <View style={{
                        width: '100%',
                        padding: 18,
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.06)',
                    }}>
                        <Text style={{
                            color: 'rgba(255,255,255,0.3)',
                            fontSize: 10,
                            fontWeight: '700',
                            letterSpacing: 1.5,
                            marginBottom: 16,
                            textAlign: 'center'
                        }}>KEY FEATURES</Text>

                        <View style={{ gap: 16 }}>
                            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                                <View style={{ backgroundColor: 'rgba(0, 229, 255, 0.1)', padding: 6, borderRadius: 8 }}>
                                    <MaterialIcons name="view-timeline" size={18} color="#00E5FF" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 2 }}>Live Landscape Mode</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 18 }}>
                                        Visual timeline of your day. Drag & drop tasks, and see the 'Now' line.
                                    </Text>
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                                <View style={{ backgroundColor: 'rgba(0, 230, 118, 0.1)', padding: 6, borderRadius: 8 }}>
                                    <MaterialIcons name="timer" size={18} color="#00E676" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 2 }}>Focus Flow</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 18 }}>
                                        Immersive timer with a satisfying slide-to-complete gesture.
                                    </Text>
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                                <View style={{ backgroundColor: 'rgba(255, 145, 0, 0.1)', padding: 6, borderRadius: 8 }}>
                                    <MaterialIcons name="repeat" size={18} color="#FF9100" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 2 }}>Smart Recurrence</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 18 }}>
                                        Complex repeating schedules handled automatically.
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Footer info */}
                <View style={{ marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', width: '100%', alignItems: 'center' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, fontWeight: '500' }}>© 2026 Chronoscape • Premium Productivity</Text>
                </View>
            </View>
        </View>
    );
}
