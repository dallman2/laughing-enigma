import { useCallback } from "react";

interface Props {
  width: number;
  height: number;
  canvasRef: (el: HTMLCanvasElement | null) => void;
}

const ImageCanvas = ({ width, height, canvasRef }: Props) => {
  const ref = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef(el);
    },
    [canvasRef],
  );

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className="dream-canvas"
    />
  );
};

export default ImageCanvas;
