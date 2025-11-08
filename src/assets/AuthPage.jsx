// src/components/AuthPage.jsx
import { useState } from "react";
import { signUp, signIn, signInWithGoogle } from "./authService"; 

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" or "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // --- Handle Email/Password Login or Signup ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const trimmedEmail = email.trim();
      let response;

      // Auth request
      if (mode === "signup") {
        response = await signUp(trimmedEmail, password);
      } else {
        response = await signIn(trimmedEmail, password);
      }

      const { data, error } = response;

      if (error) {
        setErrorMsg(error.message || "Authentication failed.");
        return;
      }

      // ✅ When user logs in or signs up successfully
      if (data?.user) {
        if (mode === "signup") {
          // Flag to show UserSettingsForm for new users
          localStorage.setItem("needsSettings", "1");
        }

        // ✅ Pass user to parent (App.jsx)
        onLogin(data.user);
        return;
      }

      // If Supabase email confirmation is enabled:
      setErrorMsg(
        "Registration successful! Please check your email for a confirmation link."
      );
      setMode("login");
    } catch (err) {
      console.error("Auth error:", err);
      setErrorMsg("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- Google OAuth Sign-In ---
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const { error } = await signInWithGoogle();
      if (error) setErrorMsg(error.message || "Google sign-in failed.");
      // Supabase automatically redirects; session restored in App.jsx
    } catch (err) {
      console.error("Google Auth error:", err);
      setErrorMsg("Failed to initiate Google sign-in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700">
      <h2 className="text-3xl font-extrabold mb-6 text-center text-purple-400">
        {mode === "login" ? "Welcome Back" : "Start Tracking"}
      </h2>

      {/* Email/Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="Email address"
          className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:ring-purple-500 focus:border-purple-500 transition-colors"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:ring-purple-500 focus:border-purple-500 transition-colors"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {errorMsg && (
          <p className="text-red-400 text-sm text-center font-medium">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-semibold disabled:opacity-50 transition-all shadow-md"
        >
          {loading
            ? mode === "login"
              ? "Authenticating..."
              : "Registering..."
            : mode === "login"
            ? "Login"
            : "Sign Up"}
        </button>
      </form>

      {/* Separator */}
      <div className="flex items-center my-6">
        <div className="flex-grow border-t border-gray-700"></div>
        <span className="flex-shrink mx-4 text-gray-500 text-sm">OR</span>
        <div className="flex-grow border-t border-gray-700"></div>
      </div>

      {/* Google Sign-in */}
      <div>
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full px-4 py-3 border border-gray-600 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium disabled:opacity-50 transition-all flex items-center justify-center space-x-3"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            className="h-5 w-5"
          >
            <path
              fill="#FFC107"
              d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,7.917-11.303,7.917
                c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.158,7.934,3.046l5.775-5.774
                C34.64,6.002,29.385,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20
                c11.045,0,19.091-8.159,19.091-19.091c0-1.362-0.166-2.671-0.45-3.923"
            />
            <path
              fill="#FF3D00"
              d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12
                c3.059,0,5.842,1.158,7.934,3.046l5.775-5.774
                C34.64,6.002,29.385,4,24,4
                C16.318,4,9.665,8.305,6.306,14.691"
            />
            <path
              fill="#4CAF50"
              d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238
                C29.211,35.091,26.715,36,24,36
                c-5.202,0-9.629-2.986-11.972-7.398l-6.239,4.893
                C11.697,38.743,17.205,44,24,44"
            />
            <path
              fill="#1976D2"
              d="M43.611,20.083H42V20H24v8h11.303
                c-0.792,2.237-2.231,4.166-4.087,5.571
                c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238
                C36.971,38.199,44,34.029,44,24
                C44,22.659,43.862,21.35,43.611,20.083"
            />
          </svg>
          <span>Sign in with Google</span>
        </button>
      </div>

      {/* Mode Toggle */}
      <p className="text-sm text-center text-gray-400 mt-6 pt-4 border-t border-gray-700">
        {mode === "login" ? (
          <>
            Don’t have an account?{" "}
            <button
              type="button"
              className="text-purple-400 font-semibold hover:underline transition-colors"
              onClick={() => {
                setMode("signup");
                setErrorMsg("");
              }}
            >
              Create Account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="text-purple-400 font-semibold hover:underline transition-colors"
              onClick={() => {
                setMode("login");
                setErrorMsg("");
              }}
            >
              Login Here
            </button>
          </>
        )}
      </p>
    </div>
  );
}

export default AuthPage;
