"use client";

import { useWidget } from "@/components/framework/WidgetContext";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Pause,
  Play,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";

type PhotoItem = {
  id: string;
  name: string;
  dataUrl: string;
  addedAt: number;
  width: number;
  height: number;
};

type FitMode = "cover" | "contain";

const STORAGE_KEY = "nutmag-photo-slideshow:v1";
const MAX_PHOTOS = 16;
const MAX_IMAGE_EDGE = 1000;
const IMAGE_QUALITY = 0.78;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPhotoItem(value: unknown): value is PhotoItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.dataUrl === "string" &&
    value.dataUrl.startsWith("data:image/") &&
    typeof value.addedAt === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
}

function readStoredPhotos(): PhotoItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPhotoItem).slice(0, MAX_PHOTOS);
  } catch {
    return [];
  }
}

function createPhotoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanPhotoName(name: string) {
  const withoutExtension = name.replace(/\.[^/.]+$/, "");
  const cleaned = withoutExtension.replace(/[-_]+/g, " ").trim();
  return (cleaned || "photo").slice(0, 42);
}

function isImageFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(avif|gif|jpe?g|png|webp)$/i.test(file.name)
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image could not be read"));
    };
    image.src = url;
  });
}

async function fileToPhoto(file: File): Promise<PhotoItem> {
  const image = await loadImage(file);
  const naturalWidth = image.naturalWidth || 1;
  const naturalHeight = image.naturalHeight || 1;
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("canvas is unavailable");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return {
    id: createPhotoId(),
    name: cleanPhotoName(file.name),
    dataUrl: canvas.toDataURL("image/jpeg", IMAGE_QUALITY),
    addedAt: Date.now(),
    width,
    height,
  };
}

function photoCount(count: number) {
  return `${count} photo${count === 1 ? "" : "s"}`;
}

function clampInterval(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(20, Math.max(2, Math.round(parsed)));
}

function controlButtonStyle(disabled?: boolean): CSSProperties {
  return {
    alignItems: "center",
    background: "var(--bg-nested)",
    border: "1.5px solid var(--border)",
    borderRadius: 12,
    boxShadow: disabled ? "none" : "2px 2px 0 var(--shadow)",
    color: disabled ? "var(--text-muted)" : "var(--text-primary)",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: "var(--font-dot-gothic), monospace",
    fontSize: "0.62rem",
    gap: 5,
    justifyContent: "center",
    minHeight: 28,
    minWidth: 28,
    opacity: disabled ? 0.55 : 1,
    padding: "5px 7px",
    textTransform: "uppercase",
  };
}

function ControlButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={controlButtonStyle(disabled)}
    >
      {children}
    </button>
  );
}

function SlideImage({ photo, fit }: { photo: PhotoItem; fit: FitMode }) {
  return (
    // Local data URLs from user uploads are not candidates for Next image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.dataUrl}
      alt={photo.name}
      draggable={false}
      style={{
        background: "var(--bg-nested)",
        display: "block",
        height: "100%",
        objectFit: fit,
        width: "100%",
      }}
    />
  );
}

function EmptyState({
  busy,
  notice,
  onUpload,
  size,
}: {
  busy: boolean;
  notice: string | null;
  onUpload: () => void;
  size: "S" | "M" | "L";
}) {
  const isSmall = size === "S";
  return (
    <div
      style={{
        alignItems: "center",
        background: "var(--bg-nested)",
        border: "1.5px dashed var(--border)",
        borderRadius: 14,
        boxShadow: "3px 3px 0 var(--shadow)",
        display: "flex",
        flex: "1 1 auto",
        flexDirection: "column",
        gap: isSmall ? 6 : 10,
        justifyContent: "center",
        minHeight: isSmall ? 84 : 136,
        padding: isSmall ? 8 : 14,
        textAlign: "center",
      }}
    >
      <ImagePlus
        size={isSmall ? 22 : 32}
        strokeWidth={1.75}
        style={{ color: "var(--accent-cyan)" }}
      />
      <div className={isSmall ? "block-sub" : "block-value accent"}>
        {busy ? "importing..." : "drop photos"}
      </div>
      {!isSmall && (
        <div className="block-sub">stored in this browser for the slideshow</div>
      )}
      <button
        type="button"
        onClick={onUpload}
        style={{
          ...controlButtonStyle(busy),
          color: "var(--accent-orange)",
          minWidth: isSmall ? 34 : 72,
        }}
      >
        <Upload size={14} strokeWidth={1.8} />
        {!isSmall && <span>upload</span>}
      </button>
      {notice && !isSmall && <div className="block-sub">{notice}</div>}
    </div>
  );
}

export function PhotoSlideshowWidget() {
  const { size, settings } = useWidget();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [index, setIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const intervalSeconds = clampInterval(settings.intervalSec);
  const autoplay = settings.autoplay !== false;
  const fit: FitMode = settings.fit === "contain" ? "contain" : "cover";
  const showCaptions = settings.showCaptions !== false;
  const activeIndex = photos.length === 0 ? 0 : Math.min(index, photos.length - 1);
  const currentPhoto = photos[activeIndex];

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPhotos(readStoredPhotos());
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
    } catch {
      const timeout = window.setTimeout(() => {
        setNotice("storage full; remove a photo before adding more");
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [hydrated, photos]);

  useEffect(() => {
    if (!autoplay || busy || photos.length < 2) return;
    const timeout = window.setTimeout(() => {
      setIndex((current) => (current + 1) % photos.length);
    }, intervalSeconds * 1000);

    return () => window.clearTimeout(timeout);
  }, [autoplay, busy, index, intervalSeconds, photos.length]);

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const imageFiles = Array.from(fileList).filter(isImageFile).slice(0, MAX_PHOTOS);
    if (imageFiles.length === 0) {
      setNotice("no image files found");
      return;
    }

    setBusy(true);
    setNotice(null);

    const nextPhotos: PhotoItem[] = [];
    for (const file of imageFiles) {
      try {
        nextPhotos.push(await fileToPhoto(file));
      } catch {
        setNotice("some photos could not be read");
      }
    }

    setBusy(false);

    if (nextPhotos.length === 0) {
      setNotice("photos could not be imported");
      return;
    }

    setPhotos((previous) => {
      const merged = [...previous, ...nextPhotos];
      return merged.slice(Math.max(0, merged.length - MAX_PHOTOS));
    });
    setNotice(`added ${photoCount(nextPhotos.length)}`);
  }, []);

  const openUpload = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.currentTarget.files) {
        void addFiles(event.currentTarget.files);
      }
      event.currentTarget.value = "";
    },
    [addFiles],
  );

  const showPrevious = useCallback(() => {
    setIndex((current) =>
      photos.length ? (current - 1 + photos.length) % photos.length : 0,
    );
  }, [photos.length]);

  const showNext = useCallback(() => {
    setIndex((current) => (photos.length ? (current + 1) % photos.length : 0));
  }, [photos.length]);

  const removeCurrent = useCallback(() => {
    if (!currentPhoto) return;
    setPhotos((previous) => previous.filter((photo) => photo.id !== currentPhoto.id));
    setNotice("photo removed");
  }, [currentPhoto]);

  const clearPhotos = useCallback(() => {
    setPhotos([]);
    setIndex(0);
    setNotice(null);
  }, []);

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      void addFiles(event.dataTransfer.files);
    },
    [addFiles],
  );

  const rootStyle = useMemo<CSSProperties>(
    () => ({
      display: "flex",
      flexDirection: "column",
      gap: size === "S" ? 7 : 10,
      height: "100%",
      minHeight: size === "S" ? 92 : size === "M" ? 148 : 238,
      outline: dragging
        ? "1.5px dashed var(--accent-orange)"
        : "1.5px dashed transparent",
      outlineOffset: 2,
      position: "relative",
    }),
    [dragging, size],
  );

  const frameStyle = useMemo<CSSProperties>(
    () => ({
      background: "var(--bg-nested)",
      border: "1.5px solid var(--border)",
      borderRadius: 14,
      boxShadow: "3px 3px 0 var(--shadow)",
      flex: "1 1 auto",
      minHeight: size === "S" ? 78 : size === "M" ? 108 : 164,
      minWidth: 0,
      overflow: "hidden",
      position: "relative",
    }),
    [size],
  );

  const controls = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        justifyContent: size === "L" ? "flex-start" : "flex-end",
      }}
    >
      <ControlButton
        label="previous photo"
        disabled={photos.length < 2}
        onClick={showPrevious}
      >
        <ChevronLeft size={14} strokeWidth={1.9} />
      </ControlButton>
      <ControlButton label="next photo" disabled={photos.length < 2} onClick={showNext}>
        <ChevronRight size={14} strokeWidth={1.9} />
      </ControlButton>
      <ControlButton label="upload photos" disabled={busy} onClick={openUpload}>
        <Upload size={14} strokeWidth={1.9} />
      </ControlButton>
      <ControlButton label="remove current photo" disabled={!currentPhoto} onClick={removeCurrent}>
        <Trash2 size={14} strokeWidth={1.9} />
      </ControlButton>
    </div>
  );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={rootStyle}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleInputChange}
        style={{ display: "none" }}
      />

      {!currentPhoto ? (
        <EmptyState busy={busy} notice={notice} onUpload={openUpload} size={size} />
      ) : size === "S" ? (
        <button
          type="button"
          aria-label="next photo"
          disabled={photos.length < 2}
          onClick={showNext}
          style={{
            ...frameStyle,
            border: "1.5px solid var(--border)",
            cursor: photos.length > 1 ? "pointer" : "default",
            padding: 0,
            width: "100%",
          }}
        >
          <SlideImage photo={currentPhoto} fit={fit} />
          <div
            className="block-label"
            style={{
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 12,
              bottom: 6,
              boxShadow: "2px 2px 0 var(--shadow)",
              color: "var(--accent-cyan)",
              left: 6,
              marginBottom: 0,
              padding: "2px 5px",
              position: "absolute",
            }}
          >
            {activeIndex + 1}/{photos.length}
          </div>
        </button>
      ) : size === "M" ? (
        <>
          <div style={frameStyle}>
            <SlideImage photo={currentPhoto} fit={fit} />
            {showCaptions && (
              <div
                style={{
                  bottom: 8,
                  display: "flex",
                  left: 8,
                  position: "absolute",
                  right: 8,
                }}
              >
                <div
                  className="block-sub"
                  style={{
                    background: "var(--bg-card)",
                    border: "1.5px solid var(--border)",
                    borderRadius: 12,
                    boxShadow: "2px 2px 0 var(--shadow)",
                    maxWidth: "100%",
                    overflow: "hidden",
                    padding: "4px 7px",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {currentPhoto.name}
                </div>
              </div>
            )}
          </div>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: 8,
              justifyContent: "space-between",
              minWidth: 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                className="block-value accent"
                style={{
                  fontSize: "0.98rem",
                  lineHeight: 1.15,
                }}
              >
                {photoCount(photos.length)}
              </div>
              <div className="block-sub">
                {autoplay ? `every ${intervalSeconds}s` : "manual"} / {activeIndex + 1} of{" "}
                {photos.length}
              </div>
            </div>
            {controls}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              flex: "1 1 auto",
              gap: 10,
              gridTemplateColumns: "minmax(0, 1fr) 76px",
              minHeight: 0,
            }}
          >
            <div style={frameStyle}>
              <SlideImage photo={currentPhoto} fit={fit} />
              {showCaptions && (
                <div
                  style={{
                    alignItems: "flex-end",
                    bottom: 10,
                    display: "flex",
                    gap: 8,
                    justifyContent: "space-between",
                    left: 10,
                    position: "absolute",
                    right: 10,
                  }}
                >
                  <div
                    className="block-value"
                    style={{
                      background: "var(--bg-card)",
                      border: "1.5px solid var(--border)",
                      borderRadius: 14,
                      boxShadow: "2px 2px 0 var(--shadow)",
                      fontSize: "1rem",
                      maxWidth: "100%",
                      overflow: "hidden",
                      padding: "5px 8px",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {currentPhoto.name}
                  </div>
                  <div
                    className="block-label"
                    style={{
                      background: "var(--bg-card)",
                      border: "1.5px solid var(--border)",
                      borderRadius: 12,
                      boxShadow: "2px 2px 0 var(--shadow)",
                      color: "var(--accent-cyan)",
                      marginBottom: 0,
                      padding: "4px 7px",
                    }}
                  >
                    {activeIndex + 1}/{photos.length}
                  </div>
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 7,
                minHeight: 0,
                overflowY: "auto",
                paddingRight: 2,
              }}
            >
              {photos.map((photo, photoIndex) => (
                <button
                  key={photo.id}
                  type="button"
                  aria-label={`show ${photo.name}`}
                  onClick={() => setIndex(photoIndex)}
                  style={{
                    background: "var(--bg-nested)",
                    border:
                      photoIndex === activeIndex
                        ? "1.5px solid var(--accent-orange)"
                        : "1.5px solid var(--border)",
                    borderRadius: 12,
                    boxShadow:
                      photoIndex === activeIndex ? "2px 2px 0 var(--shadow)" : "none",
                    cursor: "pointer",
                    height: 48,
                    overflow: "hidden",
                    padding: 0,
                  }}
                >
                  <SlideImage photo={photo} fit="cover" />
                </button>
              ))}
            </div>
          </div>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div className="more-head" style={{ marginBottom: 0 }}>
                slideshow
              </div>
              <div className="block-sub">
                {autoplay ? (
                  <>
                    <Play size={11} strokeWidth={1.8} /> every {intervalSeconds}s
                  </>
                ) : (
                  <>
                    <Pause size={11} strokeWidth={1.8} /> manual advance
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {controls}
              <ControlButton label="clear photos" disabled={!photos.length} onClick={clearPhotos}>
                <X size={14} strokeWidth={1.9} />
              </ControlButton>
            </div>
          </div>
          {notice && <div className="block-sub">{notice}</div>}
        </>
      )}

      {dragging && (
        <div
          className="block-label"
          style={{
            alignItems: "center",
            background: "var(--bg-card)",
            border: "1.5px solid var(--accent-orange)",
            borderRadius: 14,
            bottom: 6,
            boxShadow: "3px 3px 0 var(--shadow)",
            color: "var(--accent-orange)",
            display: "flex",
            justifyContent: "center",
            left: 6,
            marginBottom: 0,
            pointerEvents: "none",
            position: "absolute",
            right: 6,
            top: 6,
            zIndex: 2,
          }}
        >
          drop photos
        </div>
      )}
    </div>
  );
}
