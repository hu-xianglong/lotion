export const OPTION_COLORS = [
  { id: "gray", label: "Gray", background: "#ece7dd", border: "#d4ccc0", text: "#5d574f" },
  { id: "red", label: "Red", background: "#fdecea", border: "#efb7af", text: "#8f352b" },
  { id: "orange", label: "Orange", background: "#fff0db", border: "#eac08a", text: "#7a4b13" },
  { id: "yellow", label: "Yellow", background: "#fff8cc", border: "#e1cf69", text: "#6a5800" },
  { id: "green", label: "Green", background: "#e9f6eb", border: "#a9d4b0", text: "#28623a" },
  { id: "blue", label: "Blue", background: "#e9f2ff", border: "#adc8ee", text: "#2d5f9a" },
  { id: "purple", label: "Purple", background: "#f2ecfb", border: "#c8b5e7", text: "#5f3d86" },
  { id: "pink", label: "Pink", background: "#fdeef6", border: "#e7b3ce", text: "#84375c" }
] as const;

export type OptionColorId = (typeof OPTION_COLORS)[number]["id"];

export function getOptionColor(color?: string) {
  return OPTION_COLORS.find((item) => item.id === color) || OPTION_COLORS[0];
}
