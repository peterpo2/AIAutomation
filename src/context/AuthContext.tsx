import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { auth, firebaseConfigError } from '../lib/firebase';
import { apiFetch } from '../lib/apiClient';
import type { UserProfile } from '../types/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  configError: string | null;
  profile: UserProfile | null;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  signUp: (email: string, password: string, remember?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(firebaseConfigError);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!auth) {
      setConfigError((prev) => prev ?? 'Firebase authentication is not configured.');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
    }
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (!auth) {
      setProfile(null);
      return;
    }

    const activeUser = auth.currentUser ?? user;
    if (!activeUser) {
      setProfile(null);
      return;
    }

    setProfileLoading(true);
    try {
      const token = await activeUser.getIdToken();
      const response = await apiFetch('/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load profile');
      }

      const data = (await response.json()) as UserProfile;
      setProfile({
        email: data.email,
        role: data.role,
        createdAt: data.createdAt,
        permissions: data.permissions,
        immutableRole: data.immutableRole,
      });
    } catch (error) {
      console.error('Failed to refresh user profile', error);
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void refreshProfile();
    }
  }, [user, refreshProfile]);

  const signIn = async (email: string, password: string, remember = false) => {
    if (!auth) {
      throw new Error(configError ?? 'Authentication service is not configured.');
    }
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, remember = false) => {
    if (!auth) {
      throw new Error(configError ?? 'Authentication service is not configured.');
    }
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    if (!auth) {
      throw new Error(configError ?? 'Authentication service is not configured.');
    }
    await firebaseSignOut(auth);
    setProfile(null);
  };

  const resetPassword = async (email: string) => {
    if (!auth) {
      throw new Error(configError ?? 'Authentication service is not configured.');
    }
    await sendPasswordResetEmail(auth, email);
  };

  const value = {
    user,
    loading,
    configError,
    profile,
    profileLoading,
    refreshProfile,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
