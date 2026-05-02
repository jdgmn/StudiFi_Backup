import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [username, setUsername] = useState('');
  const [profilePicture, setProfilePicture] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUserData = async (firebaseUser) => {
    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        setRole(data.role || 'user');
        setUsername(data.username || firebaseUser.email?.split('@')[0] || 'User');
        setProfilePicture(data.profilePictureUrl || null);
      } else {
        // fallback (shouldn't happen)
        setRole('user');
        setUsername(firebaseUser.email?.split('@')[0] || 'User');
        setProfilePicture(null);
      }
    } catch (error) {
      console.error(error);
      setRole('user');
      setUsername(firebaseUser.email?.split('@')[0] || 'User');
      setProfilePicture(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadUserData(firebaseUser);
      } else {
        setUser(null);
        setRole(null);
        setUsername('');
        setProfilePicture(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Function to refresh user data after profile update
  const refreshUserData = async () => {
    if (user) {
      await loadUserData(user);
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, username, profilePicture, loading, refreshUserData }}>
      {children}
    </AuthContext.Provider>
  );
};