import { TEMPLATES, type DatabaseTemplate } from "./templates";

interface DatabaseTemplatePickerProps {
  onPick: (template: DatabaseTemplate) => void;
  onClose: () => void;
}

/**
 * Simple modal that lists the built-in templates as a grid of cards.
 * Clicking a card forwards the chosen template to the host, which
 * invokes the `databases.create` IPC with the template's input shape.
 */
export function DatabaseTemplatePicker({ onPick, onClose }: DatabaseTemplatePickerProps) {
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="db-template-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <h2>新建数据库</h2>
            <p>从模板开始，或选择「空白」</p>
          </div>
          <button onClick={onClose}>关闭</button>
        </div>
        <div className="db-template-grid">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="db-template-card"
              onClick={() => onPick(tpl)}
            >
              <div className="db-template-emoji">{tpl.emoji}</div>
              <div className="db-template-name">{tpl.name}</div>
              <div className="db-template-desc">{tpl.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
