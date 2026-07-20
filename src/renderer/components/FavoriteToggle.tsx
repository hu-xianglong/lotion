import { Star } from "lucide-react";
import { useI18n } from "../lib/i18n";

export function FavoriteToggle({
  favorited = false,
  onToggle
}: {
  favorited?: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const label = favorited ? t("page.unfavorite") : t("page.favorite");

  return (
    <button
      type="button"
      className={favorited ? "favorite-toggle on" : "favorite-toggle"}
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={favorited}
    >
      <Star size={16} strokeWidth={1.8} fill={favorited ? "currentColor" : "none"} />
    </button>
  );
}
