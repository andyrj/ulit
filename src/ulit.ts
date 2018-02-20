const SVG = "SVG";
const SVG_NS = "http://www.w3.org/2000/svg";
const FOREIGN_OBJECT = "FOREIGNOBJECT";
const PART_START = "{{";
const PART_END = "}}";
const PART = "part";
const SERIAL_PART_START = `${PART_START}${PART}s:`;
const PART_MARKER = `${PART_START}${PART_END}`;
const TEMPLATE = "template";
const DIRECTIVE = "directive";
const ULIT = "ulit";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT = 11;
const EMPTY_STRING = "";
export type Optional<T> = T | undefined | null;
export type Key = symbol | string | number;
export interface IDirective {
  (part: Part): void;
  kind: string;
}
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
export type KeyFn = (item: any, index?: number) => Key;
export type TemplateFn = (item: any) => ITemplateGenerator;
type ISerializedPart = [Array<string | number>, boolean];
interface ISerialCacheEntry {
  template: HTMLTemplateElement;
  serializedParts: ISerializedPart[];
}
export type PrimitivePart =
  | boolean
  | number
  | string
  | Node
  | DocumentFragment
  | Function;
export type PartValue =
  | PrimitivePart
  | IPartPromise
  | IDirective
  | IPartArray
  | ITemplateGenerator;
export interface IPartPromise extends Promise<PartValue> {}
export interface IPartArray extends Array<PartValue> {}
export type IDisposer = () => void;

function isNode(x: any): x is Node {
  return (x as Node) && (x as Node).nodeType > 0;
}

function isElementNode(x: any): x is HTMLElement {
  return isNode(x) && (x as Node).nodeType === ELEMENT_NODE;
}

function isDirective(x: any): x is IDirective {
  return isFunction(x) && x.kind === DIRECTIVE;
}

function isDocumentFragment(x: any): x is DocumentFragment {
  return isNode(x) && (x as Node).nodeType === DOCUMENT_FRAGMENT;
}

function isComment(x: any): x is Comment {
  return isNode(x) && (x as Node).nodeType === COMMENT_NODE;
}

function isFunction(x: any): x is Function {
  return typeof x === "function";
}

function isString(x: any): x is string {
  return typeof x === "string";
}

function isText(x: any): x is Text {
  return x && isNode(x) && (x as Node).nodeType === TEXT_NODE;
}

function isNumber(x: any): x is number {
  return typeof x === "number";
}

function isIterable(x: any): x is Iterable<any> {
  return (
    !isString(x) && !Array.isArray(x) && isFunction((x as any)[Symbol.iterator])
  );
}

function isPartComment(x: any): x is Comment {
  return isComment(x) && x.textContent === PART_MARKER;
}

function isPromise(x: any): x is Promise<any> {
  return x && isFunction(x.then);
}

function isTemplate(x: any): x is Template {
  return x && x instanceof Template;
}

function isTemplateElement(x: any): x is HTMLTemplateElement {
  return x && x instanceof HTMLTemplateElement;
}

function isTemplateGenerator(x: any): x is ITemplateGenerator {
  return isFunction(x) && x.id;
}

function isPart(x: any): x is Part {
  return x && x instanceof Part;
}

function isAttributePart(x: any) {
  if (isPart(x) && isString(x.path[x.path.length - 1])) {
    return true;
  }
  return false;
}

function isEventPart(x: any) {
  if (isAttributePart(x) && x.path[x.path.length - 1].startsWith("on")) {
    return true;
  }
  return false;
}

const idCache = new Map<string, number>();
function getId(str: string): number {
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

function fail(msg?: Optional<string>): never {
  if (msg) {
    throw new RangeError(msg);
  } else {
    throw new RangeError();
  }
}

function walkDOM(
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

export type DirectiveFn = (part: Part) => void;
export function Directive(fn: DirectiveFn): IDirective {
  (fn as any).kind = DIRECTIVE;
  return fn as IDirective;
}

export class Disposable {
  public disposers: IDisposer[] = [];
  constructor() {}
  public addDisposer(handler: IDisposer) {
    const disposers = this.disposers;
    if (disposers.indexOf(handler) > -1) {
      return;
    }
    disposers.push(handler);
  }
  public removeDisposer(handler: IDisposer) {
    const disposers = this.disposers;
    const index = disposers.indexOf(handler);
    if (index === -1) {
      return;
    }
    disposers.splice(index, 1);
  }
  public dispose() {
    const disposers = this.disposers;
    if (isPart(this)) {
      // TODO: make sure to add any other part object members that need to be cleaned up
      partParentCache.delete(this);
    } else if (isTemplate(this)) {
      // TODO: anything that needs to be cleaned up on disposed Templates?
    }
    while (disposers.length > 0) {
      (disposers.pop() as IDisposer)();
    }
  }
}

export class DomTarget extends Disposable {
  public start: Optional<Node | DomTarget> = undefined;
  public end: Optional<Node | DomTarget> = undefined;
  constructor(target?: Node, public isSVG: boolean = false) {
    super();
    if (target) {
    }
  }
  public first(): Node {
    const start = this.start;
    if (isNode(start)) {
      return start;
    } else {
      return (start as DomTarget).first();
    }
  }
  public last(): Node {
    const end = this.end;
    if (isNode(end)) {
      return end;
    } else {
      return (end as DomTarget).last();
    }
  }
  public remove(): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const end = this.last();
    let cursor: Optional<Node> = this.first();
    while (cursor != null) {
      const next: Node = cursor.nextSibling as Node;
      fragment.appendChild(cursor);
      cursor = cursor === end || !next ? undefined : next;
    }
    return fragment;
  }
}

function updateAttribute(part: Part, value: Optional<PartValue>) {
  const element = part.start as Node;
  if (!element) {
    fail();
  }
  const name = part.path[part.path.length - 1] as string;
  const isSVG = part.isSVG;
  if (!name) {
    fail();
  }
  const isValFn = isFunction(value);
  if ((isEventPart(part) && isValFn) || (name in element && !isSVG)) {
    try {
      (element as any)[name] = !value && value !== false ? EMPTY_STRING : value;
    } catch (_) {} // eslint-disable-line
  }
  if (!isValFn) {
    if (!value) {
      if (isSVG) {
        (element as HTMLElement).removeAttributeNS(SVG_NS, name);
      } else {
        (element as HTMLElement).removeAttribute(name);
      }
    } else {
      if (isSVG) {
        (element as HTMLElement).setAttributeNS(SVG_NS, name, value as string);
      } else {
        (element as HTMLElement).setAttribute(name, value as string);
      }
    }
  }
}

function updateArray(part: Part, value: Optional<PartValue[]>) {
  if (!value) {
    return;
  }
  const directive = repeat(value);
  part.value = directive;
  return directive(part);
}

function updateTemplate(part: Part, value: ITemplateGenerator) {
  const first = part.first();
  const parent = first.parentNode;
  if (!parent) {
    fail();
  }
  const instance = isTemplate(part.value) ? part.value : undefined;
  if (instance && instance.id === value.id) {
    instance.update(value.exprs);
    return;
  }
  const template = value();
  if (isTemplateElement(template.element)) {
    const fragment = template.element.content;
    const newStart = template.first();
    const newEnd = template.last();
    (parent as Node).insertBefore(fragment, first);
    part.start = newStart;
    part.end = newEnd;
    part.value = template;
  } else {
    fail();
  }
}

function updateNode(part: Part, value: Optional<PartValue>) {
  // Error condition: isText(part.value) && isNode(value) -> doesn't remove the text node...
  if (value == null) {
    value = document.createComment(`${PART_START}${PART_END}`);
  }
  const first = part.first();
  const parent = first.parentNode;
  if (parent == null) {
    fail();
  }
  let newStart: Optional<Node> = undefined;
  let newEnd: Optional<Node> = undefined;
  const partValue = part.value;
  if (!isNode(value)) {
    // string or coerce to string
    value =
      !isString(value) && isFunction(value.toString) ? value.toString() : value;
    if (!isString(value)) {
      fail();
    }
    if (isText(partValue)) {
      if (partValue.nodeValue !== value) {
        partValue.nodeValue = value as string;
      }
    } else {
      value = document.createTextNode(value as string);
      newStart = value;
      newEnd = value;
    }
  }
  if (!isNode(value)) {
    fail();
  }
  if (value !== partValue) {
    if (!isText(value)) {
      const isFrag = isDocumentFragment(value);
      newStart = isFrag ? (value as Node).firstChild : (value as Node);
      newEnd = isFrag ? (value as Node).lastChild : (value as Node);
    }
    // TODO: figure out why it's removing the wrong nodes here...
    (parent as Node).insertBefore(value as Node, first);
    part.remove();
    part.value = value;
    part.start = newStart;
    part.end = newEnd;
  }
}

const partParentCache = new WeakMap<Part, Template>();
export class Part extends DomTarget {
  public value: PartValue | Template;
  public path: Array<string | number>;
  constructor(
    path: Array<string | number>,
    target: Node,
    index: number = -1,
    public isSVG: boolean = false
  ) {
    super(target, isSVG);
    this.path = path.slice(0);
    this.value = target;
    this.start = target;
    this.end = target;
  }
  public update(value?: PartValue) {
    if (arguments.length === 0 && !isTemplate(this.value)) {
      value = this.value;
    }
    if (isDirective(value)) {
      (value as IDirective)(this);
      return;
    }
    if (isPromise(value)) {
      (value as Promise<PartValue>).then(promised => {
        this.update(promised);
      });
      return;
    }
    if (isAttributePart(this)) {
      updateAttribute(this, value);
    } else {
      if (isIterable(value)) {
        value = Array.from(value as any);
      }
      if (Array.isArray(value)) {
        updateArray(this, value);
      }
      if (isTemplateGenerator(value)) {
        updateTemplate(this, value);
      } else {
        updateNode(this, value);
      }
    }
  }
}

function templateSetup(serial: ISerializedPart[], parts: Part[]): WalkFn {
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

export class Template extends DomTarget {
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

export function html(
  strings: TemplateStringsArray,
  ...expressions: PartValue[]
): ITemplateGenerator {
  const id = getId(strings.toString());
  const markUp = strings.join("{{}}");
  const factory = function(exprs: PartValue[]) {
    const templateGenerator = function() {
      const templateElement = document.createElement(
        TEMPLATE
      ) as HTMLTemplateElement;
      templateElement.innerHTML = markUp;
      const fragment = templateElement.content;
      // serial = {
      //   serializedParts: [],
      //   template: newTemplateEl.cloneNode() as HTMLTemplateElement
      // };
      const parts: Part[] = [];
      const serializedParts: Array<[Array<string | number>, boolean]> = [];
      walkDOM(fragment, undefined, templateSetup(serializedParts, parts));
      return new Template(id, templateElement, parts, exprs);
    };
    (templateGenerator as ITemplateGenerator).id = id;
    (templateGenerator as ITemplateGenerator).exprs = expressions;
    return templateGenerator as ITemplateGenerator;
  };
  return factory(expressions);
}

export function defaultKeyFn(index: number): Key {
  return index;
}

export function defaultTemplateFn(item: PartValue): ITemplateGenerator {
  return html`${item}`;
}

// const renderedCache = new WeakMap<Node | Part, Template>();
export function render(
  view: PartValue | PartValue[] | Iterable<PartValue>,
  container?: Optional<Node>
) {
  if (!container) {
    container = document.body;
  }
  if (isIterable(view)) {
    view = Array.from(view as any);
  }
  if (!isTemplateGenerator(view)) {
    view = defaultTemplateFn(view as PartValue);
    if (!isTemplateGenerator(view)) {
      fail();
    }
  }
  const instance = (container as any).__template; // renderedCache.get(container);
  // TODO: re-write with expanded if structure nested here for id test...
  if (instance) {
    if (instance.id === (view as ITemplateGenerator).id) {
      instance.update((view as ITemplateGenerator).exprs);
      return;
    } else {
      instance.remove();
      (container as any).__template = undefined;
    }
  }
  const template = (view as ITemplateGenerator)(
    (view as ITemplateGenerator).exprs
  );
  template.update();
  if (isTemplateElement(template.element)) {
    // TODO: add hydration here...
    const first: Optional<Node> = container.firstChild;
    const parent: Optional<Node> = container;
    const fragment = template.element.content;
    const fragmentFirst = fragment.firstChild;
    const fragmentLast = fragment.lastChild;
    const newStart = isPartComment(fragmentFirst)
      ? template.parts[0]
      : fragmentFirst;
    const newEnd = isPartComment(fragmentLast)
      ? template.parts[template.parts.length - 1]
      : fragmentLast;
    (parent as Node).insertBefore(fragment, first);
    // if (instance) {
    //   instance.remove();
    // }
    template.start = newStart;
    template.end = newEnd;
    (container as any).__template = template;
  } else {
    fail();
  }
}

const repeatCache = new Map<Part, [Key[], Map<Key, Template>]>();
export function repeat(
  items: Array<{}>,
  keyFn: KeyFn = defaultKeyFn,
  templateFn: TemplateFn = defaultTemplateFn
): IDirective {
  return Directive((part: Part) => {
    const target = part.first();
    const parent = target.parentNode;
    if (!parent) {
      fail();
    }
    // const isSVG = part.isSVG;
    // might need for hydrate...
    // const attacher = partAttachers.get(part);
    const templates = items.map(item => {
      if (isTemplate(item)) {
        return item;
      }
      return templateFn(item);
    }) as Template[];
    const keys = items.map((item, index) => keyFn(item, index));
    const [oldCacheOrder, oldCacheMap] = repeatCache.get(part) || [
      [],
      new Map<Key, Template>()
    ];
    const newCache = [keys, new Map<Key, Template>()];
    const newCacheMap = newCache[1] as Map<Key, Template>;
    // build LUT for new keys/templates
    keys.forEach((key, index) => {
      newCacheMap.set(key, templates[index]);
    });
    // remove keys no longer in keys/list
    const removeKeys: number[] = [];
    oldCacheOrder.forEach((key, index) => {
      const newEntry = newCacheMap.get(key);
      const oldEntry = oldCacheMap.get(key);
      if (oldEntry && !newEntry) {
        oldEntry.remove();
        oldCacheMap.delete(key);
        removeKeys.push(index);
      }
    });
    // can't mutate oldCacheOrder while in forEach
    while (true) {
      const index = removeKeys.pop();
      if (index && index > -1) {
        oldCacheOrder.splice(index, 1);
        continue;
      }
      break;
    }
    // move/update and add
    keys.forEach((key, index) => {
      const oldEntry = oldCacheMap.get(key);
      const nextTemplate = templates[index];
      if (oldEntry) {
        if (!parent) {
          fail();
        }
        const first = oldEntry.first();
        if (key === oldCacheOrder[index]) {
          // update in place
          if (oldEntry.id === nextTemplate.id) {
            oldEntry.update(nextTemplate.values as PartValue[]);
          } else {
            //  maybe at some point think about diffing between templates?
            nextTemplate.update();
            if (isTemplateElement(nextTemplate.element)) {
              const fragment = nextTemplate.element.content;
              (parent as Node).insertBefore(fragment, first);
              oldEntry.remove();
              oldCacheMap.set(key, nextTemplate);
            } else {
              fail();
            }
          }
        } else {
          // TODO: look at this code again with fresh eyes...
          // const targetEntry = oldCacheMap.get(oldCacheOrder[index]);
          // if (!targetEntry) {
          //   fail();
          // } else {
          //   target = targetEntry.first();
          //   const oldIndex = oldCacheOrder.indexOf(key);
          //   oldCacheOrder.splice(oldIndex, 1);
          //   oldCacheOrder.splice(index, 0, key);
          //   const fragment = oldEntry.remove();
          //   if (oldEntry.id === nextTemplate.id) {
          //     oldEntry(nextTemplate.values as PartValue[]);
          //     (parent as Node).insertBefore(fragment, target);
          //   } else {
          //     nextTemplate();
          //     // nextTemplate.insertBefore(target);
          //     (parent as Node).insertBefore(fragment, target);
          //   }
          // }
        }
        return;
      }
      // add template to
      // TODO: look over this logic and clean it up...
      // const cursor = oldCacheOrder[index];
      // oldEntry = oldCacheMap.get(cursor);
      // const firstNode = part.first();
      // if (index === 0 && isPartComment(firstNode) && !cursor && !oldEntry) {
      //   if (isTemplateElement(nextTemplate.element)) {
      //     const fragment = nextTemplate.element.content;
      //     (parent as Node).insertBefore(fragment, firstNode);
      //     if (!parent) {
      //       fail();
      //     } else {
      //       parent.removeChild(firstNode);
      //       oldCacheOrder.push(key);
      //     }
      //   } else {
      //     fail();
      //   }
      // } else {
      //   if (!oldEntry) {
      //     fail();
      //   } else {
      //     // nextTemplate.insertBefore(oldEntry);
      //     oldCacheOrder.splice(index, 0, key);
      //   }
      // }
      // oldCacheMap.set(key, nextTemplate);
    });
  });
}

export function until(
  promise: Promise<PartValue>,
  defaultContent: PartValue
): IDirective {
  return Directive((part: Part) => {
    part.update(defaultContent);
    promise.then(value => part.update(value));
  });
}
