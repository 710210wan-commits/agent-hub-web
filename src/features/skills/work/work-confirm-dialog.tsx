interface WorkConfirmDialogProps {
  busy?: boolean;
  confirmLabel: string;
  copy: string;
  onCancel(): void;
  onConfirm(): void;
  title: string;
}

/** 危险操作确认弹窗：取消在左、危险确认在右。 */
export function WorkConfirmDialog({
  busy = false,
  confirmLabel,
  copy,
  onCancel,
  onConfirm,
  title,
}: WorkConfirmDialogProps) {
  return (
    <div className="work-overlay">
      <button aria-label="关闭确认" className="work-overlay-backdrop" onClick={busy ? undefined : onCancel} type="button" />
      <section aria-modal="true" className="work-modal work-confirm-dialog" role="dialog">
        <header className="work-confirm-head">
          <h2>{title}</h2>
          <p>{copy}</p>
        </header>
        <footer className="work-modal-footer">
          <button className="work-button" disabled={busy} onClick={onCancel} type="button">
            取消
          </button>
          <button
            className="work-button work-button-danger-fill"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
