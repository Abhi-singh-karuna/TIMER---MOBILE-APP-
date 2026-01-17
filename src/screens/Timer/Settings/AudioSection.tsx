import React, { useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import { SOUND_OPTIONS } from '../../../constants/data';
import { styles } from './styles';
import {
    AudioSectionProps,
    COMPLETION_SOUND_KEY,
    SOUND_REPETITION_KEY,
    REPETITION_OPTIONS,
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

    const handleSoundSelect = async (soundIndex: number) => {
        onSoundChange(soundIndex);
        try {
            await AsyncStorage.setItem(COMPLETION_SOUND_KEY, soundIndex.toString());
        } catch (err) { console.error(err); }
    };

    const handleRepetitionSelect = async (count: number) => {
        onRepetitionChange(count);
        try {
            await AsyncStorage.setItem(SOUND_REPETITION_KEY, count.toString());
        } catch (err) { console.error(err); }
    };

    const handlePreviewSound = async (soundIndex: number) => {
        const soundOption = SOUND_OPTIONS[soundIndex];
        if (!soundOption || !soundOption.uri) return;
        try {
            if (soundRef.current) {
                await soundRef.current.stopAsync();
                await soundRef.current.unloadAsync();
                soundRef.current = null;
            }
            setPlayingSound(soundIndex);
            await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
            const { sound } = await Audio.Sound.createAsync({ uri: soundOption.uri }, { shouldPlay: true });
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
                    <TouchableOpacity key={sound.id} style={[styles.soundCard, isLandscape && styles.soundCardLandscape, selectedSound === sound.id && styles.soundCardSelected, selectedSound === sound.id && { borderColor: sound.color }, sound.uri === null && { opacity: 0.8 }]} onPress={() => handleSoundSelect(sound.id)} activeOpacity={0.7}>
                        <View style={[styles.soundIconContainer, selectedSound === sound.id && { backgroundColor: `${sound.color}20` }]}>
                            <MaterialIcons name={sound.icon} size={24} color={selectedSound === sound.id ? sound.color : 'rgba(255,255,255,0.5)'} />
                        </View>
                        <Text style={[styles.soundName, selectedSound === sound.id && { color: sound.color }]}>{sound.name}</Text>
                        {sound.uri ? (
                            <TouchableOpacity style={[styles.previewButton, { backgroundColor: `${sound.color}20`, borderColor: sound.color }]} onPress={() => handlePreviewSound(sound.id)} activeOpacity={0.7}>
                                {playingSound === sound.id ? <ActivityIndicator size="small" color={sound.color} /> : <MaterialIcons name="play-arrow" size={18} color={sound.color} />}
                            </TouchableOpacity>
                        ) : <View style={{ height: 36 }} />}
                        {selectedSound === sound.id && (
                            <View style={[styles.selectedIndicator, { backgroundColor: sound.color }]}><MaterialIcons name="check" size={12} color="#000" /></View>
                        )}
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    const renderRepetitionSection = () => (
        <View style={[styles.repetitionSection, isLandscape && styles.repetitionSectionLandscape]}>
            <View style={styles.repetitionHeader}>
                <View style={styles.repetitionTitleRow}><MaterialIcons name="repeat" size={18} color="#FFFFFF" /><Text style={styles.repetitionTitle}>Repeat Count</Text></View>
                <Text style={styles.repetitionValue}>{soundRepetition}x</Text>
            </View>
            <View style={styles.repetitionOptionsRow}>
                {REPETITION_OPTIONS.map((count) => (
                    <TouchableOpacity key={count} style={[styles.repetitionPill, soundRepetition === count && styles.repetitionPillSelected]} onPress={() => handleRepetitionSelect(count)} activeOpacity={0.7}>
                        <Text style={[styles.repetitionPillText, soundRepetition === count && styles.repetitionPillTextSelected]}>{count}x</Text>
                    </TouchableOpacity>
                ))}
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
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>COMPLETION SOUND</Text>
                {renderSoundSection()}
            </View>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>SOUND REPETITION</Text>
                {renderRepetitionSection()}
            </View>
        </>
    );
}
