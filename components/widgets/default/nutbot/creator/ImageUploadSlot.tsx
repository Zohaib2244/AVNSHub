"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ImagePlus, X } from "lucide-react";

type Props = {
  label: string;
  value: string | null;  // base64 data URL
  onChange: (dataUrl: string | null) => void;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImageUploadSlot({ label, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) return;
    const dataUrl = await readFileAsDataUrl(file);
    onChange(dataUrl);
  }

  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            const dataUrl = await readFileAsDataUrl(file);
            onChange(dataUrl);
          }
          break;
        }
      }
    },
    [onChange],
  );

  // listen for paste globally when no image is set yet
  useEffect(() => {
    if (value) return;
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [value, handlePaste]);

  return (
    <div className="iu-root">
      <span className="wc-field-label">{label} ref</span>
      {value ? (
        <div className="iu-preview">
          <img src={value} alt={`${label} reference`} className="iu-thumb" />
          <button
            type="button"
            className="iu-clear"
            onClick={() => onChange(null)}
            aria-label="remove image"
          >
            <X size={9} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <div
          className={`iu-drop${dragging ? " dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <ImagePlus size={11} strokeWidth={1.75} />
          <span>browse · drop · paste</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="iu-hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
