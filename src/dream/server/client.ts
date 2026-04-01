import { getServerUrl } from "./probe";
import type { ClientMessage, ServerMessage } from "./protocol";

type FrameCallback = (frame: Blob) => void;
type ProgressCallback = (p: {
  octave: number;
  step: number;
  loss: number;
}) => void;
type StyleProgressCallback = (p: {
  iteration: number;
  contentLoss: number;
  styleLoss: number;
  tvLoss: number;
  totalLoss: number;
}) => void;
type CompleteCallback = () => void;
type DisconnectCallback = () => void;

export class DreamServerClient {
  private ws: WebSocket | null = null;
  private frameCallbacks: FrameCallback[] = [];
  private progressCallbacks: ProgressCallback[] = [];
  private styleProgressCallbacks: StyleProgressCallback[] = [];
  private completeCallbacks: CompleteCallback[] = [];
  private disconnectCallbacks: DisconnectCallback[] = [];

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    const url = getServerUrl().replace("http", "ws");
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${url}/ws/dream`);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onclose = () => {
        this.disconnectCallbacks.forEach((cb) => cb());
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const blob = new Blob([event.data], { type: "image/png" });
          this.frameCallbacks.forEach((cb) => cb(blob));
        } else {
          const msg: ServerMessage = JSON.parse(event.data);
          switch (msg.type) {
            case "progress":
              this.progressCallbacks.forEach((cb) =>
                cb({
                  octave: msg.octave,
                  step: msg.step,
                  loss: msg.loss,
                }),
              );
              break;
            case "style_progress":
              this.styleProgressCallbacks.forEach((cb) =>
                cb({
                  iteration: msg.iteration,
                  contentLoss: msg.content_loss,
                  styleLoss: msg.style_loss,
                  tvLoss: msg.tv_loss,
                  totalLoss: msg.total_loss,
                }),
              );
              break;
            case "complete":
              this.completeCallbacks.forEach((cb) => cb());
              break;
            case "error":
              console.error("Server error:", msg.message);
              break;
          }
        }
      };
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Clear all session callbacks. Call before starting a new dream/style session. */
  clearCallbacks(): void {
    this.frameCallbacks = [];
    this.progressCallbacks = [];
    this.styleProgressCallbacks = [];
    this.completeCallbacks = [];
  }

  startDream(config: Extract<ClientMessage, { type: "start_dream" }>): void {
    this.clearCallbacks();
    this.send(config);
  }

  startStyleTransfer(
    config: Extract<ClientMessage, { type: "start_style_transfer" }>,
  ): void {
    this.clearCallbacks();
    this.send(config);
  }

  startFastStyleTransfer(
    config: Extract<ClientMessage, { type: "start_fast_style_transfer" }>,
  ): void {
    this.clearCallbacks();
    this.send(config);
  }

  pauseDream(): void {
    this.send({ type: "pause" });
  }

  resumeDream(): void {
    this.send({ type: "resume" });
  }

  stopDream(): void {
    this.send({ type: "stop" });
  }

  onFrame(cb: FrameCallback): void {
    this.frameCallbacks.push(cb);
  }

  onProgress(cb: ProgressCallback): void {
    this.progressCallbacks.push(cb);
  }

  onStyleProgress(cb: StyleProgressCallback): void {
    this.styleProgressCallbacks.push(cb);
  }

  onComplete(cb: CompleteCallback): void {
    this.completeCallbacks.push(cb);
  }

  onDisconnect(cb: DisconnectCallback): void {
    this.disconnectCallbacks.push(cb);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.frameCallbacks = [];
    this.progressCallbacks = [];
    this.styleProgressCallbacks = [];
    this.completeCallbacks = [];
  }
}
