
class Utf7Codec {
    constructor(codecOptions, iconv) {
        this.iconv = iconv;
    }
    encoder = Utf7Encoder;
    decoder = Utf7Decoder;
    bomAware = true;
};



// -- Encoding

var nonDirectChars = /[^A-Za-z0-9'\(\),-\.\/:\? \n\r\t]+/g;

class Utf7Encoder {
    constructor(options, codec) {
        this.iconv = codec.iconv;
    }
    write(str) {
        // Naive implementation.
        // Non-direct chars are encoded as "+<base64>-"; single "+" char is encoded as "+-".
        return Buffer.from(str.replace(nonDirectChars, function (chunk) {
            return "+" + (chunk === '+' ? '' :
                this.iconv.encode(chunk, 'utf16-be').toString('base64').replace(/=+$/, ''))
                + "-";
        }.bind(this)));
    }
    end() {
    }
}




// -- Decoding

class Utf7Decoder {
    constructor(options, codec) {
        this.iconv = codec.iconv;
        this.inBase64 = false;
        this.base64Accum = '';
    }
    write(buf) {
        var res = "", lastI = 0, inBase64 = this.inBase64, base64Accum = this.base64Accum;

        // The decoder is more involved as we must handle chunks in stream.
        for (var i = 0; i < buf.length; i++) {
            if (!inBase64) { // We're in direct mode.
                // Write direct chars until '+'
                if (buf[i] == plusChar) {
                    res += this.iconv.decode(buf.slice(lastI, i), "ascii"); // Write direct chars.
                    lastI = i + 1;
                    inBase64 = true;
                }
            } else { // We decode base64.
                if (!base64Chars[buf[i]]) { // Base64 ended.
                    if (i == lastI && buf[i] == minusChar) { // "+-" -> "+"
                        res += "+";
                    } else {
                        var b64str = base64Accum + this.iconv.decode(buf.slice(lastI, i), "ascii");
                        res += this.iconv.decode(Buffer.from(b64str, 'base64'), "utf16-be");
                    }

                    if (buf[i] != minusChar) // Minus is absorbed after base64.
                        i--;

                    lastI = i + 1;
                    inBase64 = false;
                    base64Accum = '';
                }
            }
        }

        if (!inBase64) {
            res += this.iconv.decode(buf.slice(lastI), "ascii"); // Write direct chars.
        } else {
            var b64str = base64Accum + this.iconv.decode(buf.slice(lastI), "ascii");

            var canBeDecoded = b64str.length - (b64str.length % 8); // Minimal chunk: 2 quads -> 2x3 bytes -> 3 chars.
            base64Accum = b64str.slice(canBeDecoded); // The rest will be decoded in future.
            b64str = b64str.slice(0, canBeDecoded);

            res += this.iconv.decode(Buffer.from(b64str, 'base64'), "utf16-be");
        }

        this.inBase64 = inBase64;
        this.base64Accum = base64Accum;

        return res;
    }
    end() {
        var res = "";
        if (this.inBase64 && this.base64Accum.length > 0)
            res = this.iconv.decode(Buffer.from(this.base64Accum, 'base64'), "utf16-be");

        this.inBase64 = false;
        this.base64Accum = '';
        return res;
    }
}

var base64Regex = /[A-Za-z0-9\/+]/;
var base64Chars = [];
for (var i = 0; i < 256; i++)
    base64Chars[i] = base64Regex.test(String.fromCharCode(i));

var plusChar = '+'.charCodeAt(0),
    minusChar = '-'.charCodeAt(0),
    andChar = '&'.charCodeAt(0);

var base64IMAPChars = base64Chars.slice();
base64IMAPChars[','.charCodeAt(0)] = true;

export const utf7imap = Utf7IMAPCodec;
class Utf7IMAPCodec {
    constructor(codecOptions, iconv) {
        this.iconv = iconv;
    }
};

Utf7IMAPCodec.prototype.encoder = Utf7IMAPEncoder;
Utf7IMAPCodec.prototype.decoder = Utf7IMAPDecoder;
Utf7IMAPCodec.prototype.bomAware = true;


// -- Encoding

class Utf7IMAPEncoder {
    constructor(options, codec) {
        this.iconv = codec.iconv;
        this.inBase64 = false;
        this.base64Accum = Buffer.alloc(6);
        this.base64AccumIdx = 0;
    }
    write(str) {
        var inBase64 = this.inBase64, base64Accum = this.base64Accum, base64AccumIdx = this.base64AccumIdx, buf = Buffer.alloc(str.length * 5 + 10), bufIdx = 0;

        for (var i = 0; i < str.length; i++) {
            var uChar = str.charCodeAt(i);
            if (0x20 <= uChar && uChar <= 0x7E) { // Direct character or '&'.
                if (inBase64) {
                    if (base64AccumIdx > 0) {
                        bufIdx += buf.write(base64Accum.slice(0, base64AccumIdx).toString('base64').replace(/\//g, ',').replace(/=+$/, ''), bufIdx);
                        base64AccumIdx = 0;
                    }

                    buf[bufIdx++] = minusChar; // Write '-', then go to direct mode.
                    inBase64 = false;
                }

                if (!inBase64) {
                    buf[bufIdx++] = uChar; // Write direct character

                    if (uChar === andChar) // Ampersand -> '&-'
                        buf[bufIdx++] = minusChar;
                }

            } else { // Non-direct character
                if (!inBase64) {
                    buf[bufIdx++] = andChar; // Write '&', then go to base64 mode.
                    inBase64 = true;
                }
                if (inBase64) {
                    base64Accum[base64AccumIdx++] = uChar >> 8;
                    base64Accum[base64AccumIdx++] = uChar & 0xFF;

                    if (base64AccumIdx == base64Accum.length) {
                        bufIdx += buf.write(base64Accum.toString('base64').replace(/\//g, ','), bufIdx);
                        base64AccumIdx = 0;
                    }
                }
            }
        }

        this.inBase64 = inBase64;
        this.base64AccumIdx = base64AccumIdx;

        return buf.slice(0, bufIdx);
    }
    end() {
        var buf = Buffer.alloc(10), bufIdx = 0;
        if (this.inBase64) {
            if (this.base64AccumIdx > 0) {
                bufIdx += buf.write(this.base64Accum.slice(0, this.base64AccumIdx).toString('base64').replace(/\//g, ',').replace(/=+$/, ''), bufIdx);
                this.base64AccumIdx = 0;
            }

            buf[bufIdx++] = minusChar; // Write '-', then go to direct mode.
            this.inBase64 = false;
        }

        return buf.slice(0, bufIdx);
    }
}




// -- Decoding

class Utf7IMAPDecoder {
    constructor(options, codec) {
        this.iconv = codec.iconv;
        this.inBase64 = false;
        this.base64Accum = '';
    }
    write(buf) {
        var res = "", lastI = 0, inBase64 = this.inBase64, base64Accum = this.base64Accum;

        // The decoder is more involved as we must handle chunks in stream.
        // It is forgiving, closer to standard UTF-7 (for example, '-' is optional at the end).
        for (var i = 0; i < buf.length; i++) {
            if (!inBase64) { // We're in direct mode.
                // Write direct chars until '&'
                if (buf[i] == andChar) {
                    res += this.iconv.decode(buf.slice(lastI, i), "ascii"); // Write direct chars.
                    lastI = i + 1;
                    inBase64 = true;
                }
            } else { // We decode base64.
                if (!base64IMAPChars[buf[i]]) { // Base64 ended.
                    if (i == lastI && buf[i] == minusChar) { // "&-" -> "&"
                        res += "&";
                    } else {
                        var b64str = base64Accum + this.iconv.decode(buf.slice(lastI, i), "ascii").replace(/,/g, '/');
                        res += this.iconv.decode(Buffer.from(b64str, 'base64'), "utf16-be");
                    }

                    if (buf[i] != minusChar) // Minus may be absorbed after base64.
                        i--;

                    lastI = i + 1;
                    inBase64 = false;
                    base64Accum = '';
                }
            }
        }

        if (!inBase64) {
            res += this.iconv.decode(buf.slice(lastI), "ascii"); // Write direct chars.
        } else {
            var b64str = base64Accum + this.iconv.decode(buf.slice(lastI), "ascii").replace(/,/g, '/');

            var canBeDecoded = b64str.length - (b64str.length % 8); // Minimal chunk: 2 quads -> 2x3 bytes -> 3 chars.
            base64Accum = b64str.slice(canBeDecoded); // The rest will be decoded in future.
            b64str = b64str.slice(0, canBeDecoded);

            res += this.iconv.decode(Buffer.from(b64str, 'base64'), "utf16-be");
        }

        this.inBase64 = inBase64;
        this.base64Accum = base64Accum;

        return res;
    }
    end() {
        var res = "";
        if (this.inBase64 && this.base64Accum.length > 0)
            res = this.iconv.decode(Buffer.from(this.base64Accum, 'base64'), "utf16-be");

        this.inBase64 = false;
        this.base64Accum = '';
        return res;
    }
}

export default {
    utf7: Utf7Codec,
    unicode11utf7: 'utf7' // Alias UNICODE-1-1-UTF-7
}
