// src/components/authService.js
// NOTE: This file must import supabase from a sibling file, 
// so the path must be adjusted based on where you place this file.
// Assuming it's in src/components/, it should point to src/components/supabaseClient.js
import { supabase } from "./supabaseClient"; 

/**
 * Handles user sign-up using email and password.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<{data: object | null, error: object | null}>}
 */
export const signUp = async (email, password) => {
  try {
    // Supabase auth.signUp returns the user and session data on success.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  } catch (err) {
    console.error("Supabase SignUp error:", err);
    return { data: null, error: err };
  }
};

/**
 * Handles user sign-in using email and password.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<{data: object | null, error: object | null}>}
 */
export const signIn = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  } catch (err) {
    console.error("Supabase SignIn error:", err);
    return { data: null, error: err };
  }
};

/**
 * Initiates Sign In with Google via OAuth.
 * @returns {Promise<{data: object | null, error: object | null}>}
 */
export const signInWithGoogle = async () => {
  try {
    // This function triggers a redirect to the Google login page.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Essential for Supabase to redirect back to the app after authentication
        redirectTo: window.location.origin, 
      },
    });
    return { data, error };
  } catch (err) {
    console.error("Supabase Google SignIn error:", err);
    return { data: null, error: err };
  }
};


/**
 * Logs the current user out.
 * @returns {Promise<{error: object | null}>}
 */
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    return { error };
  } catch (err) {
    console.error("Supabase SignOut error:", err);
    return { error: err };
  }
};

/**
 * Gets the current active session data.
 * @returns {Promise<{data: object | null, error: object | null}>}
 */
export const getCurrentSession = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    return { data, error };
  } catch (err) {
    console.error("Supabase GetSession error:", err);
    return { data: null, error: err };
  }
};

/**
 * Sets up a listener for authentication state changes (login, logout, token refresh).
 * @param {function(object | null): void} callback - Function to run with the new user object (or null on logout).
 * @returns {object} The subscription object to allow unsubscription later.
 */
export const onAuthStateChange = (callback) => {
  // onAuthStateChange returns a subscription object { data: { subscription } }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // Pass the user object (or null if no session) to the provided callback
    callback(session?.user ?? null);
  });

  return data.subscription; 
};