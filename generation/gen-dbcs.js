import * as utils from "./utils.js";

Promise.all([
    utils.getFile("http://encoding.spec.whatwg.org/index-big5.txt"),
    utils.getFile("http://encoding.spec.whatwg.org/index-gb18030.txt"),
    utils.getFile("http://encoding.spec.whatwg.org/index-gb18030-ranges.txt"),
    utils.getFile("http://encoding.spec.whatwg.org/index-euc-kr.txt"),
    utils.getFile("http://encoding.spec.whatwg.org/index-jis0208.txt"),
    utils.getFile("http://encoding.spec.whatwg.org/index-jis0212.txt"),
    utils.getFile("http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP932.TXT"),
    utils.getFile("http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP936.TXT"),
    utils.getFile("http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP949.TXT"),
    utils.getFile("http://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WINDOWS/CP950.TXT"),
]).then(data => {
    // First, parse all files.
    const encodings = ["$big5", "$gbk", "$gbRanges", "$eucKr", "$jis0208", "$jis0212", "$cp932", "cp936", "cp949", "cp950"];
    const parsedData = {};
    encodings.forEach((enc, index) => {
        const dbcs = {};
        utils.parseText(data[index]).map(a => {
            const dbcsCode = parseInt(a[0]);
            const unicode = parseInt(a[1]);
            if (!isNaN(unicode)) dbcs[dbcsCode] = unicode;
        });
        parsedData[enc] = dbcs;
    });

    // Calculate difference between big5 and cp950, and write it to a file.
    // See http://encoding.spec.whatwg.org/#big5
    const big5add = {};
    let big5Char = undefined;
    for (let i = 0x8100; i < 0x10000; i++) { // Lead byte is 0x81 .. 0xFE
        const trail = i & 0xFF;
        if (trail < 0x40 || (0x7E < trail && trail < 0xA1) || trail > 0xFE) continue;
        const lead = i >> 8;
        const offset = (trail < 0x7F) ? 0x40 : 0x62;
        const pointer = (lead - 0x81) * 157 + (trail - offset);
        const cpChar = parsedData.cp950[i];
        big5Char = parsedData.$big5[pointer];
        if (big5Char !== undefined && cpChar != big5Char) big5add[i] = big5Char;
    }

    // Calculate HKSCS codes that are duplicates of big5 codes and need to be skipped when encoding.
    console.log("Duplicate HKSCS codes that need to be skipped when encoded (see encodeSkipVals in big5hkscs): ")
    const big5codes = {};
    for (let i = 0xA100; i < 0x10000; i++) {
        const uCharCode = (big5add[i] !== undefined) ? big5add[i] : parsedData.cp950[i];
        if (uCharCode !== undefined) {
            big5codes[uCharCode] = true;
        }
    }
    for (let i = 0x8100; i < 0xA100; i++) {
        const uCharCode = (big5add[i] !== undefined) ? big5add[i] : parsedData.cp950[i];
        if (uCharCode !== undefined && big5codes[uCharCode]) {
            console.log("0x"+i.toString(16));
        }
    }
    if (big5Char !== undefined) {
        if (lead < 0xA1) {
            if (d[big5Char] !== undefined) {
                console.log("duplicate in first: "+ pointer + " char " + big5Char);
            }
            d[big5Char] = i;
        } else if (d[big5Char] !== undefined) {
            console.log("dup 0x"+d[big5Char].toString(16) + " -> " + i.toString(16))
        }
    }

    // Add char sequences that are not in the index file (as given in http://encoding.spec.whatwg.org/#big5-decoder)
    function toIdx(pointer) {
        const trail = pointer % 157; const lead = Math.floor(pointer / 157) + 0x81; return (lead << 8) + (trail + (trail < 0x3F ? 0x40 : 0x62))
    }
    big5add[toIdx(1133)] = [0x00CA, 0x0304];
    big5add[toIdx(1135)] = [0x00CA, 0x030C];
    big5add[toIdx(1164)] = [0x00EA, 0x0304];
    big5add[toIdx(1166)] = [0x00EA, 0x030C];

    utils.writeTable("big5-added", utils.generateTable(big5add));

    // Calculate difference between GB18030 encoding and cp936.
    // See http://encoding.spec.whatwg.org/#gb18030-encoder
    const gbkadd = {};
    for (let i = 0x8100; i < 0x10000; i++) { // Lead byte is 0x81 .. 0xFE
        const trail = i & 0xFF;
        if (trail < 0x40 || trail === 0x7F || trail > 0xFE) continue;
        const lead = i >> 8;
        const offset = (trail < 0x7F) ? 0x40 : 0x41;
        const gbAddr = (lead - 0x81) * 190 + (trail - offset);
        const cpChar = parsedData.cp936[i];
        const gbChar = parsedData.$gbk[gbAddr];
        if ((cpChar !== undefined) && (cpChar != gbChar))
            console.log("Dont match: ", i.toString(16), gbAddr.toString(16), gbChar, cpChar);

        if (gbChar !== undefined && cpChar != gbChar)
            gbkadd[i] = gbChar;
    }

    // GB18030:2005 addition
    const gbk2005add = [['8135f437', '']];

    utils.writeTable("gbk-added", utils.generateTable(gbkadd).concat(gbk2005add));

    // Write GB18030 ranges
    const ranges = { uChars: [], gbChars: [] };
    for (const k in parsedData.$gbRanges) {
        ranges.uChars.push(parsedData.$gbRanges[k]);
        ranges.gbChars.push(+k);
    }
    utils.writeFile("gb18030-ranges", JSON.stringify(ranges));


    // Use http://encoding.spec.whatwg.org/#shift_jis-decoder
    const shiftjis = {};
    for (let i = 0; i <= 0x80; i++)
        shiftjis[i] = i;
    for (let i = 0xA1; i <= 0xDF; i++)
        shiftjis[i] = 0xFF61 + i - 0xA1;

    for (let lead = 0x81; lead < 0xFF; lead++)
        if (lead < 0xA1 || lead > 0xDF)
            for (let byte = 0; byte < 0xFF; byte++) {
                const offset = (byte < 0x7F) ? 0x40 : 0x41;
                const leadOffset = (lead < 0xA0) ? 0x81 : 0xC1;
                if ((0x40 <= byte && byte <= 0x7E) || (0x80 <= byte && byte <= 0xFC)) {
                    const pointer = (lead - leadOffset) * 188 + byte - offset;
                    if (parsedData.$jis0208[pointer])
                        shiftjis[(lead << 8) + byte] = parsedData.$jis0208[pointer];
                    else if (8836 <= pointer && pointer <= 10528)
                        shiftjis[(lead << 8) + byte] = 0xE000 + pointer - 8836; // Interoperable legacy from Windows known as EUDC
                }
            }

    utils.writeTable("shiftjis", utils.generateTable(shiftjis));

    // Fill out EUC-JP table according to http://encoding.spec.whatwg.org/#euc-jp
    const eucJp = {};
    for (let i = 0; i < 0x80; i++)
        eucJp[i] = i;
    for (let i = 0xA1; i <= 0xDF; i++)
        eucJp[(0x8E << 8) + i] = 0xFF61 + i - 0xA1;
    for (let i = 0xA1; i <= 0xFE; i++)
        for (let j = 0xA1; j <= 0xFE; j++) {
            eucJp[               (i << 8) + j] = parsedData.$jis0208[(i - 0xA1) * 94 + (j - 0xA1)];
            eucJp[(0x8F << 16) + (i << 8) + j] = parsedData.$jis0212[(i - 0xA1) * 94 + (j - 0xA1)];
        }

    utils.writeTable("eucjp", utils.generateTable(eucJp, 3));


    // Fill out EUC-KR Table and check that it is the same as cp949.
    const eucKr = {};
    for (let i = 0; i < 0x80; i++)
        eucKr[i] = i;
    for (let i = 0x8100; i < 0xFF00; i++) {
        const lead = i >> 8, byte = i & 0xFF;
        let ptr = null;
        if (0x41 <= byte && byte <= 0xFE)
            ptr = (lead-0x81) * 190 + (byte-0x41);
        if (ptr !== null)
            eucKr[i] = parsedData.$eucKr[ptr];

        // Compare with cp949
        if (parsedData.cp949[i] !== eucKr[i])
            console.log("Warning: EUC-KR from Encoding Standard doesn't match with CP949 from Unicode.com: ", i, parsedData.cp949[i], eucKr[i]);
    }


    // Write all plain tables as-is.
    for (const enc in parsedData)
        if (enc[0] != "$")
            utils.writeTable(enc, utils.generateTable(parsedData[enc]));


    console.log("DBCS encodings regenerated.");
}).catch(console.error);


