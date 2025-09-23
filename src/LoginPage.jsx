import { useState } from "react";
import { registerUser, loginUser } from "./authService";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSignup = async () => {
    try {
      const user = await registerUser(email, password);
      onLogin(user.uid); // pass UID to parent
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogin = async () => {
    try {
      const user = await loginUser(email, password);
      onLogin(user.uid);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 p-8 rounded-xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Trading Journal</h1>

        {error && <p className="text-red-400 mb-4">{error}</p>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 mb-3 rounded bg-gray-700 text-white"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 mb-6 rounded bg-gray-700 text-white"
        />

        <div className="flex justify-between">
          <button
            onClick={handleSignup}
            className="px-4 py-2 bg-green-600 rounded hover:bg-green-500"
          >
            Sign Up
          </button>
          <button
            onClick={handleLogin}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500"
          >
            Log In
          </button>
        </div>
      </div>
    </div>
  );
}
