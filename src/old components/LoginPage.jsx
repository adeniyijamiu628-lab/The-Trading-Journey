import React, { useState } from "react";
import { supabase } from "./supabaseClient";

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("login"); // "login" or "signup"

  // 🔹 SIGN UP
  const handleSignupClick = async () => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      if (data.user) {
        onLogin(data.user.id); // Supabase UUID
      }
    } catch (err) {
      console.error("Signup failed:", err);
      setError(err.message || "Signup error");
    }
  };

  // 🔹 LOGIN
  const handleLoginClick = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      if (data.user) {
        onLogin(data.user.id); // Supabase UUID
      }
    } catch (err) {
      console.error("Login failed:", err);
      setError(err.message || "Login error");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 p-8 rounded-xl shadow-lg w-96">
        <h1 className="text-2xl font-bold mb-6 text-center">
          {mode === "login" ? "Login" : "Sign Up"}
        </h1>

        {error && (
          <div className="bg-red-500 text-white p-2 rounded mb-4">
            {error}
          </div>
        )}

        <input
          type="email"
          placeholder="Email"
          className="w-full p-2 mb-4 rounded bg-gray-700 text-white"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full p-2 mb-4 rounded bg-gray-700 text-white"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {mode === "login" ? (
          <button
            onClick={handleLoginClick}
            className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold"
          >
            Login
          </button>
        ) : (
          <button
            onClick={handleSignupClick}
            className="w-full bg-green-600 hover:bg-green-700 py-2 rounded font-semibold"
          >
            Sign Up
          </button>
        )}

        <p className="mt-4 text-center text-gray-400">
          {mode === "login" ? (
            <>
              Don’t have an account?{" "}
              <button
                onClick={() => setMode("signup")}
                className="text-blue-400 hover:underline"
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => setMode("login")}
                className="text-blue-400 hover:underline"
              >
                Login
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
