export interface ColorTheme {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  preview: {
    background: string;
    text: string;
    border: string;
  };
}

export const colorThemes: ColorTheme[] = [
  {
    id: "classic",
    name: "Classic Blue",
    description: "Professional blue theme with clean accents",
    colors: {
      primary: "#2563eb", // Blue-600
      secondary: "#64748b", // Slate-500
      accent: "#059669", // Emerald-600
    },
    preview: {
      background: "bg-blue-50",
      text: "text-blue-900",
      border: "border-blue-200",
    },
  },
  {
    id: "forest",
    name: "Forest Green",
    description: "Natural green palette for eco-friendly brands",
    colors: {
      primary: "#059669", // Emerald-600
      secondary: "#374151", // Gray-700
      accent: "#dc2626", // Red-600
    },
    preview: {
      background: "bg-emerald-50",
      text: "text-emerald-900",
      border: "border-emerald-200",
    },
  },
  {
    id: "sunset",
    name: "Sunset Orange",
    description: "Warm orange tones for creative businesses",
    colors: {
      primary: "#ea580c", // Orange-600
      secondary: "#78716c", // Stone-500
      accent: "#7c3aed", // Violet-600
    },
    preview: {
      background: "bg-orange-50",
      text: "text-orange-900",
      border: "border-orange-200",
    },
  },
  {
    id: "royal",
    name: "Royal Purple",
    description: "Elegant purple scheme for luxury brands",
    colors: {
      primary: "#7c3aed", // Violet-600
      secondary: "#6b7280", // Gray-500
      accent: "#f59e0b", // Amber-500
    },
    preview: {
      background: "bg-violet-50",
      text: "text-violet-900",
      border: "border-violet-200",
    },
  },
  {
    id: "midnight",
    name: "Midnight Dark",
    description: "Modern dark theme with bright accents",
    colors: {
      primary: "#1e293b", // Slate-800
      secondary: "#475569", // Slate-600
      accent: "#06b6d4", // Cyan-500
    },
    preview: {
      background: "bg-slate-100",
      text: "text-slate-800",
      border: "border-slate-300",
    },
  },
];

export function getThemeById(id: string): ColorTheme | undefined {
  return colorThemes.find(theme => theme.id === id);
}

export function getThemeColors(themeId: string): ColorTheme['colors'] {
  const theme = getThemeById(themeId);
  return theme?.colors || colorThemes[0].colors; // Default to classic theme
}