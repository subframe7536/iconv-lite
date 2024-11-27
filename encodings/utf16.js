
class Utf16BECodec {
    constructor() {
    }
    encoder = Utf16BEEncoder;
    decoder = Utf16BEDecoder;
    bomAware = true;
}

// -- Encoding

class Utf16BEEncoder {
    constructor() {
    }
    write(str) {
        var buf = Buffer.from(str, 'ucs2');
        for (var i = 0; i < buf.length; i += 2) {
            var tmp = buf[i]; buf[i] = buf[i + 1]; buf[i + 1] = tmp;
        }
        return buf;
    }
    end() {
    }
}

// -- Decoding

class Utf16BEDecoder {
    constructor() {
        this.overflowByte = -1;
    }
    write(buf) {
        if (buf.length == 0)
            return '';

        var buf2 = Buffer.alloc(buf.length + 1), i = 0, j = 0;

        if (this.overflowByte !== -1) {
            buf2[0] = buf[0];
            buf2[1] = this.overflowByte;
            i = 1; j = 2;
        }

        for (; i < buf.length - 1; i += 2, j += 2) {
            buf2[j] = buf[i + 1];
            buf2[j + 1] = buf[i];
        }

        this.overflowByte = (i == buf.length - 1) ? buf[buf.length - 1] : -1;

        return buf2.slice(0, j).toString('ucs2');
    }
    end() {
        this.overflowByte = -1;
    }
}

export const utf16 = Utf16Codec;
class Utf16Codec {
    constructor(codecOptions, iconv) {
        this.iconv = iconv;
    }
    encoder = Utf16Encoder;
    decoder = Utf16Decoder;
}

// -- Encoding (pass-through)

class Utf16Encoder {
    constructor(options, codec) {
        options = options || {};
        if (options.addBOM === undefined)
            options.addBOM = true;
        this.encoder = codec.iconv.getEncoder('utf-16le', options);
    }
    write(str) {
        return this.encoder.write(str);
    }
    end() {
        return this.encoder.end();
    }
}

// -- Decoding

class Utf16Decoder {
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

            if (this.initialBufsLen < 16) // We need more bytes to use space heuristic (see below)
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
    var asciiCharsLE = 0, asciiCharsBE = 0; // Number of ASCII chars when decoded as LE or BE.

    outer_loop:
    for (var i = 0; i < bufs.length; i++) {
        var buf = bufs[i];
        for (var j = 0; j < buf.length; j++) {
            b.push(buf[j]);
            if (b.length === 2) {
                if (charsProcessed === 0) {
                    // Check BOM first.
                    if (b[0] === 0xFF && b[1] === 0xFE) return 'utf-16le';
                    if (b[0] === 0xFE && b[1] === 0xFF) return 'utf-16be';
                }

                if (b[0] === 0 && b[1] !== 0) asciiCharsBE++;
                if (b[0] !== 0 && b[1] === 0) asciiCharsLE++;

                b.length = 0;
                charsProcessed++;

                if (charsProcessed >= 100) {
                    break outer_loop;
                }
            }
        }
    }

    // Make decisions.
    // Most of the time, the content has ASCII chars (U+00**), but the opposite (U+**00) is uncommon.
    // So, we count ASCII as if it was LE or BE, and decide from that.
    if (asciiCharsBE > asciiCharsLE) return 'utf-16be';
    if (asciiCharsBE < asciiCharsLE) return 'utf-16le';

    // Couldn't decide (likely all zeros or not enough data).
    return defaultEncoding || 'utf-16le';
}

export default {
    utf16be: Utf16BECodec
}
