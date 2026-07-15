import { useI18n } from "../../lib/i18n";

interface SearchBoxProps {
  onOpen: () => void;
}

export function SearchBox({ onOpen }: SearchBoxProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="search-box search-box-button"
      onClick={onOpen}
    >
      {t("sidebar.search")}
    </button>
  );
}
