// utils.js
import fs from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_DATA_FOLDER = join(__dirname, 'source-data');

/**
 * Fetches file content: tries to read from local 'source-data' cache first;
 * if not found, downloads from URL and caches it locally.
 * @param {string} url - The URL of the file to fetch
 * @returns {Promise<string>} The file content as a string
 */
export async function getFile(url) {
    const filename = basename(url);
    const localPath = join(SOURCE_DATA_FOLDER, filename);

    try {
        // Try reading from local cache
        return await fs.promises.readFile(localPath, 'utf8');
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;

        // File not in cache — download from network
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());

        // Ensure directory exists and write file
        await fs.promises.mkdir(SOURCE_DATA_FOLDER, { recursive: true });
        await fs.promises.writeFile(localPath, buffer);

        return buffer.toString('utf8');
    }
}

/**
 * Parses text into a 2D array of strings.
 * - Lines starting with '#' (or containing '#') are truncated at '#'.
 * - Empty lines and empty fields are removed.
 * @param {string} text - Input text
 * @param {string|RegExp} [splitChar] - Separator (default: one or more whitespace chars)
 * @returns {string[][]} Parsed 2D array
 */
export function parseText(text, splitChar) {
    const lines = text
        .split('\n')
        .map(line => line.split('#')[0].trim()) // Remove comments
        .filter(Boolean); // Remove empty lines

    const separator = splitChar ?? /\s+/;
    return lines.map(line =>
        line
            .split(separator)
            .map(s => s.trim())
            .filter(Boolean)
    );
}

/**
 * Converts an array of character codes (or code sequences) into a string.
 * - Supports code points > 0xFFFF (uses surrogate pairs automatically via String.fromCodePoint).
 * - If an element is an array (a sequence), it is prefixed with U+0FFF - (length - 2).
 *   (U+0FFF is unassigned and chosen for its compactness.)
 * @param {(number|number[])[]} arr - Array of char codes or sequences
 * @returns {string} Resulting string
 */
function arrToStr(arr) {
    let result = '';

    for (const item of arr) {
        if (Array.isArray(item)) {
            if (item.length === 1) {
                result += arrToStr(item);
            } else if (item.length > 1) {
                const prefixCode = 0xFFF - (item.length - 2);
                result += String.fromCodePoint(prefixCode) + arrToStr(item);
            }
        } else if (item > 0xFFFF) {
            // Use fromCodePoint to handle surrogate pairs correctly
            result += String.fromCodePoint(item);
        } else {
            // Basic Multilingual Plane character
            result += String.fromCharCode(item);
        }
    }

    return result;
}

/**
 * Generates a compact lookup table from a DBCS-to-Unicode mapping.
 * - Groups consecutive code points into ranges.
 * - Long increasing sequences (≥4) are compressed as [string, length].
 * @param {Object<number, number|number[]>} dbcs - Mapping from DBCS code (number) to Unicode code/sequence
 * @param {number} [maxBytes=2] - Maximum byte length of DBCS encoding (e.g., 2 for double-byte)
 * @returns {(string|number)[][]} Generated table
 */
export function generateTable(dbcs, maxBytes = 2) {
    const minSeqLen = 4;
    const table = [];
    const max = 1 << (maxBytes * 8);

    let range = null;      // Current range: [startHex, ...segments]
    let block = [];        // Current block of Unicode values
    let seqLen = 0;        // Length of current increasing numeric sequence

    for (let i = 0x0000; i < max; i++) {
        if (dbcs[i] !== undefined) {
            if (dbcs[i - 1] === undefined) {
                // Start of a new range
                range = [i.toString(16)];
                block = [];
                seqLen = 0;
            } else {
                // Check if current and previous are numbers and form an increasing sequence
                const prev = dbcs[i - 1];
                const curr = dbcs[i];

                if (
                    typeof prev === 'number' &&
                    typeof curr === 'number' &&
                    prev + 1 === curr
                ) {
                    // Extend increasing sequence
                    seqLen++;
                } else {
                    // Sequence broken (or involves arrays)
                    if (seqLen >= minSeqLen) {
                        range.push(arrToStr(block.slice(0, -seqLen)), seqLen);
                        block = [];
                    }
                    seqLen = 0;
                }
            }

            block.push(dbcs[i]);
        } else if (range) {
            // End of current range
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

/**
 * Writes a table to a JSON file in the encodings/tables directory.
 * @param {string} name - Filename (without .json extension)
 * @param {any[]} table - Table data to write
 * @returns {Promise<void>}
 */
export function writeTable(name, table) {
    const content = '[\n' + table.map(item => JSON.stringify(item)).join(',\n') + '\n]\n';
    writeFile(name, content);
}

export function writeFile(name, body) {
    fs.writeFileSync(join(__dirname, "../encodings/tables", name + ".json"), body);
}
