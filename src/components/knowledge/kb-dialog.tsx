"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function KbDialog({
  title,
  onClose,
  children,
  footer,
  dismissible = true,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  wide?: boolean;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissible) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dismissible, onClose]);

  return (
    <div
      className="kb-dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && dismissible) {
          onClose();
        }
      }}
    >
      <div
        aria-modal="true"
        className={`kb-dialog${wide ? " is-wide" : ""}`}
        role="dialog"
      >
        <header className="kb-dialog-header">
          <h2>{title}</h2>
          {dismissible ? (
            <button
              aria-label="关闭"
              className="kb-dialog-close"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          ) : null}
        </header>
        <div className="kb-dialog-body">{children}</div>
        {footer ? <div className="kb-dialog-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
