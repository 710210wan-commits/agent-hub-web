"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface CapabilityOption {
  id: string;
  label: string;
}

export function CapabilitySelector({
  label,
  disabled = false,
  statusText,
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  disabled?: boolean;
  statusText?: string;
  options: CapabilityOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const buttonLabel = selectedIds.length > 0 ? `${label} · ${selectedIds.length}` : label;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="capability-selector" ref={rootRef}>
      <button
        aria-expanded={disabled ? false : open}
        className={selectedIds.length > 0 ? "capability-trigger is-selected" : "capability-trigger"}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        {buttonLabel}
        <ChevronDown aria-hidden="true" size={12} />
      </button>
      {statusText ? <span className="composer-capability-note">{label}：{statusText}</span> : null}
      {open && !disabled ? (
        <div className="capability-menu">
          {options.map((option) => {
            const checked = selectedIds.includes(option.id);
            return (
              <label key={option.id}>
                <input
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selectedIds.filter((id) => id !== option.id)
                        : [...selectedIds, option.id],
                    )
                  }
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
