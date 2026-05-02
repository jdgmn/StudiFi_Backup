# StudiFi - Student Financial Management App

<div align="center">

**Personal Finance Tracker for Students built with Expo & React Native**

[![Expo](https://img.shields.io/badge/Expo-54.0-blue.svg)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.81.5-green.svg)](https://reactnative.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-12.x-orange.svg)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## Features

 **Expense Tracking** - Log income and expenses with categories  
 **Budget Management** - Weekly / Monthly budget with automatic reset  
 **Visual Analytics** - Beautiful Charts for spending trends  
 **Offline First** - Full functionality works without internet  
 **Cloud Sync** - Auto sync when back online  
 **Goals Tracking** - Set savings goals  
 **Student Discounts** - Discount directory for students  
 **Investment Education** - Investment basics learning module  
 **Secure Authentication** - Firebase email/password auth  

---

## Getting Started

### Prerequisites
- Node.js 18+
- Expo CLI
- Android Studio / Xcode (for device testing)
- Firebase Project

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/studifi.git
cd studifi
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup Environment Variables**
```bash
cp .env.example .env
```
Edit `.env` with your Firebase configuration values:
```
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

4. **Start Development Server**
```bash
npx expo start
```

5. **Run on device**
- Scan QR code with Expo Go app (Android/iOS)
- Or press `a` for Android emulator / `i` for iOS simulator

---

## Project Structure

```
StudiFi/
├── assets/                 # Images and static assets
├── context/                # React Context Providers
│   ├── AuthContext.js      # Authentication state
│   └── OfflineContext.js   # Offline mode management
├── hooks/                  # Custom React Hooks
├── navigation/             # React Navigation structure
├── screens/                # App Screens
│   ├── ExpensesScreen.js   # Main expenses dashboard
│   ├── GoalsScreen.js
│   ├── DiscountsScreen.js
│   ├── InvestmentScreen.js
│   ├── ProfileScreen.js
│   ├── LoginScreen.js
│   └── RegisterScreen.js
├── utils/                  # Utility functions
│   ├── offlineStorage.js   # Local storage operations
│   └── syncOfflineToCloud.js # Sync logic
├── App.js                  # Root component
├── firebase.js             # Firebase initialization
├── TEST_CASES.md           # Comprehensive test suite
└── package.json
```

---

## Built With

- **[Expo SDK 54](https://expo.dev/)** - React Native framework
- **[React Native](https://reactnative.dev/)** - Cross platform mobile
- **[Firebase](https://firebase.google.com/)** - Auth, Firestore, Storage
- **[React Navigation 7](https://reactnavigation.org/)** - Screen navigation
- **[React Native Chart Kit](https://github.com/indiespirit/react-native-chart-kit)** - Data visualization
- **[React Native Paper](https://callstack.github.io/react-native-paper/)** - UI Components

<div align="center">
</div>