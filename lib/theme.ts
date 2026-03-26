export const THEME_STORAGE_KEY = "ms-theme";
export const THEME_CHANGE_EVENT = "medscan:theme-change";
export const DEFAULT_THEME = "dark";

export type ThemeMode = "dark" | "light";

export function normalizeTheme(value?: string | null): ThemeMode {
  return value === "light" ? "light" : DEFAULT_THEME;
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") {
    return theme;
  }

  const normalizedTheme = normalizeTheme(theme);
  document.body.classList.remove("dark", "light");
  document.body.classList.add(normalizedTheme);
  document.documentElement.style.colorScheme = normalizedTheme;
  return normalizedTheme;
}

export function readStoredTheme() {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function readActiveTheme() {
  if (typeof document === "undefined") {
    return DEFAULT_THEME;
  }

  return document.body.classList.contains("light") ? "light" : "dark";
}

export function setThemePreference(theme: ThemeMode) {
  const normalizedTheme = normalizeTheme(theme);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
  }

  applyTheme(normalizedTheme);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, {
        detail: { theme: normalizedTheme },
      })
    );
  }

  return normalizedTheme;
}

export function getThemeBootstrapScript() {
  return `
    (function() {
      try {
        var theme = localStorage.getItem("${THEME_STORAGE_KEY}") === "light" ? "light" : "${DEFAULT_THEME}";
        var body = document.body;
        if (!body) return;
        body.classList.remove("dark", "light");
        body.classList.add(theme);
        document.documentElement.style.colorScheme = theme;
      } catch (error) {
        var fallbackBody = document.body;
        if (!fallbackBody) return;
        fallbackBody.classList.remove("dark", "light");
        fallbackBody.classList.add("${DEFAULT_THEME}");
        document.documentElement.style.colorScheme = "${DEFAULT_THEME}";
      }
    })();
  `;
}
