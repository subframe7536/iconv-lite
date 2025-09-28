import { Transform, type TransformOptions, type TransformCallback } from "stream"
import type { IEncoder, IDecoder } from "./type.ts"
import { getEncoder, getDecoder } from "./index.ts"

export class IconvLiteEncoderStream extends Transform {
  private encoder: IEncoder

  constructor (encoder: IEncoder, options?: TransformOptions) {
    super(options)
    this.encoder = encoder
  }

  override _transform (chunk: any, encoding: BufferEncoding, done: TransformCallback): void {
    if (typeof chunk !== "string") {
      return done(new Error("Iconv encoding stream needs strings as its input."))
    }

    try {
      const res = this.encoder.write(chunk)
      if (res?.length) this.push(res)
      done()
    } catch (e: unknown) {
      done(e as Error)
    }
  }

  override _flush (done: TransformCallback): void {
    try {
      const res = this.encoder.end()
      if (res?.length) this.push(res)
      done()
    } catch (e: unknown) {
      done(e as Error)
    }
  }

  collect (cb: (err: Error | null, body: Buffer) => void): this {
    const chunks: Buffer[] = []
    this.on("error", cb)
    this.on("data", (chunk) => { chunks.push(chunk as Buffer) })
    this.on("end", () => {
      cb(null, Buffer.concat(chunks))
    })
    return this
  }
}

export class IconvLiteDecoderStream extends Transform {
  private decoder: IDecoder

  constructor (decoder: IDecoder, options?: TransformOptions) {
    super(options)
    this.decoder = decoder
  }

  override _transform (chunk: any, encoding: BufferEncoding, done: TransformCallback): void {
    if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) {
      return done(new Error("Iconv decoding stream needs buffers as its input."))
    }
    try {
      const res = this.decoder.write(chunk as Buffer)
      if (res?.length) this.push(res, "utf8")
      done()
    } catch (e: any) {
      done(e)
    }
  }

  override _flush (done: TransformCallback): void {
    try {
      const res = this.decoder.end()
      if (res?.length) this.push(res, "utf8")
      done()
    } catch (e: any) {
      done(e)
    }
  }

  collect (cb: (err: Error | null, body: string) => void): this {
    let res = ""
    this.on("error", cb)
    this.on("data", (chunk) => { res += chunk })
    this.on("end", () => {
      cb(null, res)
    })
    return this
  }
}

export function encodeStream (encoding: string, options?: TransformOptions): IconvLiteEncoderStream {
  return new IconvLiteEncoderStream(getEncoder(encoding, options), options as TransformOptions)
}

export function decodeStream (encoding: string, options?: TransformOptions): IconvLiteDecoderStream {
  return new IconvLiteDecoderStream(getDecoder(encoding, options), options as TransformOptions)
}
