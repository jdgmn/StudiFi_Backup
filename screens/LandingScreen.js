import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function LandingScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image 
          source={require('../assets/splash-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.features}>
          <Text style={styles.feature}>📊 Track your spending (Needs / Wants / Savings)</Text>
          <Text style={styles.feature}>🎮 Learn investing the fun way (gamified lessons)</Text>
          <Text style={styles.feature}>🎯 Reach goals faster (visual goal tracker)</Text>
          <Text style={styles.feature}>💸 Save more with student discounts</Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.buttonText}>GET STARTED</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  features: {
    marginBottom: 50,
    alignSelf: 'stretch',
  },
  feature: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 12,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#00A300',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 30,
    elevation: 3,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  logo: { width: 250, height: 250, marginBottom: 20 },
});