// Update this array if you add/rename/remove files in this directory.
// We support Browserify by skipping automatic module discovery and requiring modules directly.
import { default as internal } from './internal.js';
import { default as utf32 } from './utf32.js';
import { default as utf16 } from './utf16.js';
import { default as utf7 } from './utf7.js';
import { default as sbcsCodec } from './sbcs-codec.js';
import { default as dbcsCodec } from './dbcs-codec.js';
import { default as sbcsData } from './sbcs-data.js';
import { default as sbcsDataGenerated } from './sbcs-data-generated.js';
import { default as dbcsData } from './dbcs-data.js';

const exports = {
    ...internal,
    ...utf32,
    ...utf16,
    ...utf7,
    ...sbcsCodec,
    ...dbcsCodec,
    ...sbcsData,
    ...sbcsDataGenerated,
    ...dbcsData
};
export default exports;
