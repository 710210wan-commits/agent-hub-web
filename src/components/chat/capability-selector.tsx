"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

export interface CapabilityOption {
  id: string;
  label: string;
}

export function CapabilitySelector({
  label,
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  options: CapabilityOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonLabel = selectedIds.length > 0 ? `${label} · ${selectedIds.length}` : label;

  return (
    <div className="capability-selector">
      <button
        aria-expanded={open}
        className={selectedIds.length > 0 ? "capability-trigger is-selected" : "capability-trigger"}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {buttonLabel}
        <ChevronDown aria-hidden="true" size={12} />
      </button>
      {open ? (
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
