import { createFile, DataStream } from "../deps/mp4box.0.5.2.js";

export default class MP4Demuxer {
  #onConfig;
  #onChunk;
  #file;
  /**
   *
   * @param {ReadableStream} stream
   * @param {object} options
   * @param {(config: object) => void} options.onConfig
   * @param {(config: object) => void} options.onChunk
   *
   * @returns {Promise<void>}
   */
  async run(stream, { onConfig, onChunk }) {
    this.#onConfig = onConfig;
    this.#onChunk = onChunk;

    this.#file = createFile();
    this.#file.onReady = this.#onReady.bind(this);
    this.#file.onSamples = this.#onSamples.bind(this);
    this.#file.onError = (args) => {
      console.error("deu ruim mp4Demuxer", error);
    };

    return this.#init(stream);
  }

  #description(track) {
    const trak = this.#file.getTrackById(track.id);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer, 8);
      }
    }
    throw new Error("avcC, hvcC, vpcC or av1C box not found");
  }

  #onSamples(trackId, ref, samples) {
    // Generate and emit an EncodedVideoChunk for each demuxed sample
    for (const sample of samples) {
      const encodedChunk = new EncodedVideoChunk({
        type: sample.is_sync ? "key" : "delta",
        timestamp: (1e6 * sample.cts) / sample.timescale,
        duration: (1e6 * sample.duration) / sample.timescale,
        data: sample.data,
      });

      this.#onChunk(encodedChunk);
    }
  }

  #onReady(info) {
    const [track] = info.videoTracks;
    this.#onConfig({
      codec: track.codec,
      codedHeight: track.video.height,
      codedWidth: track.video.width,
      description: this.#description(track),
      durationSecs: info.duration / info.timescale,
    });
    this.#file.setExtractionOptions(track.id);
    this.#file.start();
  }

  /**
   *
   * @param {ReadableStream} stream
   * @returns {PRomise<void>}
   */
  #init(stream) {
    let _offset = 0;
    const consumeFile = new WritableStream({
      /** @param {Uint8Array} chunk */
      write: (chunk) => {
        const copy = chunk.buffer;
        copy.fileStart = _offset;

        this.#file.appendBuffer(copy);

        _offset += chunk.length;
      },
      close: () => {
        this.#file.flush();
      },
    });

    return stream.pipeTo(consumeFile);
  }
}