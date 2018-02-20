import {
  COMMENT_NODE,
  fail,
  FOREIGN_OBJECT,
  Optional,
  PART_MARKER,
  SERIAL_PART_START,
  SVG,
  ULIT
} from "./common";
import { Disposable } from "./Disposable";
import { Part, PartValue } from "./Part";
import { isElementNode, isNumber, isString, isText } from "./predicates";

export interface ITemplateGenerator {
  (values?: PartValue[]): Template;
  id: number;
  exprs: PartValue[];
}
export type WalkFn = (
  parent: Node,
  element: Node | null | undefined,
  path: Array<string | number>
) => boolean;
export type ISerializedPart = [Array<string | number>, boolean];
export interface ISerialCacheEntry {
  template: HTMLTemplateElement;
  serializedParts: ISerializedPart[];
}
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
export function templateSetup(
  serial: ISerializedPart[],
  parts: Part[]
): WalkFn {
  return (parent, element, walkPath) => {
    const isSVG = isNodeSVGChild(element);
    if (isText(element)) {
      const text = element && element.nodeValue;
      const split = text && text.split(PART_MARKER);
      const end = split ? split.length - 1 : undefined;
      const nodes: Node[] = [];
      let cursor = 0;
      if (split && split.length > 0 && end) {
        split.forEach((node, i) => {
          if (node !== "") {
            nodes.push(document.createTextNode(node));
            cursor++;
          }
          if (i < end) {
            const newPartComment = document.createComment(PART_MARKER);
            nodes.push(newPartComment);
            const adjustedPath = walkPath.slice(0);
            const len = adjustedPath.length - 1;
            (adjustedPath[len] as number) += cursor;
            serial.push([adjustedPath, isSVG]);
            parts.push(
              new Part(adjustedPath, newPartComment, parts.length, isSVG)
            );
            cursor++;
          }
        });
        nodes.forEach(node => {
          parent.insertBefore(node, element as Node);
        });
        if (!element) {
          fail();
        } else {
          parent.removeChild(element);
        }
      }
    } else if (isElementNode(element)) {
      if (!element) {
        fail();
      } else {
        [].forEach.call(element.attributes, (attr: Attr) => {
          if (attr.nodeValue === PART_MARKER) {
            const attrPath = walkPath.concat(attr.nodeName);
            serial.push([attrPath, isSVG]);
            parts.push(new Part(attrPath, element, parts.length, isSVG));
          }
        });
      }
    }
    return true;
  };
}

function isNodeSVGChild(node: Optional<Node>): boolean {
  if (!node) {
    return false;
  }
  let result = false;
  let current: Optional<Node> = node;
  while (current) {
    if (current.nodeName === SVG) {
      result = true;
      current = undefined;
    } else if (current.nodeName === FOREIGN_OBJECT) {
      result = false;
      current = undefined;
    } else {
      current = current.parentNode;
    }
  }
  return result;
}

type NodeAttribute = [Node, string];
function followPath(
  target: Node,
  pointer: Array<string | number>
): Optional<Node | NodeAttribute> | never {
  if (!target) {
    throw new RangeError();
  }
  const cPath = pointer.slice(0);
  const current = cPath.shift() as string | number;
  if (isNumber(current)) {
    if (cPath.length === 0) {
      return target.childNodes[current];
    } else {
      return followPath(target.childNodes[current], cPath);
    }
  } else if (isString(current)) {
    if (cPath.length === 0) {
      return [target, current];
    } else {
      fail();
    }
  }
  fail();
  return; // satisifying typescript, can't be reached anyways... ><
}

function isFirstChildSerial(parent: DocumentFragment): boolean {
  const child = parent.firstChild;
  return (child &&
    child.nodeType === COMMENT_NODE &&
    child.nodeValue &&
    child.nodeValue.startsWith(SERIAL_PART_START)) as boolean;
}

function parseSerializedParts(value?: string): ISerializedPart[] {
  if (!value) {
    return [];
  } else {
    return JSON.parse(
      value.split(SERIAL_PART_START)[1].slice(0, -2)
    ) as ISerializedPart[];
  }
}

function getSerializedTemplate(id: number): Optional<ISerialCacheEntry> {
  const el = document.getElementById(`${ULIT}${id}`) as HTMLTemplateElement;
  if (!el) {
    return;
  }
  const fragment = (el.cloneNode(true) as HTMLTemplateElement).content;
  if (!fragment) {
    return;
  }
  const first = fragment.firstChild;
  if (!first) {
    return;
  }
  const isFirstSerial = isFirstChildSerial(fragment);
  let deserialized: Optional<ISerialCacheEntry> = undefined;
  if (isFirstSerial) {
    const fc = fragment.removeChild(first);
    const serializedParts = parseSerializedParts(fc.nodeValue || undefined);
    const template = el as HTMLTemplateElement;
    if (serializedParts && template) {
      deserialized = { template, serializedParts };
    }
  }
  if (deserialized) {
    return deserialized;
  }
  return;
}
export class Template extends Disposable {
  constructor(
    public id: number,
    public element: HTMLTemplateElement,
    public parts: Part[],
    public values: PartValue[]
  ) {
    super();
  }
  public update(newValues?: Optional<PartValue[]>) {
    if (arguments.length === 0) {
      newValues = this.values;
    }
    const templateParts = this.parts as Part[];
    let i = 0;
    const len = templateParts.length;
    for (; i < len; i++) {
      const part = templateParts[i];
      const newVal = newValues ? newValues[i] : undefined;
      part.update(newVal);
    }
    if (newValues != null) {
      this.values = newValues;
    }
  }
}
