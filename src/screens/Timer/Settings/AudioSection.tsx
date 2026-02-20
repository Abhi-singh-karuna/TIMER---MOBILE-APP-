import React, { useRef, useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { SOUND_OPTIONS } from '../../../constants/data';
import { styles } from './styles';
import {
    AudioSectionProps,
    COMPLETION_SOUND_KEY,
    SOUND_REPETITION_KEY,
} from './types';

export default function AudioSection({
    isLandscape,
    selectedSound,
    soundRepetition,
    onSoundChange,
    onRepetitionChange,
}: AudioSectionProps) {
    const [playingSound, setPlayingSound] = useState<number | null>(null);
    const soundRef = useRef<Audio.Sound | null>(null);

    // Individual animation values for each sound card
    const pulseAnims = useRef<Record<number, Animated.Value>>(
        SOUND_OPTIONS.reduce((acc, sound) => ({
            ...acc,
            [sound.id]: new Animated.Value(selectedSound === sound.id ? 1.05 : 1)
        }), {})
    ).current;

    const triggerCardPulse = (id: number) => {
        // Reset all other animations
        SOUND_OPTIONS.forEach(sound => {
            if (sound.id !== id) {
                Animated.spring(pulseAnims[sound.id], {
                    toValue: 1,
                    useNativeDriver: true,
                    friction: 8
                }).start();
            }
        });

        // Trigger selected animation
        Animated.sequence([
            Animated.timing(pulseAnims[id], { toValue: 1.15, duration: 150, useNativeDriver: true }),
            Animated.spring(pulseAnims[id], { toValue: 1.08, useNativeDriver: true, friction: 3 })
        ]).start();
    };

    // Keep state in sync with external selection changes
    useEffect(() => {
        if (pulseAnims[selectedSound]) {
            Animated.spring(pulseAnims[selectedSound], {
                toValue: 1.08,
                useNativeDriver: true,
                friction: 5
            }).start();
        }
    }, [selectedSound]);

    const handleSoundSelect = async (soundIndex: number) => {
        onSoundChange(soundIndex);
        triggerCardPulse(soundIndex);
        try {
            await AsyncStorage.setItem(COMPLETION_SOUND_KEY, soundIndex.toString());
        } catch (err) { console.error(err); }
    };

    const handleRepetitionChangeValue = async (val: number) => {
        onRepetitionChange(val);
        try {
            await AsyncStorage.setItem(SOUND_REPETITION_KEY, val.toString());
        } catch (err) { console.error(err); }
    };

    const handlePreviewSound = async (soundIndex: number) => {
        const soundOption = SOUND_OPTIONS[soundIndex];
        if (!soundOption || soundOption.source === null) return;
        try {
            if (soundRef.current) {
                await soundRef.current.stopAsync();
                await soundRef.current.unloadAsync();
                soundRef.current = null;
            }
            setPlayingSound(soundIndex);
            await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
            const { sound } = await Audio.Sound.createAsync(soundOption.source, { shouldPlay: true });
            soundRef.current = sound;
            sound.setOnPlaybackStatusUpdate((status: any) => {
                if (status.isLoaded && status.didJustFinish) {
                    setPlayingSound(null);
                    sound.unloadAsync();
                    if (soundRef.current === sound) soundRef.current = null;
                }
            });
        } catch (error) {
            console.error('Failed to play sound:', error);
            setPlayingSound(null);
        }
    };

    const renderSoundSection = () => (
        <View style={[styles.soundSection, isLandscape && styles.soundSectionLandscape]}>
            <View style={styles.soundOptionsRow}>
                {SOUND_OPTIONS.map((sound) => (
                    <Animated.View
                        key={sound.id}
                        style={[
                            styles.settingsCardBezelSmall,
                            { transform: [{ scale: pulseAnims[sound.id] }], flex: 1 }
                        ]}
                    >
                        <View style={styles.settingsCardTrackUnified}>
                            <TouchableOpacity
                                style={[
                                    styles.soundCard,
                                    isLandscape && styles.soundCardLandscape,
                                    { padding: 12, alignItems: 'center', justifyContent: 'center' },
                                    selectedSound === sound.id && { backgroundColor: `${sound.color}15` },
                                    sound.source === null && { opacity: 0.8 }
                                ]}
                                onPress={() => handleSoundSelect(sound.id)}
                                activeOpacity={0.7}
                            >
                                <View style={[
                                    styles.soundIconContainer,
                                    selectedSound === sound.id && { backgroundColor: `${sound.color}25` }
                                ]}>
                                    <MaterialIcons
                                        name={sound.icon}
                                        size={24}
                                        color={selectedSound === sound.id ? sound.color : 'rgba(255,255,255,0.4)'}
                                    />
                                </View>
                                <Text style={[
                                    styles.soundName,
                                    selectedSound === sound.id && { color: sound.color, fontWeight: '700' }
                                ]}>
                                    {sound.name}
                                </Text>
                                {sound.source ? (
                                    <TouchableOpacity
                                        style={[
                                            styles.previewButton,
                                            {
                                                backgroundColor: `${sound.color}${selectedSound === sound.id ? '25' : '15'}`,
                                                borderColor: `${sound.color}30`,
                                                borderWidth: 1
                                            }
                                        ]}
                                        onPress={() => handlePreviewSound(sound.id)}
                                        activeOpacity={0.7}
                                    >
                                        {playingSound === sound.id ? (
                                            <ActivityIndicator size="small" color={sound.color} />
                                        ) : (
                                            <MaterialIcons name="play-arrow" size={20} color={sound.color} />
                                        )}
                                    </TouchableOpacity>
                                ) : <View style={{ height: 36 }} />}
                            </TouchableOpacity>
                            {/* Unified view: only outer bezel shadows/glow, no inner box rims */}
                        </View>
                        <View style={[
                            styles.settingsCardOuterGlowSmall,
                            selectedSound === sound.id && { shadowColor: sound.color, shadowOpacity: 0.5, shadowRadius: 12 }
                        ]} pointerEvents="none" />
                    </Animated.View>
                ))}
            </View>
        </View>
    );

    const renderRepetitionSection = () => (
        <View style={styles.settingsCardBezelSmall}>
            <View style={styles.settingsCardTrackUnified}>
                <View style={[styles.repetitionSection, isLandscape && { marginBottom: 0 }]}>
                    <View style={styles.repetitionHeader}>
                        <View style={styles.repetitionTitleRow}>
                            <MaterialIcons name="repeat" size={18} color="#FFFFFF" />
                            <Text style={styles.repetitionTitle}>Repeat Count</Text>
                        </View>
                        <Text style={styles.repetitionValue}>{soundRepetition}x</Text>
                    </View>
                    <View style={styles.repetitionSliderContainer}>
                        <View style={styles.soundTrench}>
                            <View style={styles.sliderTrenchShadow} />
                        </View>
                        <Slider
                            style={styles.hueSlider}
                            minimumValue={1}
                            maximumValue={5}
                            step={1}
                            value={soundRepetition}
                            onValueChange={handleRepetitionChangeValue}
                            minimumTrackTintColor="rgba(255,255,255,0.3)"
                            maximumTrackTintColor="transparent"
                            thumbTintColor="#fff"
                        />
                    </View>
                </View>
            </View>
        </View>
    );

    if (isLandscape) {
        return (
            <View>
                <Text style={styles.sectionTitleLandscape}>COMPLETION SOUND</Text>
                {renderSoundSection()}

                <View style={[styles.sectionDivider, { marginVertical: 24 }]} />

                <Text style={styles.sectionTitleLandscape}>SOUND REPETITION</Text>
                {renderRepetitionSection()}
            </View>
        );
    }

    return (
        <>
            <Text style={styles.sectionTitle}>COMPLETION SOUND</Text>
            {renderSoundSection()}
            <View style={[styles.sectionDivider, { marginVertical: 16 }]} />
            <Text style={styles.sectionTitle}>SOUND REPETITION</Text>
            {renderRepetitionSection()}
        </>
    );
}
