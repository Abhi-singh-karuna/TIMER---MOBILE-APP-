import { MaterialIcons } from '@expo/vector-icons';
import { Category, QuickMessage } from '../../../constants/data';
import { TimeOfDayBackgroundConfig } from '../../../utils/timeOfDaySlots';

// Settings screen props interface
export interface SettingsScreenProps {
    onBack: () => void;
    fillerColor: string;
    sliderButtonColor: string;
    timerTextColor: string;
    onFillerColorChange: (color: string) => void;
    onSliderButtonColorChange: (color: string) => void;
    onTimerTextColorChange: (color: string) => void;
    activePresetIndex: number;
    onPresetChange: (index: number) => void;
    selectedSound: number;
    soundRepetition: number;
    onSoundChange: (index: number) => void;
    onRepetitionChange: (count: number) => void;
    categories: Category[];
    onCategoriesChange: (categories: Category[]) => void;
    isPastTimersDisabled: boolean;
    onPastTimersDisabledChange: (val: boolean) => void;
    isPastTasksDisabled: boolean;
    onPastTasksDisabledChange: (val: boolean) => void;
    dailyStartMinutes: number;
    onDailyStartMinutesChange: (minutes: number) => void;
    quickMessages: QuickMessage[];
    onQuickMessagesChange: (messages: QuickMessage[]) => void;
    timeOfDayBackgroundConfig: TimeOfDayBackgroundConfig;
    onTimeOfDayBackgroundConfigChange: (config: TimeOfDayBackgroundConfig) => void;
}

// Theme section props
export interface ThemeSectionProps {
    isLandscape: boolean;
    fillerColor: string;
    sliderButtonColor: string;
    timerTextColor: string;
    activePresetIndex: number;
    previewWidth: number;
    onFillerColorChange: (color: string) => void;
    onSliderButtonColorChange: (color: string) => void;
    onTimerTextColorChange: (color: string) => void;
    onPresetChange: (index: number) => void;
    onResetToDefaults: () => void;
    resetKey?: number;
}

// Audio section props
export interface AudioSectionProps {
    isLandscape: boolean;
    selectedSound: number;
    soundRepetition: number;
    onSoundChange: (soundIndex: number) => void;
    onRepetitionChange: (count: number) => void;
}

// Category section props
export interface CategorySectionProps {
    isLandscape: boolean;
    categories: Category[];
    onCategoriesChange: (categories: Category[]) => void;
}

// General section props
export interface GeneralSectionProps {
    isLandscape: boolean;
    isPastTimersDisabled: boolean;
    onPastTimersDisabledChange: (val: boolean) => void;
    isPastTasksDisabled: boolean;
    onPastTasksDisabledChange: (val: boolean) => void;
    dailyStartMinutes: number;
    onDailyStartMinutesChange: (minutes: number) => void;
}

// Quick Message section props
export interface QuickMessageSectionProps {
    isLandscape: boolean;
    quickMessages: QuickMessage[];
    onQuickMessagesChange: (messages: QuickMessage[]) => void;
}

// Info section props
export interface InfoSectionProps {
    isLandscape: boolean;
}

// Storage keys
export const FILLER_COLOR_KEY = '@timer_filler_color';
export const SLIDER_BUTTON_COLOR_KEY = '@timer_slider_button_color';
export const TEXT_COLOR_KEY = '@timer_text_color';
export const PRESET_INDEX_KEY = '@timer_active_preset_index';
export const COMPLETION_SOUND_KEY = '@timer_completion_sound';
export const SOUND_REPETITION_KEY = '@timer_sound_repetition';
export const ENABLE_FUTURE_TIMERS_KEY = '@timer_enable_future';
export const IS_PAST_TIMERS_DISABLED_KEY = '@timer_is_past_disabled';
export const IS_PAST_TASKS_DISABLED_KEY = '@task_is_past_disabled';
export const QUICK_MESSAGES_KEY = '@timer_quick_messages';

// Default colors
export const DEFAULT_FILLER_COLOR = '#FFFFFF';
export const DEFAULT_SLIDER_BUTTON_COLOR = '#FFFFFF';
export const DEFAULT_TEXT_COLOR = '#FFFFFF';

// Category icons list
export const CATEGORY_ICONS: (keyof typeof MaterialIcons.glyphMap)[] = [
    'category', 'work', 'fitness-center', 'menu-book', 'fastfood', 'local-hospital',
    'home', 'laptop', 'shopping-cart', 'brush', 'code', 'sports-esports'
];

// Repetition options
export const REPETITION_OPTIONS = [1, 2, 3, 4, 5];
