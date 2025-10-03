// src/components/AuthPage.jsx
import { useState } from "react";
import { signUp, signIn } from "./authService";

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" or "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      let response;
      if (mode === "signup") {
        response = await signUp(email.trim(), password);
      } else {
        response = await signIn(email.trim(), password);
      }

      const { data, error } = response;
      if (error) {
        setErrorMsg(error.message || "Authentication failed");
      } else if (data?.user) {
        // ✅ Flag signup users to redirect them into settings
        if (mode === "signup") {
          localStorage.setItem("needsSettings", "1");
        }
        onLogin(data.user.id);
      }
    } catch (err) {
      console.error("Auth error:", err);
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 p-6 rounded-2xl shadow-lg w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-6 text-center">
          {mode === "login" ? "Login" : "Create Account"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full p-2 rounded bg-gray-700 text-white focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full p-2 rounded bg-gray-700 text-white focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {errorMsg && (
            <p className="text-red-400 text-sm text-center">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
          >
            {loading
              ? mode === "login"
                ? "Logging in..."
                : "Signing up..."
              : mode === "login"
              ? "Login"
              : "Sign Up"}
          </button>
        </form>

        {/* Toggle link */}
        <p className="text-sm text-center text-gray-400 mt-4">
          {mode === "login" ? (
            <>
              Don’t have an account?{" "}
              <button
                type="button"
                className="text-blue-400 hover:underline"
                onClick={() => setMode("signup")}
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="text-blue-400 hover:underline"
                onClick={() => setMode("login")}
              >
                Login
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export default AuthPage;
