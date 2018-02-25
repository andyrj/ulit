export type Optional<T> = T | undefined | null;
export type Key = symbol | string | number;
export type PrimitivePart =
  | boolean
  | number
  | string
  | Node
  | DocumentFragment
  | EventListener;
export type PartValue = Optional<
  PrimitivePart | IPartPromise | IDirective | IPartArray | ITemplateGenerator
>;
export interface IPartPromise extends Promise<PartValue> {}
export interface IPartArray extends Array<PartValue> {}
export type PartGenerator = (target: Node) => Part;
export type KeyFn = (item: any, index?: number) => Key;
export type TemplateFn = (item: any) => ITemplateGenerator;
export interface ISerialCacheEntry {
  templateElement: HTMLTemplateElement;
  partGenerators: PartGenerator[];
  serializedParts: ISerializedPart[];
}
export type ISerializedPart = [Array<string | number>, boolean];
export interface ITemplateGenerator {
  (values?: PartValue[]): Template;
  id: number;
  exprs: PartValue[];
}
type ITemplateGeneratorFactory = (exprs: PartValue[]) => ITemplateGenerator;
export type IDisposer = () => void;
export type NodeAttribute = [Node, string];

const SVG = "SVG";
const SVG_NS = "http://www.w3.org/2000/svg";
const FOREIGN_OBJECT = "FOREIGNOBJECT";
const PART_START = "{{";
const PART_END = "}}";
const PART = "part";
// const NODE_TYPE = "nodeType";
const SERIAL_PART_START = `${PART_START}${PART}s:`;
const PART_MARKER = `${PART_START}${PART_END}`;
const TEMPLATE = "template";
const CAPTURE = "Capture";
const DIRECTIVE = "directive";
const ULIT = "ulit";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT = 11;
// const EMPTY_STRING = "";

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
    while (disposers.length > 0) {
      (disposers.pop() as IDisposer)();
    }
  }
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

function isFirstChildSerial(parent: DocumentFragment): boolean {
  const child = parent.firstChild;
  return (child &&
    child.nodeType === COMMENT_NODE &&
    child.nodeValue &&
    child.nodeValue.startsWith(SERIAL_PART_START)) as boolean;
}

function parseSerializedParts(value?: string): ISerializedPart[] {
  let result: ISerializedPart[] = [];
  if (value) {
    result = JSON.parse(
      value.split(SERIAL_PART_START)[1].slice(0, -2)
    ) as ISerializedPart[];
  }
  return result;
}

function getSerializedTemplate(id: number): Optional<ISerialCacheEntry> {
  const el = document.getElementById(`${ULIT}${id}`) as HTMLTemplateElement;
  if (!el) {
    return;
  }
  const clone: HTMLTemplateElement = document.importNode(
    el as HTMLTemplateElement,
    true
  );
  const fragment = clone.content;
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
    const firstChild = fragment.removeChild(first);
    const serializedParts: ISerializedPart[] = parseSerializedParts(
      firstChild.nodeValue || undefined
    );
    const templateElement: HTMLTemplateElement = el;
    if (serializedParts && templateElement) {
      const partGenerators: PartGenerator[] = serializedParts.map(
        (serial, i) => {
          return (target: Node) => {
            const path = serial[0];
            const isSVG = serial[1];
            const partTarget = followPath(target, path);
            if (Array.isArray(partTarget)) {
              return new Part(path, partTarget[0], i, isSVG);
            }
            return new Part(
              path,
              partTarget as Node,
              partGenerators.length,
              isSVG
            );
          };
        }
      );
      deserialized = { templateElement, serializedParts, partGenerators };
    }
  }
  if (deserialized) {
    serialCache.set(id, deserialized);
    return deserialized;
  }
  return;
}

function templateSetup(
  serial: ISerializedPart[],
  partGenerators: PartGenerator[]
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
            partGenerators.push((target: Node) => {
              const partTarget = followPath(target, adjustedPath);
              return new Part(
                adjustedPath,
                partTarget as Node,
                partGenerators.length,
                isSVG
              );
            });
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
            const name = attr.nodeName;
            const attrPath = walkPath.concat(name);
            serial.push([attrPath, isSVG]);
            partGenerators.push((target: Node) => {
              const partTarget = followPath(target, attrPath) as NodeAttribute;
              return new Part(
                attrPath,
                partTarget[0],
                partGenerators.length,
                isSVG
              );
            });
            if (isSVG) {
              element.removeAttributeNS(SVG_NS, name);
            } else {
              element.removeAttribute(name);
            }
          }
        });
        const keys = Object.keys(element);
        const len = keys.length;
        let i = 0;
        for (; i < len; i++) {
          const name = keys[i];
          if ((element as any)[name] === PART_MARKER) {
            const propPath = walkPath.concat(name);
            serial.push([propPath, isSVG]);
            delete (element as any)[name];
          }
        }
      }
    }
  };
}

function followPath(
  target: Node,
  pointer: Array<string | number>
): Optional<Node | NodeAttribute> | never {
  const path = pointer.slice(0);
  let cursor = target;
  while (path.length > 0) {
    const next = path.shift();
    if (isString(next)) {
      return [cursor, next];
    }
    cursor = cursor.childNodes[next as number];
  }
  return cursor;
}

export class Template {
  public disposable = new Disposable();
  public target = new DomTarget();
  public parts: Part[];
  constructor(
    public id: number,
    public element: HTMLTemplateElement,
    partGenerators: PartGenerator[],
    public values: PartValue[]
  ) {
    const fragment = element.content;
    const first = fragment.firstChild;
    const last = fragment.lastChild;
    const parts = this.parts = partGenerators.map(generator => generator(fragment));
    this.target.start = isPartComment(first) ? parts[0] : first;
    this.target.end = isPartComment(last) ? parts[parts.length - 1] : last;
    parts.forEach((part, i) => part.update(values[i]));
  }
  public hydrate(element: Node) {
    this.parts.forEach(part => {
      const target = followPath(element, part.path);
      if (!target) {
        fail();
      } else {
        const isArr = Array.isArray(target);
        this.target.start = isArr
          ? (target as [Node, string][0])
          : (target as Node);
        // TODO: we need to walk from start to end on "un-rendered" parts in fragment, to determine where the "end" node is located, in the hydrated dom...
        // this.target.end = isArr ? target as [Node, string][0]: target as Node;
      }
    });
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

function attachPartListener(
  part: Part,
  element: HTMLElement,
  name: string,
  capture: boolean
) {
  (element as HTMLElement).addEventListener(
    name,
    e => {
      const entry = eventHandlerMap.get(part);
      if (!entry) {
        fail();
      }
      const handler = (entry as Map<string, Function>).get(name);
      if (handler) {
        handler(e);
      }
    },
    capture
  );
}

const eventHandlerMap = new WeakMap<Part, Map<string, Function>>();
export class Part {
  public value: PartValue | Template;
  public path: Array<string | number>;
  public disposable = new Disposable();
  public target: DomTarget;
  constructor(
    path: Array<string | number>,
    target: Node,
    index: number = -1,
    public isSVG: boolean = false
  ) {
    this.target = new DomTarget(target);
    this.path = path.slice(0);
    this.value = target;
  }
  public update(value?: PartValue) {
    if (isAttributePart(this)) {
      this.updateAttribute(this, value);
      return;
    }
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
    if (isIterable(value)) {
      value = Array.from(value as any);
    }
    if (Array.isArray(value)) {
      this.updateArray(this, value);
    }
    if (isTemplateGenerator(value)) {
      this.updateTemplate(this, value as ITemplateGenerator);
    } else {
      this.updateNode(this, value);
    }
  }
  private updateAttribute(part: Part, value: Optional<PartValue>) {
    if (isPromise(value)) {
      value.then(promised => {
        this.updateAttribute(part, promised);
      });
    }
    const element = part.target.start as Node;
    if (!element) {
      fail();
    }
    const name = part.path[part.path.length - 1] as string;
    const isSVG = part.isSVG;
    if (!name) {
      fail();
    }
    const isValFn = isFunction(value);
    if (isValFn) {
      if (isEventPart(part)) {
        const cachedEntry = eventHandlerMap.get(part);
        if (!cachedEntry) {
          const handlerMap = new Map<string, EventListener>();
          handlerMap.set(name, value as EventListener);
          eventHandlerMap.set(part, handlerMap);
          const isCapture = name.endsWith(CAPTURE);
          const rawName = name.split(CAPTURE)[0];
          attachPartListener(
            part,
            element as HTMLElement,
            isCapture ? rawName : name,
            isCapture
          );
          part.disposable.addDisposer(() => {
            const handler = handlerMap.get(name);
            if (handler) {
              (element as HTMLElement).removeEventListener(
                name,
                handler as EventListener,
                isCapture
              );
            }
          });
          // TODO: add disposer to cleanup the eventHandlerMap on part.dispose()
        } else {
          const handler = cachedEntry.get(name);
          if (handler !== value) {
            cachedEntry.set(name, value as Function);
          }
        }
      } else {
        fail();
      }
    } else {
      if (name in element) {
        if (value) {
          (element as any)[name] = value;
        } else {
          delete (element as any)[name];
        }
      } else {
        if (isSVG) {
          if (!value) {
            (element as HTMLElement).removeAttributeNS(SVG_NS, name);
          } else {
            (element as HTMLElement).setAttributeNS(
              SVG_NS,
              name,
              isString(value) ? value : value.toString()
            );
          }
        } else {
          if (!value) {
            (element as HTMLElement).removeAttribute(name);
          } else {
            (element as HTMLElement).setAttribute(
              name,
              isString(value) ? value : value.toString()
            );
          }
        }
      }
    }
  }

  private updateArray(part: Part, values: Optional<PartValue[]>) {
    if (!values) {
      return;
    }
    const directive = repeat(values as any);
    part.value = directive;
    return directive(part);
  }

  private updateTemplate(part: Part, value: ITemplateGenerator) {
    const first = part.target.first();
    const parent = first.parentNode;
    if (!parent) {
      fail();
    }
    const instance = isTemplate(part.value) ? part.value : undefined;
    if (instance && (instance as Template).id === value.id) {
      (instance as Template).update(value.exprs);
      return;
    }
    const template = value();
    if (isTemplateElement(template.element)) {
      const fragment = template.element.content;
      const newStart = template.target.first();
      const newEnd = template.target.last();
      (parent as Node).insertBefore(fragment, first);
      part.target.start = newStart;
      part.target.end = newEnd;
      part.value = template;
    } else {
      fail();
    }
  }

  private updateNode(part: Part, value: Optional<PartValue>) {
    if (value == null) {
      value = document.createComment(`${PART_START}${PART_END}`);
    }
    const first = part.target.first();
    const parent = first.parentNode;
    if (parent == null) {
      fail();
    }
    let newStart: Optional<Node> = undefined;
    let newEnd: Optional<Node> = undefined;
    const partValue = part.value;
    if (isText(partValue)) {
      if (isNode(value)) {
        // replace the text node with node/fragment in value
        newStart = value;
        newEnd = value;
        if (isDocumentFragment(value)) {
          newStart = value.firstChild;
          newEnd = value.lastChild;
        }
        (parent as Node).insertBefore(value as Node, first);
        part.target.remove();
        part.target.start = newStart;
        part.target.end = newEnd;
        part.value = value;
      } else if (isText(value)) {
        // compare nodeValues
        if (partValue.nodeValue !== value.nodeValue) {
          partValue.nodeValue = value.nodeValue;
        }
      } else {
        // compare value with partValue.nodeValue
        if (!isString(value)) {
          value = value.toString();
        }
        if (partValue.nodeValue !== value) {
          partValue.nodeValue = value;
        }
      } 
    } else {
      if (isText(value) || !isNode(value)) {
        // replace node/fragment with new textNode...
        if (!isText(value)) {
          value = document.createTextNode(value.toString());
        }
        newStart = value;
        newEnd = value;
        (parent as Node).insertBefore(value, first);
        part.target.remove();
        part.target.start = newStart;
        part.target.end = newEnd;
        part.value = value;
      } else {
        // compare nodes and update if the don't ===
        if (partValue !== value) {
          newStart = value;
          newEnd = value;
          if (isDocumentFragment(value)) {
            newStart = value.firstChild;
            newEnd = value.lastChild;
          }
          (parent as Node).insertBefore(value, first);
          part.target.remove();
          part.target.start = newStart;
          part.target.end = newEnd;
          part.value = value;
        }
      }
    }
  }
}

export class DomTarget {
  public start: Optional<Node | Part> = undefined;
  public end: Optional<Node | Part> = undefined;
  constructor(target?: Node, public isSVG: boolean = false) {
    if (target) {
      this.start = target;
      this.end = target;
    }
  }
  public first(): Node {
    const start = this.start;
    if (!start || !this.end) {
      fail();
    }
    if (isNode(start)) {
      return start;
    } else {
      return (start as Part).target.first();
    }
  }
  public last(): Node {
    const end = this.end;
    if (!end || !this.start) {
      fail();
    }
    if (isNode(end)) {
      return end;
    } else {
      return (end as Part).target.last();
    }
  }
  public remove(): DocumentFragment {
    if (!this.start || !this.end) {
      fail();
    }
    const fragment = document.createDocumentFragment();
    const last = this.last();
    let cursor: Optional<Node> = this.first();
    while (cursor != null) {
      const next: Node = cursor.nextSibling as Node;
      fragment.appendChild(cursor);
      cursor = cursor === last || !next ? undefined : next;
    }
    return fragment;
  }
}

function isNode(x: any): x is Node {
  return (x as Node) && x.nodeType != null;
}

function isElementNode(x: any): x is HTMLElement {
  return isNode(x) && (x as Node).nodeType === ELEMENT_NODE;
}

function isDirective(x: any): x is IDirective {
  return isFunction(x) && DIRECTIVE in x;
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

// function isNumber(x: any): x is number {
//   return typeof x === "number";
// }

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

export interface IDirective {
  (part: Part): void;
  directive: boolean;
}
export type DirectiveFn = (part: Part) => void;
export function Directive(fn: DirectiveFn): IDirective {
  (fn as any).directive = true;
  return fn as IDirective;
}

function defaultKeyFn(index: number): Key {
  return index;
}

function defaultTemplateFn(item: PartValue): ITemplateGenerator {
  return html`${item}`;
}
const repeatCache = new Map<Part, [Key[], Map<Key, Template>]>();
export function repeat(
  items: Array<{}>,
  keyFn: KeyFn = defaultKeyFn,
  templateFn: TemplateFn = defaultTemplateFn
): IDirective {
  return Directive((part: Part) => {
    const target = part.target.first();
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
        oldEntry.target.remove();
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
        const first = oldEntry.target.first();
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
              oldEntry.target.remove();
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

function fail(msg?: Optional<string>): never {
  if (msg) {
    throw new RangeError(msg);
  } else {
    throw new RangeError();
  }
}

type WalkFn = (
  parent: Node,
  element: Optional<Node>,
  path: Array<string | number>
) => void | never;

function walkDOM(
  parent: HTMLElement | DocumentFragment,
  element: Optional<Node>,
  fn: WalkFn,
  path: Array<number | string> = []
) {
  if (!element) {
    element = parent;
  } else {
    fn(parent, element, path);
  }
  [].forEach.call(element.childNodes, (child: Node, index: number) => {
    path.push(index);
    walkDOM(element as HTMLElement, child, fn, path);
    path.pop();
  });
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

const factoryCache = new Map<number, ITemplateGeneratorFactory>();
const serialCache = new Map<number, ISerialCacheEntry>();
export function html(
  strings: TemplateStringsArray,
  ...expressions: PartValue[]
): ITemplateGenerator {
  const id = getId(strings.toString());
  const markUp = strings.join(PART_MARKER);
  let factory = factoryCache.get(id);
  if (factory) {
    return factory(expressions);
  }
  factory = function(exprs: PartValue[]) {
    const generator = function() {
      const values = arguments.length === 0 ? exprs : arguments[0];
      const {
        templateElement,
        partGenerators,
        serializedParts
      } = serialCache.get(id) ||
        getSerializedTemplate(id) || {
          templateElement: document.createElement(TEMPLATE),
          partGenerators: [],
          serializedParts: []
        };
      if (!templateElement.hasChildNodes()) {
        templateElement.innerHTML = markUp;
        const fragment = templateElement.content;
        walkDOM(
          fragment,
          undefined,
          templateSetup(serializedParts, partGenerators)
        );
        serialCache.set(id, {
          templateElement,
          partGenerators,
          serializedParts
        });
      }
      return new Template(
        id,
        document.importNode(templateElement, true),
        partGenerators,
        values
      );
    };
    (generator as ITemplateGenerator).id = id;
    (generator as ITemplateGenerator).exprs = exprs;
    return generator as ITemplateGenerator;
  };
  factoryCache.set(id, factory);
  return factory(expressions);
}

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
  const instance = (container as any).__template;
  if (instance) {
    if (instance.id === (view as ITemplateGenerator).id) {
      instance.update((view as ITemplateGenerator).exprs);
      return;
    } else {
      const newInstance = (view as ITemplateGenerator)();
      container.insertBefore(
        newInstance.element.content,
        instance.target.first()
      );
      instance.target.remove();
      (container as any).__template = newInstance;
    }
    return;
  }
  const template = (view as ITemplateGenerator)();

  if (container.hasChildNodes()) {
    // TODO: add hydration here...
  } else {
    template.update();
    if (isTemplateElement(template.element)) {
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
      template.target.start = newStart;
      template.target.end = newEnd;
      (container as any).__template = template;
    } else {
      fail();
    }
  }
}
