/**
 * Lê campos de um Buffer sequencialmente, sem precisar calcular offsets
 * manualmente a cada campo. Cada leitura avança o cursor pelo tamanho do
 * tipo lido, então a ordem em que você chama os métodos precisa bater
 * exatamente com a ordem dos campos no struct da spec do F1 24.
 *
 * Todos os valores do protocolo são little-endian (ver spec: "all values
 * are encoded using Little Endian format").
 */
export class BufferCursor {
  private offset: number;

  constructor(private readonly buffer: Buffer, startOffset = 0) {
    this.offset = startOffset;
  }

  get position(): number {
    return this.offset;
  }

  readUInt8(): number {
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readInt8(): number {
    const value = this.buffer.readInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUInt16LE(): number {
    const value = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  readInt16LE(): number {
    const value = this.buffer.readInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  readUInt32LE(): number {
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readFloatLE(): number {
    const value = this.buffer.readFloatLE(this.offset);
    this.offset += 4;
    return value;
  }

  readBigUInt64LE(): bigint {
    const value = this.buffer.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  readArray<T>(length: number, readFn: () => T): T[] {
    return Array.from({ length }, readFn);
  }

  skip(bytes: number): void {
    this.offset += bytes;
  }
}
