import { useId, useState, type ReactNode } from "react";

/** One-line summary + big «i» circle; tap to reveal the full explanation inline. */
export function InfoTip({
  summary,
  children,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`info-tip${open ? " open" : ""} ${className}`}>
      <button
        type="button"
        className="info-tip-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="info-tip-icon" aria-hidden="true">
          i
        </span>
        <span className="info-tip-summary">{summary}</span>
      </button>
      <div className="info-tip-body" id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
