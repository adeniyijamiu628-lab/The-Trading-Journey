// src/authService.js
import { supabase } from "./supabaseClient";

// --- Sign Up ---
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

// --- Sign In ---
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
  const { data, error } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  if (error) {
    console.error("Auth state change error:", error);
  }

  return data.subscription; // ✅ return subscription directly
};
