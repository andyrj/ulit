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

export type WalkFn = (
  parent: Node,
  element: Node | null | undefined,
  path: Array<string | number>
) => boolean;

export function walkDOM(
  parent: HTMLElement | DocumentFragment,
  element: Node | null | undefined,
  fn: WalkFn,
  path: Array<number | string> = []
) {
  let condition = true;
  if (element) {
    condition = fn(parent, element, path);
  } else {
    element = parent;
  }
  if (!condition || !element) {
    fail();
  }
  [].forEach.call(element.childNodes, (child: Node, index: number) => {
    path.push(index);
    walkDOM(element as HTMLElement, child, fn, path);
    path.pop();
  });
}

const idCache = new Map<string, number>();
export function getId(str: string): number {
  if (idCache.has(str)) {
    return idCache.get(str) as number;
  }
  let id = 0;
  if (str.length > 0) {
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      id = (id << 5) - id + char;
      id = id & id;
    }
  }
  idCache.set(str, id);
  return id;
}
