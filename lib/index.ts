import { PrependBOMWrapper, StripBOMWrapper } from "./bom-handling.ts"
import _encodings from "../encodings/index.js"
import type { IEncoder, IDecoder, Options, Codec } from "./type.ts"

// All codecs and aliases are kept here, keyed by encoding name/alias.
// They are lazy loaded in `iconv.getCodec` from `encodings/index.js`.

// Characters emitted in case of error.
export const encodings = _encodings as unknown as Record<string, string>;
export const defaultCharUnicode = "�"
export const defaultCharSingleByte = "?"

// Public API.
export function encode (str: string, encoding: string, options?: Options): Buffer<ArrayBuffer> {
  str = "" + (str ?? "") // Ensure string.

  const encoder = getEncoder(encoding, options)

  const res = encoder.write(str)
  const trail = encoder.end()

  return (trail?.length) ? Buffer.concat([res, trail]) : res
}

export function decode (buf: Buffer | Uint8Array, encoding: string, options?: Options): string {
  const decoder = getDecoder(encoding, options)

  const res = decoder.write(buf as Buffer)
  const trail = decoder.end()

  return trail ? (res + trail) : res
}

// Search for a codec in iconv.encodings. Cache codec data in iconv._codecDataCache.
const _codecDataCache: Record<string, Codec> = {}

export const ICONV = {
  defaultCharUnicode,
  defaultCharSingleByte,
  getEncoder,
  getDecoder,
  decode,
  encode,
  _canonicalizeEncoding
};

export function getCodec (encoding: string): Codec {
  if (encoding === '__proto__' || encoding === 'constructor') {
    throw new Error('Invalid encoding name')
  }
  // Canonicalize encoding name: strip all non-alphanumeric chars and appended year.
  let enc = _canonicalizeEncoding(encoding)

  // Traverse iconv.encodings to find actual codec.
  const codecOptions: Record<string, any> = {}
  while (true) {
    let codec = _codecDataCache[enc]

    if (codec) {
      return codec
    }

    const codecDef = _encodings[enc as keyof typeof _encodings]

    switch (typeof codecDef) {
      case "string": // Direct alias to other encoding.
        enc = codecDef
        break

      case "object": // Alias with options. Can be layered.
        for (const key in codecDef) {
          codecOptions[key] = codecDef[key as keyof typeof codecDef]
        }

        if (!codecOptions.encodingName) {
          codecOptions.encodingName = enc
        }

        enc = codecDef.type
        break

      case "function": // Codec itself.
        if (!codecOptions.encodingName) {
          codecOptions.encodingName = enc
        }

        // The codec function must load all tables and return object with .encoder and .decoder methods.
        // It'll be called only once (for each different options object).
        //
        // @ts-expect-error: codecDef may not strictly match the expected constructor type due to dynamic codec definitions.
        codec = new codecDef(codecOptions, ICONV)

        _codecDataCache[codecOptions.encodingName] = codec // Save it to be reused later.
        return codec

      default:
        throw new Error(`Encoding not recognized: '${encoding}' (searched as: '${enc}')`)
    }
  }
}

export function _canonicalizeEncoding (encoding: string): string {
  // Canonicalize encoding name: strip all non-alphanumeric chars and appended year.
  return (`${encoding}`).toLowerCase().replace(/:\d{4}$|[^0-9a-z]/g, "")
}


export function encodingExists (enc: string): boolean {
  try {
    getCodec(enc)
    return true
  } catch (e) {
    return false
  }
}

// Legacy aliases to convert functions
export { encode as toEncoding, decode as fromEncoding }

export function getEncoder (encoding: string, options?: Options): IEncoder {
  const codec = getCodec(encoding)
  let encoder: IEncoder = new codec.encoder(options, codec)

  if (codec.bomAware && options?.addBOM) {
    encoder = new PrependBOMWrapper(encoder)
  }

  return encoder
}

export function getDecoder (encoding: string, options?: Options): IDecoder {
  const codec = getCodec(encoding)
  let decoder: IDecoder = new codec.decoder(options, codec)

  if (codec.bomAware && options?.stripBOM !== false) {
    decoder = new StripBOMWrapper(decoder, options)
  }

  return decoder
}

// Some environments, such as browsers, may not load JavaScript files as UTF-8
// eslint-disable-next-line no-constant-condition
if ("Ā" !== "\u0100") {
  console.error("iconv-lite warning: js files use non-utf8 encoding. See https://github.com/ashtuchkin/iconv-lite/wiki/Javascript-source-file-encodings for more info.")
}
