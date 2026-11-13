"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

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
  const buttonLabel = selectedIds.length > 0 ? `${label} · ${selectedIds.length}` : label;

  return (
    <div className="capability-selector">
      <button
        aria-expanded={disabled ? false : open}
        className={selectedIds.length > 0 ? "capability-trigger is-selected" : "capability-trigger"}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
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
