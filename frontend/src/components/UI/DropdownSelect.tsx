import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
  separator?: boolean;
  action?: {
    icon: React.ReactNode;
    onClick: (e: React.MouseEvent) => void;
    title?: string;
  };
}

interface DropdownSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  header?: React.ReactNode;
}

const DropdownSelect: React.FC<DropdownSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  className = "",
  header,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="btn btn-sm btn-ghost border border-base-300 gap-1.5 font-normal min-w-0"
      >
        <span className="truncate max-w-[200px]">
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full mt-1 z-50 min-w-full bg-base-100 border border-base-300 rounded-lg shadow-lg overflow-hidden">
          {header && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-base-300 text-xs text-base-content/50">
              {header}
            </div>
          )}
        <ul className="py-1 max-h-64 overflow-y-auto obsidian-scrollbar">
          {options.map((opt, i) =>
            opt.separator ? (
              <li key={`sep-${i}`}>
                <hr className="border-base-300 my-1" />
              </li>
            ) : (
              <li key={opt.value} className="flex items-center group">
                <button
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex-1 text-left px-3 py-1.5 text-sm transition-colors whitespace-nowrap ${
                    opt.value === value
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-base-200 text-base-content"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {opt.label}
                </button>
                {opt.action && (
                  <button
                    type="button"
                    onClick={opt.action.onClick}
                    title={opt.action.title}
                    className="px-2 py-1.5 text-base-content/30 hover:text-base-content transition-colors flex-shrink-0"
                  >
                    {opt.action.icon}
                  </button>
                )}
              </li>
            )
          )}
        </ul>
        </div>
      )}
    </div>
  );
};

export default DropdownSelect;
