import { useRef, useState } from "react";

interface Props {
  onContentLoaded: (img: HTMLImageElement) => void;
  onStyleLoaded: (img: HTMLImageElement) => void;
  disabled?: boolean;
}

const DualImageUploader = ({
  onContentLoaded,
  onStyleLoaded,
  disabled,
}: Props) => {
  const contentInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);
  const [contentPreview, setContentPreview] = useState<string | null>(null);
  const [stylePreview, setStylePreview] = useState<string | null>(null);

  const handleFile = (
    file: File,
    setPreview: (url: string) => void,
    onLoaded: (img: HTMLImageElement) => void,
  ) => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    const img = new Image();
    img.onload = () => onLoaded(img);
    img.src = url;
  };

  const handleDrop =
    (
      setPreview: (url: string) => void,
      onLoaded: (img: HTMLImageElement) => void,
    ) =>
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        handleFile(file, setPreview, onLoaded);
      }
    };

  return (
    <div className="dual-image-uploader">
      <div className="dual-upload-slot">
        <label>Content image</label>
        <div
          className="drop-zone"
          onDrop={handleDrop(setContentPreview, onContentLoaded)}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !disabled && contentInputRef.current?.click()}
        >
          {contentPreview ? (
            <img src={contentPreview} alt="Content" className="preview-image" />
          ) : (
            <p>Drop or click</p>
          )}
        </div>
        <input
          ref={contentInputRef}
          type="file"
          accept="image/*"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f, setContentPreview, onContentLoaded);
          }}
          style={{ display: "none" }}
        />
      </div>

      <div className="dual-upload-slot">
        <label>Style image</label>
        <div
          className="drop-zone"
          onDrop={handleDrop(setStylePreview, onStyleLoaded)}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !disabled && styleInputRef.current?.click()}
        >
          {stylePreview ? (
            <img src={stylePreview} alt="Style" className="preview-image" />
          ) : (
            <p>Drop or click</p>
          )}
        </div>
        <input
          ref={styleInputRef}
          type="file"
          accept="image/*"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f, setStylePreview, onStyleLoaded);
          }}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
};

export default DualImageUploader;
