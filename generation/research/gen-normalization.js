// This script generates unicode normalization data.

import { getFile, parseText } from "../utils.js";

const baseUrl = "http://www.unicode.org/Public/6.3.0/ucd/";

// Convert async.parallel to Promise.all
Promise.all([
    getFile(baseUrl + "UnicodeData.txt"),
    getFile(baseUrl + "CompositionExclusions.txt")
]).then(([data, exclusions]) => {
    const features = {};

    // Parse Unicode data
    parseText(data, ";").map(entry => {
        const ch = parseInt(entry[0], 16);
        const combiningClass = parseInt(entry[3], 10) || 0;
        const decompStr = entry[5].trim();
        let canonical, decomp;

        if (decompStr.length > 0) {
            decomp = decompStr.split(" ").map(s => parseInt(s, 16));
            canonical = true;
            if (isNaN(decomp[0])) {  // When first item is a tag, this is a 'compatibility decomposition'
                canonical = false;
                decomp.shift();
            }
        }

        if (decomp || combiningClass) {
            features[ch] = {
                decomp,
                canonical,
                combiningClass,
            };
        }
    });

    // Process CompositionExclusions.txt
    parseText(exclusions).map(entry => {
        const ch = parseInt(entry[0], 16);
        features[ch].noCompose = true;
    });

    // Exclude Non-Starter Decompositions and Singleton Decompositions
    for (const ch in features) {
        const feat = features[ch];
        if (feat.canonical && (feat.decomp.length == 1 || feat.combiningClass || (features[feat.decomp[0]] || {}).combiningClass)) {
            feat.noCompose = true;
        }
    }

    // Add Jamo decompositions
    const LBase = 0x1100, VBase = 0x1161, TBase = 0x11A7, SBase = 0xAC00;
    const LCount = 19, VCount = 21, TCount = 28;

    for (let l = 0; l < LCount; l++) {
        for (let v = 0; v < VCount; v++) {
            const lv = l * VCount * TCount + v * TCount + SBase;
            features[lv] = {
                decomp: [l + LBase, v + VBase],
                canonical: true,
                combiningClass: 0
            }

            for (let t = 1; t < TCount; t++) {
                features[lv + t] = {
                    decomp: [lv, t + TBase],
                    canonical: true,
                    combiningClass: 0
                };
            }
        }
    }

    // Helper functions
    const f = ch => features[ch] || { combiningClass: 0 };
    const hex = ch => (+ch).toString(16);

    const decompose = (ch, canonical) => {
        const feat = f(ch);
        if (feat.decomp && (feat.canonical || !canonical)) {
            return [].concat(...feat.decomp.map(c => decompose(c, canonical)));
        }
        return [ch];
    }

    // Validation checks
    for (const charCode in features) {
        const feat = f(charCode);
        if (feat.decomp && feat.canonical) {
            if (feat.decomp.length == 1) {
                if (f(feat.decomp[0]).combiningClass != feat.combiningClass)
                    console.log("!!1", hex(charCode), "->", feat.decomp.map(hex));

            } else if (feat.decomp.length == 2) {
                if (f(feat.decomp[0]).combiningClass != feat.combiningClass)
                    console.log("!!2", hex(charCode), "->", feat.decomp.map(hex));

            } else {
                console.log("comp - not 1 or 2", hex(charCode));
            }
        }
    }
}).catch(error => {
    console.error('Error:', error);
});


