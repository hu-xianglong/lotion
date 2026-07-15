import type { SelectOption } from "../../../shared/types";
import { getOptionColor } from "./option-colors";

interface OptionPillProps {
  option: SelectOption;
  muted?: boolean;
}

export function OptionPill({ option, muted = false }: OptionPillProps) {
  const color = getOptionColor(option.color);
  return (
    <span
      className={muted ? "option-pill muted" : "option-pill"}
      style={{
        backgroundColor: color.background,
        borderColor: color.border,
        color: color.text
      }}
    >
      {option.name}
    </span>
  );
}
