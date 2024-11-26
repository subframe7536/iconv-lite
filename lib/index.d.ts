// Basic API
export function decode(buffer: Uint8Array, encoding: string, options?: Options): string;

export function encode(content: string, encoding: string, options?: Options): Uint8Array;

export function encodingExists(encoding: string): boolean;

// Low-level stream APIs
export function getEncoder(encoding: string, options?: Options): EncoderStream;

export function getDecoder(encoding: string, options?: Options): DecoderStream;

export interface Options {
    stripBOM?: boolean;
    addBOM?: boolean;
    defaultEncoding?: string;
}

export interface EncoderStream {
	write(str: string): Uint8Array;
	end(): Uint8Array | undefined;
}

export interface DecoderStream {
	write(buf: Uint8Array): string;
	end(): string | undefined;
}
