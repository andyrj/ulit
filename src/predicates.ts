import {
  COMMENT_NODE,
  DIRECTIVE,
  DOCUMENT_FRAGMENT,
  ELEMENT_NODE,
  PART_MARKER,
  TEXT_NODE
} from "./common";
import { IDirective } from "./directives";
import { ITemplateGenerator, Part, Template } from "./ulit";

export function isNode(x: any): x is Node {
  return (x as Node) && (x as Node).nodeType > 0;
}

export function isElementNode(x: any): x is HTMLElement {
  return isNode(x) && (x as Node).nodeType === ELEMENT_NODE;
}

export function isDirective(x: any): x is IDirective {
  return isFunction(x) && x.kind === DIRECTIVE;
}

export function isDocumentFragment(x: any): x is DocumentFragment {
  return isNode(x) && (x as Node).nodeType === DOCUMENT_FRAGMENT;
}

export function isComment(x: any): x is Comment {
  return isNode(x) && (x as Node).nodeType === COMMENT_NODE;
}

export function isFunction(x: any): x is Function {
  return typeof x === "function";
}

export function isString(x: any): x is string {
  return typeof x === "string";
}

export function isText(x: any): x is Text {
  return x && isNode(x) && (x as Node).nodeType === TEXT_NODE;
}

export function isNumber(x: any): x is number {
  return typeof x === "number";
}

export function isIterable(x: any): x is Iterable<any> {
  return (
    !isString(x) && !Array.isArray(x) && isFunction((x as any)[Symbol.iterator])
  );
}

export function isPartComment(x: any): x is Comment {
  return isComment(x) && x.textContent === PART_MARKER;
}

export function isPromise(x: any): x is Promise<any> {
  return x && isFunction(x.then);
}

export function isTemplate(x: any): x is Template {
  return x && x instanceof Template;
}

export function isTemplateElement(x: any): x is HTMLTemplateElement {
  return x && x instanceof HTMLTemplateElement;
}

export function isTemplateGenerator(x: any): x is ITemplateGenerator {
  return isFunction(x) && x.id;
}

export function isPart(x: any): x is Part {
  return x && x instanceof Part;
}

export function isAttributePart(x: any) {
  if (isPart(x) && isString(x.path[x.path.length - 1])) {
    return true;
  }
  return false;
}

export function isEventPart(x: any) {
  if (isAttributePart(x) && x.path[x.path.length - 1].startsWith("on")) {
    return true;
  }
  return false;
}
