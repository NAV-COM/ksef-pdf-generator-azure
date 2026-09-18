import { xml2js } from 'xml-js';
import { Faktura } from '../lib-public/types/fa2.types';

type Utf16Endiannes = 'utf-16le' | 'utf-16be';
export type XmlInput = Blob | ArrayBuffer | Uint8Array | string;

export function stripPrefix(key: string): string {
  return key.includes(':') ? key.split(':')[1] : key;
}

/**
 * Parses XML both in a browser and in Node.js/Azure Functions.
 * File is supported implicitly because File extends Blob.
 */
export async function parseXML(input: XmlInput): Promise<unknown> {
  const xmlStr = await readXmlText(input);

  return xml2js(xmlStr, {
    compact: true,
    cdataKey: '_text',
    trim: true,
    elementNameFn: stripPrefix,
    attributeNameFn: stripPrefix,
  }) as Faktura;
}

async function readXmlText(input: XmlInput): Promise<string> {
  if (typeof input === 'string') {
    return stripBom(input);
  }

  let bytes: Uint8Array;

  if (input instanceof Blob) {
    bytes = new Uint8Array(await input.arrayBuffer());
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }

  const encoding = detectEncoding(bytes);
  const text = new TextDecoder(encoding).decode(bytes);

  return stripBom(text);
}

function detectEncoding(bytes: Uint8Array): Utf16Endiannes | 'utf-8' {
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0x3c && bytes[1] === 0x00)) {
    return 'utf-16le';
  }

  if ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0x00 && bytes[1] === 0x3c)) {
    return 'utf-16be';
  }

  return 'utf-8';
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
