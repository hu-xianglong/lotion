import { useI18n } from "../../lib/i18n";
import { SearchIcon } from "../../components/Icons";

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
      <span className="search-box-content">
        <SearchIcon />
        <span className="search-box-label">{t("sidebar.search")}</span>
      </span>
      <kbd className="search-box-shortcut">⌘K</kbd>
    </button>
  );
}
