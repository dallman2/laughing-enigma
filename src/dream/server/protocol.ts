/** Messages sent from the client to the server */
export type ClientMessage =
  | {
      type: "start_dream";
      model_id: string;
      layers: string[];
      image: string; // base64 JPEG
      params: {
        step_size: number;
        num_octaves: number;
        octave_scale: number;
        steps_per_octave: number;
        max_loss?: number | null;
      };
    }
  | {
      type: "start_style_transfer";
      model_id: string;
      content_image: string; // base64 JPEG
      style_image: string; // base64 JPEG
      content_layers: string[];
      style_layers: string[];
      params: {
        iterations: number;
        learning_rate: number;
        content_weight: number;
        style_weight: number;
        tv_weight: number;
        style_scale: number;
      };
    }
  | {
      type: "start_fast_style_transfer";
      content_image: string; // base64 JPEG
      style_image: string; // base64 JPEG
      params: {
        alpha: number;
      };
    }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | {
      type: "update_params";
      params: {
        step_size?: number;
        num_octaves?: number;
        octave_scale?: number;
        steps_per_octave?: number;
      };
    };

/** JSON messages sent from the server to the client */
export type ServerMessage =
  | { type: "progress"; octave: number; step: number; loss: number }
  | {
      type: "style_progress";
      iteration: number;
      content_loss: number;
      style_loss: number;
      tv_loss: number;
      total_loss: number;
    }
  | { type: "complete" }
  | { type: "error"; message: string }
  | {
      type: "model_info";
      model_id: string;
      layers: Array<{
        name: string;
        type: string;
        output_shape: number[];
      }>;
    };

// Binary messages from server are JPEG-encoded dream/style frames
// (sent as WebSocket binary messages, not JSON)
