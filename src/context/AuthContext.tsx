import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth, firebaseConfigError, isDemoAuthEnabled } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  configError: string | null;
  demoMode: boolean;
  diagnosticMode: boolean;
  enableDiagnostics: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const placeholderUser = {
    uid: 'placeholder-user',
    email: 'placeholder@smartops.local',
    displayName: 'SmartOps User',
  } as unknown as User;

  const [user, setUser] = useState<User | null>(isDemoAuthEnabled ? placeholderUser : null);
  const [loading, setLoading] = useState(!isDemoAuthEnabled);
  const [configError, setConfigError] = useState<string | null>(
    isDemoAuthEnabled ? null : firebaseConfigError,
  );
  const [diagnosticMode, setDiagnosticMode] = useState(false);

  useEffect(() => {
    if (isDemoAuthEnabled) {
      setLoading(false);
      return;
    }

    if (!auth) {
      setConfigError((prev) => prev ?? 'Firebase authentication is not configured.');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (nextUser) {
        setDiagnosticMode(false);
      }
    });

    return unsubscribe;
  }, []);

  const enableDiagnostics = () => {
    setDiagnosticMode(true);
    setUser(placeholderUser);
    setLoading(false);
  };

  const signIn = async (email: string, password: string) => {
    if (isDemoAuthEnabled || diagnosticMode) {
      setUser(placeholderUser);
      return;
    }
    if (!auth) {
      throw new Error(configError ?? 'Authentication service is not configured.');
    }
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string) => {
    if (isDemoAuthEnabled || diagnosticMode) {
      setUser(placeholderUser);
      return;
    }
    if (!auth) {
      throw new Error(configError ?? 'Authentication service is not configured.');
    }
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    if (isDemoAuthEnabled || diagnosticMode) {
      setUser(placeholderUser);
      return;
    }
    if (!auth) {
      throw new Error(configError ?? 'Authentication service is not configured.');
    }
    await firebaseSignOut(auth);
  };

  const resetPassword = async (email: string) => {
    if (isDemoAuthEnabled || diagnosticMode) {
      return;
    }
    if (!auth) {
      throw new Error(configError ?? 'Authentication service is not configured.');
    }
    await sendPasswordResetEmail(auth, email);
  };

  const value = {
    user,
    loading,
    configError,
    demoMode: isDemoAuthEnabled,
    diagnosticMode,
    enableDiagnostics,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
