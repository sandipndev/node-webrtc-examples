const { createCanvas, createImageData, Image } = require("canvas");

const {
  RTCVideoSink,
  RTCVideoSource,
  i420ToRgba,
  rgbaToI420,
} = require("wrtc").nonstandard;

// ==== ZMQ ====
const zmq = require("zeromq");
const sock = zmq.socket("sub");

sock.bindSync("tcp://*:7777");
sock.setsockopt(zmq.ZMQ_SUBSCRIBE, Buffer.from(""));

// ==== PeerConn Video Canvas ====
const width = 640;
const height = 480;

function beforeOffer(peerConnection) {
  const source = new RTCVideoSource();
  const track = source.createTrack();
  const transceiver = peerConnection.addTransceiver(track);
  const sink = new RTCVideoSink(transceiver.receiver.track);

  let lastFrame = null;

  function onFrame({ frame }) {
    lastFrame = frame;
  }

  sink.addEventListener("frame", onFrame);

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { pixelFormat: "RGBA24" });
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);

  sock.on("message", (buf) => {
    if (lastFrame) {
      const lastFrameCanvas = createCanvas(lastFrame.width, lastFrame.height);
      const lastFrameContext = lastFrameCanvas.getContext("2d", {
        pixelFormat: "RGBA24",
      });

      const rgba = new Uint8ClampedArray(
        lastFrame.width * lastFrame.height * 4
      );
      const rgbaFrame = createImageData(
        rgba,
        lastFrame.width,
        lastFrame.height
      );
      i420ToRgba(lastFrame, rgbaFrame);

      lastFrameContext.putImageData(rgbaFrame, 0, 0);
      context.drawImage(lastFrameCanvas, 0, 0);
    } else {
      context.fillStyle = "rgba(255, 255, 255, 0.025)";
      context.fillRect(0, 0, width, height);
    }

    const img = new Image();
    img.src = "data:image/jpg;base64," + buf.toString();
    context.drawImage(img, 0, 0);

    const rgbaFrame = context.getImageData(0, 0, width, height);
    const i420Frame = {
      width,
      height,
      data: new Uint8ClampedArray(1.5 * width * height),
    };
    rgbaToI420(rgbaFrame, i420Frame);
    source.onFrame(i420Frame);
  });

  const { close } = peerConnection;
  peerConnection.close = function () {
    sink.stop();
    track.stop();
    return close.apply(this, arguments);
  };
}

module.exports = { beforeOffer };
