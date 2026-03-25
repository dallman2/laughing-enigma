import React from "react";
import "./EasyPicImpl.css";

const Toolbar: React.FC<{
  setFile: React.Dispatch<React.SetStateAction<File | null>>;
}> = ({ setFile }) => {
  const handle1 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    console.log("handle1", file);
    setFile(file);
  };
  return (
    <div className="toolbar">
      <input className="toolbar-button" type="file" onChange={handle1} />
    </div>
  );
};

const Canvas = React.forwardRef<HTMLCanvasElement>((_props, ref) => {
  return (
    <div className="canvas">
      <canvas id="easypic-canvas" width="800" height="600" ref={ref}></canvas>
    </div>
  );
});

const EasyPicImpl: React.FC = () => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  React.useEffect(() => {
    handleFileChange().catch((err) => console.error(err));
  }, [file]);

  const handleFileChange = async () => {
    if (!file || !canvasRef.current) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      console.error("Not an image file");
      return;
    }
    const buf = await file.arrayBuffer();
    const img = await createImageBitmap(new Blob([buf], { type: file.type }));
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="easy-pic-container">
      <Toolbar setFile={setFile} />
      <Canvas ref={canvasRef} />
    </div>
  );
};

export default EasyPicImpl;
