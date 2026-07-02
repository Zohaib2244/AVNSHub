"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Props = {
  html: string;
  title: string;
  onClose: () => void;
};

export function MockupLightbox({ html, title, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="wc-lightbox" onMouseDown={onClose}>
      <div className="wc-lightbox-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="wc-lightbox-head">
          <span>{title}</span>
          <button type="button" className="wc-lightbox-close" onClick={onClose} aria-label="close mockup preview">
            <X size={13} strokeWidth={2} />
          </button>
        </div>
        <iframe className="wc-lightbox-frame" sandbox="allow-scripts" srcDoc={html} title={title} />
      </div>
    </div>,
    document.body,
  );
}
