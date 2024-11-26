"use strict";

var Buffer = require("buffer").Buffer;

var bomHandling = require("./bom-handling"),
    iconv = module.exports;

// All codecs and aliases are kept here, keyed by encoding name/alias.
// They are lazy loaded in `iconv.getCodec` from `encodings/index.js`.
var lazyEncodings = null;
// Search for a codec in encodings. Cache codec data in _codecDataCache.
var _codecDataCache = new Map();

// Characters emitted in case of error.
iconv.defaultCharUnicode = '';
iconv.defaultCharSingleByte = '?';

// Public API.
iconv.encode = (str, encoding, options) => {
    str = "" + (str || ""); // Ensure string.

    var encoder = iconv.getEncoder(encoding, options);

    var res = encoder.write(str);
    var trail = encoder.end();

    return (trail && trail.length > 0) ? Buffer.concat([res, trail]) : res;
}

iconv.decode = (buf, encoding, options) => {
    if (typeof buf === 'string') {
        buf = Buffer.from("" + (buf || ""), "binary"); // Ensure buffer.
    }

    var decoder = iconv.getDecoder(encoding, options);

    var res = decoder.write(buf);
    var trail = decoder.end();

    return trail ? (res + trail) : res;
}

iconv.encodingExists = (enc) => {
    try {
        iconv.getCodec(enc);
        return true;
    } catch (e) {
        return false;
    }
}

iconv.getCodec = (encoding) => {
    if (!lazyEncodings)
        lazyEncodings = require("../encodings"); // Lazy load all encoding definitions.

    // Canonicalize encoding name: strip all non-alphanumeric chars and appended year.
    var enc = canonicalizeEncoding(encoding);

    // Traverse encodings to find actual codec.
    var codecOptions = {};
    while (true) {
        if (_codecDataCache.has(enc)) {
            return _codecDataCache.get(enc);
        }

        var codecDef = lazyEncodings[enc];

        switch (typeof codecDef) {
            case "string": // Direct alias to other encoding.
                enc = codecDef;
                break;

            case "object": // Alias with options. Can be layered.
                for (var key in codecDef)
                    codecOptions[key] = codecDef[key];

                if (!codecOptions.encodingName)
                    codecOptions.encodingName = enc;

                enc = codecDef.type;
                break;

            case "function": // Codec itself.
                if (!codecOptions.encodingName)
                    codecOptions.encodingName = enc;

                // The codec function must load all tables and return object with .encoder and .decoder methods.
                // It'll be called only once (for each different options object).
                codec = new codecDef(codecOptions, iconv);

                _codecDataCache.set(codecOptions.encodingName, codec); // Save it to be reused later.
                return codec;

            default:
                throw new Error("Encoding not recognized: '" + encoding + "' (searched as: '"+enc+"')");
        }
    }
}

function canonicalizeEncoding(encoding) {
    // Canonicalize encoding name: strip all non-alphanumeric chars and appended year.
    return (''+encoding).toLowerCase().replace(/:\d{4}$|[^0-9a-z]/g, "");
}

iconv.getEncoder = (encoding, options) => {
    var codec = iconv.getCodec(encoding),
        encoder = new codec.encoder(options, codec);

    if (codec.bomAware && options && options.addBOM)
        encoder = new bomHandling.PrependBOM(encoder, options);

    return encoder;
}

iconv.getDecoder = (encoding, options) => {
    var codec = iconv.getCodec(encoding),
        decoder = new codec.decoder(options, codec);

    if (codec.bomAware && !(options && options.stripBOM === false))
        decoder = new bomHandling.StripBOM(decoder, options);

    return decoder;
}
