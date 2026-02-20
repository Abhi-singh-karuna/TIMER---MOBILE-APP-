import React from 'react';
import {
    View,
    Text,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

                        <View style={[styles.settingsCardBezelSmall, { marginTop: 16, marginBottom: 16 }]}>
                            <View style={styles.settingsCardTrackSmall}>
                                <Text style={[styles.aboutDescription, { fontSize: 13, lineHeight: 20 }]}>
                                    Chronoscape is a professional productivity tool designed to help you master your time.
                                    Combines a precision timer, powerful task management, and a unique landscape
                                    "Flow Mode" to keep you in the zone.
                                </Text>
                                <View style={styles.settingsCardInteriorShadowSmall} pointerEvents="none" />
                                <View style={styles.settingsCardTopRimSmall} pointerEvents="none" />
                            </View>
                            <View style={styles.settingsCardOuterGlowSmall} pointerEvents="none" />
                        </View>

                        <View style={styles.settingsCardBezelExtraSmall}>
                            <View style={styles.settingsCardTrackExtraSmall}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flex: 1 }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Designed By</Text>
                                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Abhishek Singh</Text>
                                </View>
                                <View style={styles.settingsCardInteriorShadowExtraSmall} pointerEvents="none" />
                                <View style={styles.settingsCardTopRimExtraSmall} pointerEvents="none" />
                            </View>
                            <View style={styles.settingsCardOuterGlowExtraSmall} pointerEvents="none" />
                        </View>

                        <View style={[styles.settingsCardBezelSmall, { marginTop: 16, marginBottom: 16 }]}>
                            <View style={styles.settingsCardTrackSmall}>
                                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>KEY FEATURES</Text>

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
                                <View style={styles.settingsCardInteriorShadowSmall} pointerEvents="none" />
                                <View style={styles.settingsCardTopRimSmall} pointerEvents="none" />
                            </View>
                            <View style={styles.settingsCardOuterGlowSmall} pointerEvents="none" />
                        </View>

                        <View style={styles.sectionDivider} />
                        <View style={styles.aboutFooterRow}>
                            <Text style={styles.aboutFooterText}>© 2026 Chronoscape. All rights reserved.</Text>
                        </View>
                        <View style={styles.settingsCardInteriorShadow} pointerEvents="none" />
                        <View style={styles.settingsCardTopRim} pointerEvents="none" />
                    </View>
                    <View style={styles.settingsCardOuterGlow} pointerEvents="none" />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.settingsCardBezel}>
            <View style={[styles.settingsCardTrack, { padding: 24, alignItems: 'center' }]}>
                <View style={{
                    shadowColor: '#00E5FF',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.3,
                    shadowRadius: 20,
                    marginBottom: 16
                }}>
                    <Image
                        source={require('../../../../assets/icon.png')}
                        style={{ width: 80, height: 80, borderRadius: 20 }}
                    />
                </View>

                <Text style={[styles.aboutText, { fontSize: 24, marginBottom: 4 }]}>Chronoscape</Text>
                <Text style={[styles.aboutSubtext, { fontSize: 14, color: 'rgba(255,255,255,0.5)' }]}>Version 1.0.0 (Build 1)</Text>

                <View style={[styles.settingsCardBezelSmall, { marginTop: 24, width: '100%', marginBottom: 0 }]}>
                    <View style={[styles.settingsCardTrackSmall, { alignItems: 'center' }]}>
                        <Text style={{
                            color: 'rgba(255,255,255,0.7)',
                            textAlign: 'center',
                            fontSize: 13,
                            lineHeight: 20
                        }}>
                            "Time is a landscape. Navigate it with precision."
                        </Text>
                        <View style={styles.settingsCardInteriorShadowSmall} pointerEvents="none" />
                        <View style={styles.settingsCardTopRimSmall} pointerEvents="none" />
                    </View>
                    <View style={styles.settingsCardOuterGlowSmall} pointerEvents="none" />
                </View>

                <View style={{ marginTop: 24, alignItems: 'center', gap: 6, width: '100%' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>DESIGNED BY</Text>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 16 }}>Abhishek Singh</Text>

                    <View style={styles.settingsCardBezelSmall}>
                        <View style={styles.settingsCardTrackSmall}>
                            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 12, textAlign: 'center' }}>KEY FEATURES</Text>

                            <View style={{ gap: 12 }}>
                                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                    <MaterialIcons name="view-timeline" size={16} color="#00E5FF" style={{ marginTop: 2 }} />
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 18, flex: 1 }}>
                                        <Text style={{ color: '#fff', fontWeight: '700' }}>Live Landscape Mode:</Text> Visual timeline of your day. Drag & drop tasks, see the 'Now' line.
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                    <MaterialIcons name="timer" size={16} color="#00E676" style={{ marginTop: 2 }} />
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 18, flex: 1 }}>
                                        <Text style={{ color: '#fff', fontWeight: '700' }}>Focus Flow:</Text> Immersive timer with slide-to-complete gesture.
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                    <MaterialIcons name="repeat" size={16} color="#FF9100" style={{ marginTop: 2 }} />
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 18, flex: 1 }}>
                                        <Text style={{ color: '#fff', fontWeight: '700' }}>Smart Recurrence:</Text> Complex repeating schedules handled automatically.
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.settingsCardInteriorShadowSmall} pointerEvents="none" />
                            <View style={styles.settingsCardTopRimSmall} pointerEvents="none" />
                        </View>
                        <View style={styles.settingsCardOuterGlowSmall} pointerEvents="none" />
                    </View>
                </View>
                <View style={styles.settingsCardInteriorShadow} pointerEvents="none" />
                <View style={styles.settingsCardTopRim} pointerEvents="none" />
            </View>
            <View style={styles.settingsCardOuterGlow} pointerEvents="none" />
        </View>
    );
}
