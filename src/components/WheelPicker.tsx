import React, { useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

const ITEM_HEIGHT = 44;

export interface WheelPickerProps {
    data: number[];
    value: number;
    onChange: (v: number) => void;
    width?: number;
    itemHeight?: number;
}

export function WheelPicker({
    data,
    value,
    onChange,
    width = 70,
    itemHeight = ITEM_HEIGHT,
}: WheelPickerProps) {
    const scrollRef = useRef<ScrollView>(null);
    const lastIndex = useRef(data.indexOf(value) >= 0 ? data.indexOf(value) : -1);

    // If itemHeight changes, we might need to adjust styles. 
    // For now, we assume standard height or that styles are updated.
    // Ideally, styles should be dynamic based on itemHeight.
    const height = itemHeight * 3;

    useEffect(() => {
        const idx = data.indexOf(value);
        if (idx >= 0) {
            const timer = setTimeout(() => {
                scrollRef.current?.scrollTo({ y: idx * itemHeight, animated: false });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [value, data, itemHeight]);

    const handleScroll = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const idx = Math.round(e.nativeEvent.contentOffset.y / itemHeight);
            const clamped = Math.max(0, Math.min(idx, data.length - 1));
            if (clamped !== lastIndex.current) {
                lastIndex.current = clamped;
                Haptics.selectionAsync();
            }
        },
        [data.length, itemHeight]
    );

    const handleEnd = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const idx = Math.round(e.nativeEvent.contentOffset.y / itemHeight);
            const clamped = Math.max(0, Math.min(idx, data.length - 1));
            onChange(data[clamped]);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
        [data, onChange, itemHeight]
    );

    return (
        <View style={[pickerStyles.container, { width, height }]}>
            <LinearGradient colors={['#000000', 'transparent']} style={[pickerStyles.fadeTop, { height: itemHeight * 0.7 }]} pointerEvents="none" />
            <LinearGradient colors={['transparent', '#000000']} style={[pickerStyles.fadeBottom, { height: itemHeight * 0.7 }]} pointerEvents="none" />
            <View style={[pickerStyles.highlight, { top: itemHeight, height: itemHeight }]} pointerEvents="none" />
            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                snapToInterval={itemHeight}
                decelerationRate={0.92}
                bounces={true}
                scrollEventThrottle={16}
                onScroll={handleScroll}
                onMomentumScrollEnd={handleEnd}
                onScrollEndDrag={(e) => {
                    if (e.nativeEvent.velocity?.y === 0) handleEnd(e);
                }}
                contentContainerStyle={{ paddingVertical: itemHeight }}
                nestedScrollEnabled={true}
                canCancelContentTouches={false}
            >
                {data.map((n) => (
                    <View key={n} style={[pickerStyles.item, { height: itemHeight }]}>
                        <Text style={pickerStyles.text}>{String(n).padStart(2, '0')}</Text>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

const pickerStyles = StyleSheet.create({
    container: {
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: 'rgba(30,30,30,0.4)',
    },
    highlight: {
        position: 'absolute',
        left: 3,
        right: 3,
        borderRadius: 11,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    fadeTop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 },
    fadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5 },
    item: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontSize: 24,
        fontWeight: '400',
        color: '#FFFFFF',
    },
});
