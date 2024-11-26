export const utf32le = { type: '_utf32', isLE: true };
export const utf32be = { type: '_utf32', isLE: false };

export const ucs4le = 'utf32le';
export const ucs4be = 'utf32be';
export const _utf32 = Utf32Codec;

class Utf32Codec {
    constructor(codecOptions, iconv) {
        this.iconv = iconv;
        this.bomAware = true;
        this.isLE = codecOptions.isLE;
    }
    encoder = Utf32Encoder;
    decoder = Utf32Decoder;
}

// -- Encoding

class Utf32Encoder {
    constructor(options, codec) {
        this.isLE = codec.isLE;
        this.highSurrogate = 0;
    }
    write(str) {
        var src = Buffer.from(str, 'ucs2');
        var dst = Buffer.alloc(src.length * 2);
        var write32 = this.isLE ? dst.writeUInt32LE : dst.writeUInt32BE;
        var offset = 0;

        for (var i = 0; i < src.length; i += 2) {
            var code = src.readUInt16LE(i);
            var isHighSurrogate = (0xD800 <= code && code < 0xDC00);
            var isLowSurrogate = (0xDC00 <= code && code < 0xE000);

            if (this.highSurrogate) {
                if (isHighSurrogate || !isLowSurrogate) {
                    // There shouldn't be two high surrogates in a row, nor a high surrogate which isn't followed by a low
                    // surrogate. If this happens, keep the pending high surrogate as a stand-alone semi-invalid character
                    // (technically wrong, but expected by some applications, like Windows file names).
                    write32.call(dst, this.highSurrogate, offset);
                    offset += 4;
                }
                else {
                    // Create 32-bit value from high and low surrogates;
                    var codepoint = (((this.highSurrogate - 0xD800) << 10) | (code - 0xDC00)) + 0x10000;

                    write32.call(dst, codepoint, offset);
                    offset += 4;
                    this.highSurrogate = 0;

                    continue;
                }
            }

            if (isHighSurrogate)
                this.highSurrogate = code;
            else {
                // Even if the current character is a low surrogate, with no previous high surrogate, we'll
                // encode it as a semi-invalid stand-alone character for the same reasons expressed above for
                // unpaired high surrogates.
                write32.call(dst, code, offset);
                offset += 4;
                this.highSurrogate = 0;
            }
        }

        if (offset < dst.length)
            dst = dst.slice(0, offset);

        return dst;
    }
    end() {
        // Treat any leftover high surrogate as a semi-valid independent character.
        if (!this.highSurrogate)
            return;

        var buf = Buffer.alloc(4);

        if (this.isLE)
            buf.writeUInt32LE(this.highSurrogate, 0);

        else
            buf.writeUInt32BE(this.highSurrogate, 0);

        this.highSurrogate = 0;

        return buf;
    }
}



// -- Decoding

class Utf32Decoder {
    constructor(options, codec) {
        this.isLE = codec.isLE;
        this.badChar = codec.iconv.defaultCharUnicode.charCodeAt(0);
        this.overflow = [];
    }
    write(src) {
        if (src.length === 0)
            return '';

        var i = 0;
        var codepoint = 0;
        var dst = Buffer.alloc(src.length + 4);
        var offset = 0;
        var isLE = this.isLE;
        var overflow = this.overflow;
        var badChar = this.badChar;

        if (overflow.length > 0) {
            for (; i < src.length && overflow.length < 4; i++)
                overflow.push(src[i]);

            if (overflow.length === 4) {
                // NOTE: codepoint is a signed int32 and can be negative.
                // NOTE: We copied this block from below to help V8 optimize it (it works with array, not buffer).
                if (isLE) {
                    codepoint = overflow[i] | (overflow[i + 1] << 8) | (overflow[i + 2] << 16) | (overflow[i + 3] << 24);
                } else {
                    codepoint = overflow[i + 3] | (overflow[i + 2] << 8) | (overflow[i + 1] << 16) | (overflow[i] << 24);
                }
                overflow.length = 0;

                offset = _writeCodepoint(dst, offset, codepoint, badChar);
            }
        }

        // Main loop. Should be as optimized as possible.
        for (; i < src.length - 3; i += 4) {
            // NOTE: codepoint is a signed int32 and can be negative.
            if (isLE) {
                codepoint = src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24);
            } else {
                codepoint = src[i + 3] | (src[i + 2] << 8) | (src[i + 1] << 16) | (src[i] << 24);
            }
            offset = _writeCodepoint(dst, offset, codepoint, badChar);
        }

        // Keep overflowing bytes.
        for (; i < src.length; i++) {
            overflow.push(src[i]);
        }

        return dst.slice(0, offset).toString('ucs2');
    }
    end() {
        this.overflow.length = 0;
    }
}


function _writeCodepoint(dst, offset, codepoint, badChar) {
    // NOTE: codepoint is signed int32 and can be negative. We keep it that way to help V8 with optimizations.
    if (codepoint < 0 || codepoint > 0x10FFFF) {
        // Not a valid Unicode codepoint
        codepoint = badChar;
    }

    // Ephemeral Planes: Write high surrogate.
    if (codepoint >= 0x10000) {
        codepoint -= 0x10000;

        var high = 0xD800 | (codepoint >> 10);
        dst[offset++] = high & 0xff;
        dst[offset++] = high >> 8;

        // Low surrogate is written below.
        var codepoint = 0xDC00 | (codepoint & 0x3FF);
    }

    // Write BMP char or low surrogate.
    dst[offset++] = codepoint & 0xff;
    dst[offset++] = codepoint >> 8;

    return offset;
};

export const utf32 = Utf32AutoCodec;
export const ucs4 = 'utf32';

class Utf32AutoCodec {
    constructor(options, iconv) {
        this.iconv = iconv;
    }
}

Utf32AutoCodec.prototype.encoder = Utf32AutoEncoder;
Utf32AutoCodec.prototype.decoder = Utf32AutoDecoder;

// -- Encoding

class Utf32AutoEncoder {
    constructor(options, codec) {
        options = options || {};

        if (options.addBOM === undefined)
            options.addBOM = true;

        this.encoder = codec.iconv.getEncoder(options.defaultEncoding || 'utf-32le', options);
    }
    write(str) {
        return this.encoder.write(str);
    }
    end() {
        return this.encoder.end();
    }
}



// -- Decoding

class Utf32AutoDecoder {
    constructor(options, codec) {
        this.decoder = null;
        this.initialBufs = [];
        this.initialBufsLen = 0;
        this.options = options || {};
        this.iconv = codec.iconv;
    }
    write(buf) {
        if (!this.decoder) {
            // Codec is not chosen yet. Accumulate initial bytes.
            this.initialBufs.push(buf);
            this.initialBufsLen += buf.length;

            if (this.initialBufsLen < 32) // We need more bytes to use space heuristic (see below)
                return '';

            // We have enough bytes -> detect endianness.
            var encoding = detectEncoding(this.initialBufs, this.options.defaultEncoding);
            this.decoder = this.iconv.getDecoder(encoding, this.options);

            var resStr = '';
            for (var i = 0; i < this.initialBufs.length; i++)
                resStr += this.decoder.write(this.initialBufs[i]);

            this.initialBufs.length = this.initialBufsLen = 0;
            return resStr;
        }

        return this.decoder.write(buf);
    }
    end() {
        if (!this.decoder) {
            var encoding = detectEncoding(this.initialBufs, this.options.defaultEncoding);
            this.decoder = this.iconv.getDecoder(encoding, this.options);

            var resStr = '';
            for (var i = 0; i < this.initialBufs.length; i++)
                resStr += this.decoder.write(this.initialBufs[i]);

            var trail = this.decoder.end();
            if (trail)
                resStr += trail;

            this.initialBufs.length = this.initialBufsLen = 0;
            return resStr;
        }

        return this.decoder.end();
    }
}



function detectEncoding(bufs, defaultEncoding) {
    var b = [];
    var charsProcessed = 0;
    var invalidLE = 0, invalidBE = 0;   // Number of invalid chars when decoded as LE or BE.
    var bmpCharsLE = 0, bmpCharsBE = 0; // Number of BMP chars when decoded as LE or BE.

    outer_loop:
    for (var i = 0; i < bufs.length; i++) {
        var buf = bufs[i];
        for (var j = 0; j < buf.length; j++) {
            b.push(buf[j]);
            if (b.length === 4) {
                if (charsProcessed === 0) {
                    // Check BOM first.
                    if (b[0] === 0xFF && b[1] === 0xFE && b[2] === 0 && b[3] === 0) {
                        return 'utf-32le';
                    }
                    if (b[0] === 0 && b[1] === 0 && b[2] === 0xFE && b[3] === 0xFF) {
                        return 'utf-32be';
                    }
                }

                if (b[0] !== 0 || b[1] > 0x10) invalidBE++;
                if (b[3] !== 0 || b[2] > 0x10) invalidLE++;

                if (b[0] === 0 && b[1] === 0 && (b[2] !== 0 || b[3] !== 0)) bmpCharsBE++;
                if ((b[0] !== 0 || b[1] !== 0) && b[2] === 0 && b[3] === 0) bmpCharsLE++;

                b.length = 0;
                charsProcessed++;

                if (charsProcessed >= 100) {
                    break outer_loop;
                }
            }
        }
    }

    // Make decisions.
    if (bmpCharsBE - invalidBE > bmpCharsLE - invalidLE)  return 'utf-32be';
    if (bmpCharsBE - invalidBE < bmpCharsLE - invalidLE)  return 'utf-32le';

    // Couldn't decide (likely all zeros or not enough data).
    return defaultEncoding || 'utf-32le';
}
