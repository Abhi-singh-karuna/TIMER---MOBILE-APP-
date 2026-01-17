import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Screens
import EmptyState from '../screens/EmptyState';
import TimerList from '../screens/TimerList';
import ActiveTimer from '../screens/ActiveTimer';
import TaskComplete from '../screens/TaskComplete';

// Define the navigation param list types
export type RootStackParamList = {
    Home: undefined;
    TimerList: undefined;
    ActiveTimer: {
        timerName: string;
        totalTime: string;
    };
    TaskComplete: {
        completedAt: string;
        startTime?: string;
    };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface AppNavigatorProps {
    hasTimers: boolean;
    onAddTimer: () => void;
    onDeleteTimer: (timer: any) => void;
    onStartTimer: (timer: any) => void;
    timers: any[];
}

export default function AppNavigator({
    hasTimers,
    onAddTimer,
    onDeleteTimer,
    onStartTimer,
    timers
}: AppNavigatorProps) {
    return (
        <NavigationContainer>
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                }}
            >
                {hasTimers ? (
                    <Stack.Screen name="TimerList">
                        {(props) => (
                            <TimerList
                                {...props}
                                timers={timers}
                                onAddTimer={onAddTimer}
                                onDeleteTimer={onDeleteTimer}
                                onStartTimer={onStartTimer}
                                onPlayPause={() => { }}
                            />
                        )}
                    </Stack.Screen>
                ) : (
                    <Stack.Screen name="Home">
                        {() => <EmptyState onAddTimer={onAddTimer} />}
                    </Stack.Screen>
                )}

                <Stack.Screen name="ActiveTimer">
                    {(props) => (
                        <ActiveTimer
                            timerName="Deep Work"
                            currentTime="24:59"
                            progress={75}
                            endTime="21:09"
                            isRunning={false}
                            onBack={() => props.navigation.goBack()}
                            onPlayPause={() => { }}
                            onCancel={() => props.navigation.goBack()}
                            onComplete={() => props.navigation.navigate('TaskComplete', { completedAt: '21:09', startTime: '20:30' })}
                            onBorrowTime={() => { }}
                            fillerColor="#FFFFFF"
                            sliderButtonColor="#FFFFFF"
                            timerTextColor="#FFFFFF"
                        />
                    )}
                </Stack.Screen>

                <Stack.Screen name="TaskComplete">
                    {(props) => (
                        <TaskComplete
                            completedAt={(props.route.params as any)?.completedAt || '21:09'}
                            startTime={(props.route.params as any)?.startTime || '20:30'}
                            onRestart={() => props.navigation.goBack()}
                            onDone={() => props.navigation.navigate('TimerList' as any)}
                            onBorrowTime={() => { }}
                            selectedSound={0}
                            soundRepetition={1}
                        />
                    )}
                </Stack.Screen>
            </Stack.Navigator>
        </NavigationContainer>
    );
}
