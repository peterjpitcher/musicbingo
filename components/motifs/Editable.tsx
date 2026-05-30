"use client";

import { useEffect, useRef } from "react";
import { useEdit } from "./EditContext";

export type EditableProps = {
  /** The store key used to get/set this field's value. */
  field: string;
  /** Shown via CSS ::before when the element is empty. */
  placeholder?: string;
  /** HTML element to render; defaults to "span". */
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Renders editable text for host-side in-play editing.
 *
 * Behaviour mirrors the original shared.jsx Editable component:
 * - Uncontrolled while focused so the browser caret stays stable.
 * - Syncs `textContent` from the store only when the element is not focused.
 * - Pressing Enter blurs inline elements (div elements accept newlines).
 * - `data-edit` / `data-placeholder` attributes hook into existing globals.css rules.
 */
export function Editable({
  field,
  placeholder,
  as = "span",
  className = "",
  style,
}: EditableProps): JSX.Element {
  const { editing, get, set } = useEdit();
  const ref = useRef<HTMLElement>(null);
  const value = get(field, placeholder);

  /* Sync from store only when the element is not the active (focused) element. */
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.textContent = value;
    }
  }, [value]);

  const Tag = as as React.ElementType;

  return (
    <Tag
      ref={ref}
      data-edit
      data-placeholder={placeholder}
      className={className}
      style={style}
      contentEditable={editing}
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(e: React.FocusEvent<HTMLElement>) =>
        set(field, e.currentTarget.textContent?.trim() ?? "")
      }
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        /* Pressing Enter in non-div elements commits and blurs rather than inserting a newline. */
        if (e.key === "Enter" && as !== "div") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
