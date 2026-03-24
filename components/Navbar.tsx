"use client";

import { useEffect, useState } from "react";

export default function Navbar() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "dark";

    document.body.classList.remove("light", "dark");
    document.body.classList.add(savedTheme);

    setTheme(savedTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";

    document.body.classList.remove("light", "dark");
    document.body.classList.add(newTheme);

    localStorage.setItem("theme", newTheme);
    setTheme(newTheme);
  };

  return (
    <nav className="navbar">
      <div className="logo">
        MediScan <span className="badge">AI</span>
      </div>

      <div className="nav-links">
        <a>Scan a Report</a>
        <a>Features</a>
        <a>Lab Analysis</a>
        <a>About</a>
      </div>

      <div className="nav-actions">
        <span className="status">🟢 System Operational</span>

        <button className="signin">Sign In</button>

        <button className="start">Get Started →</button>

        <button onClick={toggleTheme} className="theme-toggle">
          {theme === "dark" ? "🌞" : "🌙"}
        </button>
      </div>
    </nav>
  );
}