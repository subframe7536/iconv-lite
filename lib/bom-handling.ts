import type { IEncoder, IDecoder, Options } from "./type.ts"

const BOMChar = "\uFEFF"

export class PrependBOMWrapper {
  private encoder: IEncoder
  private addBOM: boolean

  constructor (encoder: IEncoder) {
    this.encoder = encoder
    this.addBOM = true
  }

  write (str: string): Buffer<ArrayBuffer> {
    if (this.addBOM) {
      str = BOMChar + str
      this.addBOM = false
    }

    return this.encoder.write(str)
  }

  end (): Buffer | undefined {
    return this.encoder.end()
  }
}

export class StripBOMWrapper {
  private readonly decoder: IDecoder
  private pass: boolean
  private readonly options: Options

  constructor (decoder: IDecoder, options?: Options) {
    this.decoder = decoder
    this.pass = false
    this.options = options ?? {}
  }

  write (buf: Buffer): string {
    let res = this.decoder.write(buf)
    if (this.pass || !res) {
      return res
    }

    if (res[0] === BOMChar) {
      res = res.slice(1)
      if (typeof this.options.stripBOM === "function") {
        this.options.stripBOM()
      }
    }

    this.pass = true
    return res
  }

  end (): string | undefined {
    return this.decoder.end()
  }
}
