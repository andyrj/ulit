export type Optional<T> = T | undefined | null;
export const SVG = "SVG";
export const SVG_NS = "http://www.w3.org/2000/svg";
export const FOREIGN_OBJECT = "FOREIGNOBJECT";
export const PART_START = "{{";
export const PART_END = "}}";
export const PART = "part";
export const SERIAL_PART_START = `${PART_START}${PART}s:`;
export const PART_MARKER = `${PART_START}${PART_END}`;
export const TEMPLATE = "template";
export const DIRECTIVE = "directive";
export const ULIT = "ulit";
export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const COMMENT_NODE = 8;
export const DOCUMENT_FRAGMENT = 11;
export const EMPTY_STRING = "";

export function fail(msg?: Optional<string>): never {
  if (msg) {
    throw new RangeError(msg);
  } else {
    throw new RangeError();
  }
}
