import { useRef, useEffect } from 'react';
import { PanResponder } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

const TAB_ROUTES = ['Expenses', 'Goals', 'Discounts', 'Invest', 'Profile'];

export const useSwipeTabNavigation = (enabled = true) => {
  const navigation = useNavigation();
  const route = useRoute();
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (!enabledRef.current) return false;
        const { dx } = gestureState;
        return Math.abs(dx) > 20;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (!enabledRef.current) return;
        const { dx } = gestureState;
        const currentIndex = TAB_ROUTES.indexOf(route.name);
        if (dx > 50 && currentIndex > 0) {
          navigation.navigate(TAB_ROUTES[currentIndex - 1]);
        } else if (dx < -50 && currentIndex < TAB_ROUTES.length - 1) {
          navigation.navigate(TAB_ROUTES[currentIndex + 1]);
        }
      },
    })
  ).current;

  return panResponder;
};