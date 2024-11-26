import type { Encoder, Decoder, EncoderOptions, DecoderOptions } from './index.js';

const BOMChar = '\uFEFF';

export class PrependBOM implements Encoder {
    private encoder: Encoder;
    private addBOM: boolean;

    constructor(encoder: Encoder, options: EncoderOptions) {
        this.encoder = encoder;
        this.addBOM = true;
    }

    write(str: string): Uint8Array {
        if (this.addBOM) {
            str = BOMChar + str;
            this.addBOM = false;
        }

        return this.encoder.write(str);
    }

    end(): Uint8Array | undefined {
        return this.encoder.end();
    }
}

export class StripBOM implements Decoder {
    private decoder: Decoder;
    private pass: boolean;
    private options: DecoderOptions;

    constructor(decoder: Decoder, options?: DecoderOptions) {
        this.decoder = decoder;
        this.pass = false;
        this.options = options || {};
    }

    write(buf: Uint8Array): string {
        const res = this.decoder.write(buf);
        if (this.pass || !res)
            return res;

        if (res[0] === BOMChar) {
            const stripped = res.slice(1);
            if (typeof this.options.stripBOM === 'function')
                this.options.stripBOM();
            return stripped;
        }

        this.pass = true;
        return res;
    }

    end(): Uint8Array | undefined {
        return this.decoder.end();
    }
}