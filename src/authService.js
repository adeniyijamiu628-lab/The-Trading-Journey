// src/authService.js
import { supabase } from "./supabaseClient";

// --- Sign Up (Email/Password) ---
export const signUp = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  } catch (err) {
    console.error("SignUp error:", err);
    return { data: null, error: err };
  }
};

// --- Sign In (Email/Password) ---
export const signIn = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  } catch (err) {
    console.error("SignIn error:", err);
    return { data: null, error: err };
  }
};

// --- Sign Out ---
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    return { error };
  } catch (err) {
    console.error("SignOut error:", err);
    return { error: err };
  }
};

// --- Sign In with Google (OAuth) ---
export const signInWithGoogle = async () => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin, // Redirect back to your app after login
      },
    });
    return { data, error };
  } catch (err) {
    console.error("Google SignIn error:", err);
    return { data: null, error: err };
  }
};

// --- Get Current Session ---
export const getCurrentSession = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    return { data, error };
  } catch (err) {
    console.error("GetSession error:", err);
    return { data: null, error: err };
  }
};

// --- Listen to Auth State Changes ---
export const onAuthStateChange = (callback) => {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  return data.subscription; // ✅ subscription object
};
