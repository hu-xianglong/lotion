import { useState } from "react";
import { useI18n } from "../../lib/i18n";

export function BackupButton() {
  const { t } = useI18n();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function backup() {
    setIsBusy(true);
    const result = await window.lotion.git.backupNow();
    setStatusMessage(result.message);
    setIsBusy(false);
  }

  return (
    <button className="backup-button" disabled={isBusy} onClick={backup}>
      {isBusy ? t("sidebar.backupBusy") : statusMessage || t("sidebar.backup")}
    </button>
  );
}
