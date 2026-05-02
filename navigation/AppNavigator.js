import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import ExpensesScreen from '../screens/ExpensesScreen';
import GoalsScreen from '../screens/GoalsScreen';
import DiscountsScreen from '../screens/DiscountsScreen';
import InvestmentScreen from '../screens/InvestmentScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Expenses') iconName = focused ? 'cash' : 'cash-outline';
          else if (route.name === 'Goals') iconName = focused ? 'flag' : 'flag-outline';
          else if (route.name === 'Discounts') iconName = focused ? 'pricetag' : 'pricetag-outline';
          else if (route.name === 'Invest') iconName = focused ? 'trending-up' : 'trending-up-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#00A300',
      })}
    >
      <Tab.Screen name="Expenses" component={ExpensesScreen} />
      <Tab.Screen name="Goals" component={GoalsScreen} />
      <Tab.Screen name="Discounts" component={DiscountsScreen} />
      <Tab.Screen name="Invest" component={InvestmentScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}