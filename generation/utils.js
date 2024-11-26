import fs from 'fs';
import path from 'path';

// Common utilities used in scripts.

export async function getFile(url) {
    const sourceDataFolder = path.join(process.cwd(), "source-data");
    if (!fs.existsSync(sourceDataFolder)) {
        fs.mkdirSync(sourceDataFolder, { recursive: true });
    }
    const fullpath = path.join(sourceDataFolder, path.basename(url));

    if (fs.existsSync(fullpath)) {
        const text = fs.readFileSync(fullpath, "utf8");
        return text;
    }

    // Fetch the URL using native fetch (requires a polyfill in Node.js)
    return await fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.text();
        })
        .then(text => {
            fs.writeFileSync(fullpath, text, "utf8");
            return text;
        });
}

// Returns array of arrays.
export function parseText(text, splitChar) {
    return text.split("\n").map(function(line) {
        return line.split("#")[0].trim();
    }).filter(Boolean).map(function(line) {
        return line.split(splitChar || /\s+/).map(function(s) { return s.trim() }).filter(Boolean);
    });
}

// Convert array of character codes to string. Character codes can be > 0xFFFF,
// so we emit surrogates when needed. Also, some character codes are actually
// sequences (arrays) - we emit them prepended with U+0FFF-(length-2).
// U+0FFF was chosen because it's small and unassigned, as well as 32 chars before it
function arrToStr(arr) {
    let s = '';
    for (let i = 0; i < arr.length; i++) {
        if (Array.isArray(arr[i])) {
            if (arr[i].length === 1) {
                s += arrToStr(arr[i]);
            } else if (arr[i].length > 1) {
                s += String.fromCharCode(0xFFF - (arr[i].length - 2)) + arrToStr(arr[i]);
            }
        } else if (arr[i] > 0xFFFF) {
            // Surrogates
            s += String.fromCharCode(0xD800 + Math.floor((arr[i] - 0x10000) / 0x400)) +
                String.fromCharCode(0xDC00 + (arr[i] - 0x10000) % 0x400);
        } else {
            // Basic characters.
            s += String.fromCharCode(arr[i]);
        }
    }
    return s;
}

// Input: map <dbcs num> -> <unicode num>
// Resulting format: Array of chunks, each chunk is:
// [0] = address of start of the chunk, hex string.
// <str> - characters of the chunk.
// <num> - increasing sequence of the length num, starting with prev character.
export function generateTable(dbcs, maxBytes) {
    const minSeqLen = 4;
    const table = [];
    let range, block, seqLen;
    const max = 1 << ((maxBytes || 2) * 8);

    for (let i = 0x0000; i < max; i++) {
        if (dbcs[i] !== undefined) {
            if (dbcs[i - 1] === undefined) { // Range started.
                range = [i.toString(16)]; // Range[0] is starting address.
                block = []; // Current block of character codes.
                seqLen = 0; // Increasing sequence length at the end of the block.
            } else if (typeof dbcs[i - 1] === 'number' && // We have arrays as elements of dbcs - check against it.
                       typeof dbcs[i] === 'number' &&
                       dbcs[i - 1] + 1 === dbcs[i]) { // Increasing sequence continues - track its length.
                seqLen++;
            } else { // Increasing sequence ended (or not started at all).
                if (seqLen >= minSeqLen) {
                    // Seq is long enough: write prev segment and its length.
                    range.push(arrToStr(block.slice(0, -seqLen)), seqLen);
                    block = [];
                }
                seqLen = 0;
            }

            block.push(dbcs[i]);
        } else if (range) { // Range finished, write last segments.
            if (seqLen >= minSeqLen) {
                range.push(arrToStr(block.slice(0, -seqLen)), seqLen);
            } else {
                range.push(arrToStr(block));
            }

            table.push(range);
            range = null;
        }
    }

    return table;
}

export function writeTable(name, table) {
    fs.writeFileSync(path.join(process.cwd(), "encodings/tables", name + ".json"), "[\n" + table.map(a => JSON.stringify(a)).join(",\n") + "\n]\n");
}

export function writeFile(name, body) {
    fs.writeFileSync(path.join(process.cwd(), "encodings/tables", name + ".json"), body);
}

