export interface Options {
  stripBOM?: boolean | (() => void)
  addBOM?: boolean
  defaultEncoding?: string
}

export interface IEncoder {
  write: (str: string) => Buffer<ArrayBuffer>
  end: () => Buffer | undefined
}

export interface IDecoder {
  write: (buf: Buffer) => string
  end: () => string | undefined
}

export type CodecEncoder = new (options?: Options, codec?: Codec) => IEncoder
export type CodecDecoder = new (options?: Options, codec?: Codec) => IDecoder

export interface Codec {
  encoder: CodecEncoder
  decoder: CodecDecoder
  bomAware?: boolean
  encodingName: string
}



