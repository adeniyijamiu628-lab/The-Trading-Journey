// src/utils/themeUtils.js
export function loadTheme() {
  return localStorage.getItem('theme') || 'dark';
}

export function saveTheme(theme) {
  localStorage.setItem('theme', theme);
}

export function toggleTheme(current) {
  const newTheme = current === 'dark' ? 'light' : 'dark';
  saveTheme(newTheme);
  document.documentElement.classList.toggle('dark', newTheme === 'dark');
  return newTheme;
}
