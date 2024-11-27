import { PrependBOM, StripBOM } from './bom-handling.js';
import { default as allEncodings } from '../encodings/index.js';

// Types
export interface EncoderOptions {
    addBOM?: boolean;
    [key: string]: any;
}

export interface DecoderOptions {
    stripBOM?: boolean | (() => void);
    [key: string]: any;
}

export interface Encoder {
    write(str: string): Uint8Array;
    end(): Uint8Array | undefined;
}

export interface Decoder {
    write(buf: Uint8Array): string;
    end(): Uint8Array | undefined;
}

export interface Codec {
    encoder: new (options: EncoderOptions, codec: Codec) => Encoder;
    decoder: new (options: DecoderOptions, codec: Codec) => Decoder;
    bomAware?: boolean;
}

export interface IconvLite {
    encode: typeof encode;
    decode: typeof decode;
    getCodec: typeof getCodec;
    getEncoder: typeof getEncoder;
    getDecoder: typeof getDecoder;
    defaultCharUnicode: string;
    defaultCharSingleByte: string;
}

// Search for a codec in encodings. Cache codec data in _codecDataCache.
const _codecDataCache = new Map<string, Codec>();

// Characters emitted in case of error.
const defaultCharUnicode = '';
const defaultCharSingleByte = '?';

export function encode(str: string | null | undefined, encoding: string, options?: EncoderOptions): Uint8Array {
    str = "" + (str || ""); // Ensure string.

    const encoder = getEncoder(encoding, options);

    const res = encoder.write(str);
    const trail = encoder.end();

    return (trail && trail.length > 0) ? Buffer.concat([res, trail]) : res;
}

export function decode(buf: Uint8Array | string, encoding: string, options?: DecoderOptions): string {
    if (typeof buf === 'string') {
        buf = Buffer.from("" + (buf || ""), "binary"); // Ensure buffer.
    }

    const decoder = getDecoder(encoding, options);

    const res = decoder.write(buf);
    const trail = decoder.end();

    return trail ? (res + trail) : res;
}

export function encodingExists(enc: string): boolean {
    try {
        getCodec(enc);
        return true;
    } catch (e) {
        return false;
    }
}

export function getCodec(encoding: string): Codec {
    // Canonicalize encoding name: strip all non-alphanumeric chars and appended year.
    let enc = canonicalizeEncoding(encoding);

    // Traverse encodings to find actual codec.
    const codecOptions: Record<string, any> = {};
    while (true) {
        if (_codecDataCache.has(enc)) {
            return _codecDataCache.get(enc)!;
        }

        const codecDef = (allEncodings as Record<string, any>)[enc];

        switch (typeof codecDef) {
            case "string": // Direct alias to other encoding.
                enc = codecDef;
                break;

            case "object": // Alias with options. Can be layered.
                for (const key in codecDef)
                    codecOptions[key] = codecDef[key];

                if (!codecOptions.encodingName)
                    codecOptions.encodingName = enc;

                enc = codecDef.type;
                break;

            case "function": // Codec itself.
                if (!codecOptions.encodingName)
                    codecOptions.encodingName = enc;

                const codec = new codecDef(codecOptions, {
                    encode, decode, getCodec, getEncoder, getDecoder,
                    defaultCharUnicode, defaultCharSingleByte
                });

                _codecDataCache.set(codecOptions.encodingName, codec);
                return codec;

            default:
                throw new Error("Encoding not recognized: '" + encoding + "' (searched as: '"+enc+"')");
        }
    }
}

function canonicalizeEncoding(encoding: string): string {
    return (''+encoding).toLowerCase().replace(/:\d{4}$|[^0-9a-z]/g, "");
}

export function getEncoder(encoding: string, options?: EncoderOptions): Encoder {
    const codec = getCodec(encoding);
    const encoder = new codec.encoder(options || {}, codec);

    if (codec.bomAware && options?.addBOM)
        return new PrependBOM(encoder, options);

    return encoder;
}

export function getDecoder(encoding: string, options?: DecoderOptions): Decoder {
    const codec = getCodec(encoding);
    const decoder = new codec.decoder(options || {}, codec);

    if (codec.bomAware && !(options?.stripBOM === false))
        return new StripBOM(decoder, options);

    return decoder;
}