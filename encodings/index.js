// Update this array if you add/rename/remove files in this directory.
// We support Browserify by skipping automatic module discovery and requiring modules directly.
import * as internal from './internal.js';
import * as utf32 from './utf32.js';
import * as utf16 from './utf16.js';
import * as utf7 from './utf7.js';
import * as sbcsCodec from './sbcs-codec.js';
import * as sbcsData from './sbcs-data.js';
import * as sbcsDataGenerated from './sbcs-data-generated.js';
import * as dbcsCodec from './dbcs-codec.js';
import * as dbcsData from './dbcs-data.js';

const modules = [
    internal,
    utf32,
    utf16,
    utf7,
    sbcsCodec,
    sbcsData,
    sbcsDataGenerated,
    dbcsCodec,
    dbcsData,
];

// Put all encoding/alias/codec definitions to single object and export it.
const exports = {};
for (const module of modules) {
    Object.assign(exports, module);
}

export default exports;
