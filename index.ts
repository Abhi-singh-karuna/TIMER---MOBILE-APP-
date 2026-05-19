import 'react-native-gesture-handler';
import { LogBox } from 'react-native';
import { registerRootComponent } from 'expo';

import RootWithSubscription from './src/RootWithSubscription';

LogBox.ignoreLogs([
  'SafeAreaView has been deprecated',
  'SafeAreaView has been deprecated and will be removed',
]);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App).
// RootWithSubscription wraps <App /> with <SubscriptionProvider> so the
// useSubscription / useFeatureGate hooks have a context to read from.
registerRootComponent(RootWithSubscription);
