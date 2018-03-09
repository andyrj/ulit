export type Optional<T> = T | undefined | null;
export type Key = symbol | string | number;
export interface IDirective {
  (part: AttributePart | EventPart | NodePart): void;
  directive: boolean;
}
export type DirectiveFn = (part: AttributePart | EventPart | NodePart) => void;
export type AttributePartValue = string | IToString | {};
export type NodePartValue = string | IToString | Node | DocumentFragment;
export type PrimitivePartValue = AttributePartValue | NodePartValue;
export type PartValue = Optional<
  | PrimitivePartValue
  | IPartPromise
  | IDirective
  | IPartArray
  | ITemplateGenerator
  | IterablePartValue
>;
export interface IPartPromise extends Promise<PrimitivePartValue> {}
export interface IPartArray extends Array<NodePartValue> {}
export interface IterablePartValue extends Iterable<NodePartValue> {}
export type PartGenerator = (target: Node) => NodePart | AttributePart | EventPart;
export type KeyFn = (item: any, index: number) => Key;
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
export interface IToString {
  toString: () => string;
}
const SVG = "SVG";
const SVG_NS = "http://www.w3.org/2000/svg";
const FOREIGN_OBJECT = "FOREIGNOBJECT";
const CURLY_OPEN="{";
const CURLY_CLOSE="}";
const PART_START = `${CURLY_OPEN}${CURLY_OPEN}`;
const PART_END = `${CURLY_CLOSE}${CURLY_CLOSE}`;
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

function isNodeSVGChild(node: Node): boolean {
  let result = false;
  let current: Optional<Node> = node;
  while (current) {
    const currentName = current.nodeName.toUpperCase();
    if (currentName === SVG) {
      result = true;
      current = undefined;
    } else if (currentName === FOREIGN_OBJECT) {
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
    child.textContent &&
    child.textContent[0] === CURLY_OPEN &&
    child.textContent[1] === CURLY_OPEN) as boolean;
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
  const fragment = clone.content as DocumentFragment;
  const first = fragment.firstChild;
  if (!first) {
    return;
  }
  const isFirstSerial = isFirstChildSerial(fragment);
  let deserialized: Optional<ISerialCacheEntry> = undefined;
  if (isFirstSerial) {
    const firstChild = fragment.removeChild(first);
    const serializedParts: ISerializedPart[] = parseSerializedParts(
      firstChild.textContent || undefined
    );
    const templateElement: HTMLTemplateElement = el;
    if (serializedParts && templateElement) {
      const partGenerators: PartGenerator[] = serializedParts.map(serial => {
        return (target: Node) => {
          const path = serial[0];
          const isSVG = serial[1];
          const partTarget = followPath(target, path);
          if (isArray(partTarget)) {
            return createAttributePart(partTarget[0], path, isSVG);
          }
          return new NodePart(path, partTarget as Node, isSVG);
        };
      });
      deserialized = { templateElement, serializedParts, partGenerators };
    }
  }
  serialCache.set(id, deserialized as ISerialCacheEntry);
  return deserialized;
}

function createAttributePart(target: Node, path: Array<string | number>, isSVG: boolean = false) {
  const partTarget = followPath(target, path) as NodeAttribute;
  const element = partTarget[0];
  const name = partTarget[1];
  let newPart: EventPart | AttributePart;
  const newPropsSet = removedPropsCache.get(element) || createNewPropsSet(element);
  newPropsSet.add(name);
  if (name[0] === "o" && name[1] === "n") {
    newPart = new EventPart(path, element, isSVG);
  } else {
    newPart = new AttributePart(path, element, isSVG);
  }
  removedPropsCache.set(element, newPropsSet);
  return newPart;
}

export function followPath(
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
    cursor = (cursor as HTMLElement).childNodes[next as number];
  }
  return cursor;
}

function pathToParent(element: Node, target: Node): Optional<number[]> {
  let result: number[] = [];
  let cursor: Node = element;
  while (cursor) {
    const next: Optional<Node> = cursor.parentNode;
    if (!next) {
      return;
    }
    result.unshift([].indexOf.call((next as HTMLElement).childNodes, cursor));
    if (next === target) {
      return result;
    } else {
      cursor = next;
    }
  }
  return;
}

export class Template {
  public disposer = new Disposable();
  public target = new DomTarget();
  public parts: Array<NodePart | AttributePart | EventPart>;
  constructor(
    public id: number,
    public element: HTMLTemplateElement,
    partGenerators: PartGenerator[],
    public values: PartValue[]
  ) {
    const fragment = element.content;
    const first = fragment.firstChild;
    const last = fragment.lastChild;
    const parts = (this.parts = partGenerators.map(generator =>
      generator(fragment)
    ));
    const bPartFirst = isPartComment(first);
    const bPartLast = isPartComment(last);
    this.target.start = bPartFirst ? parts[0] : first;
    this.target.end = bPartLast ? parts[parts.length - 1] : last;
    parts.forEach((part, i) => (part as any).update(values[i]));
  }
  public hydrate(element: Node): boolean {
    let result = true;
    let i = 0;
    const len = this.parts.length;
    const target = this.element.content as DocumentFragment;
    for (; i < len; i++) {
      const part = this.parts[i];
      const start = part.target.first();
      const end = part.target.last();
      const startPath = pathToParent(start, target);
      if (!startPath) {
        fail();
      }
      const startTarget = followPath(element, startPath as number[]);
      const startNode = isArray(startTarget)
        ? (startTarget as NodeAttribute)[0]
        : startTarget;
      part.target.start = startNode;
      if (isTemplate(part.value)) {
        const innerTemplate = part.value as Template;
        if (!startNode) {
          fail();
        }
        innerTemplate.hydrate(startNode as Node);
      } else if (isEventPart(part)) {
        (startNode as any)[part.prop] = part.value;
      } else {
        const endPath = pathToParent(end, target);
        if (!endPath) {
          fail();
        }
        const endTarget =
          startPath === endPath
            ? startTarget
            : followPath(element, endPath as number[]);
        part.target.end = isArray(endTarget)
          ? (endTarget as NodeAttribute)[0]
          : endTarget;
      }
    }
    const fragment = this.element.content;
    while (fragment.hasChildNodes()) {
      fragment.removeChild(fragment.lastChild as Node);
    }
    return result;
  }
  public update<T>(newValues?: Array<PartValue>) {
    if (arguments.length === 0) {
      newValues = this.values as Array<T>;
    }
    const templateParts = this.parts as Array<AttributePart | EventPart | NodePart>;
    let i = 0;
    const len = templateParts.length;
    for (; i < len; i++) {
      const part = templateParts[i];
      const newVal = newValues ? newValues[i] : undefined;
      (part as any).update(newVal);
    }
    if (newValues != null) {
      this.values = newValues;
    }
  }
}

function removeAttribute(
  element: HTMLElement,
  name: string,
  isSVG: boolean = false
) {
  if (!isSVG) {
    element.removeAttribute(name);
  } else {
    element.removeAttributeNS(SVG_NS, name);
  }
}

function setAttribute(
  element: HTMLElement,
  name: string,
  value: AttributePartValue,
  isSVG: boolean = false
) {
  if (!isString(value)) {
    value = value.toString();
  }
  if (!isSVG) {
    element.setAttribute(name, value as string);
  } else {
    element.setAttributeNS(SVG_NS, name, value as string);
  }
}

export class Part {
  public value: PartValue | Template;
  public prop: string = EMPTY_STRING;
  public path: Array<string | number>;
  public disposer = new Disposable();
  public target: DomTarget;
  constructor(
    path: Array<string | number>,
    target: Node,
    public isSVG: boolean = false
  ) {
    this.target = new DomTarget(target);
    const len = path.length - 1;
    if (isString(path[len])) {
      this.prop = path[len] as string;
    }
    this.path = path.slice(0);
    this.value = target;
  }
  public update(value?: Optional<PrimitivePartValue>) {}
}

function createNewPropsSet(node: Node) {
  const newSet = new Set<string>();
  removedPropsCache.set(node, newSet);
  return newSet;
}
const removedPropsCache = new Map<Node, Set<string>>();
export class AttributePart extends Part {
  constructor(path: Array<string | number>, target: Node, isSVG: boolean = false) {
    super(path, target, isSVG);
  }
  public update(value?: Optional<AttributePartValue>) {
    // TODO: trace why this AttributePart Directive fails to update correctly...
    if (isDirective(value)) {
      (value as IDirective)(this);
      return;
    }
    if (isPromise(value)) {
      (value as Promise<PartValue>).then(promised => {
        this.update(promised as AttributePartValue);
      });
      return;
    }
    const name = this.prop;
    const element = this.target.start as Node;
    const isSVG = this.isSVG;
    const removedPropsEntry = removedPropsCache.get(element) || createNewPropsSet(element); 
    if (name in element || removedPropsEntry.has(name)) {
      if (value && (element as any)[name] !== value) {
        (element as any)[name] = value;
      } else {
        removedPropsEntry.add(name);
        delete (element as any)[name];
        if ((element as HTMLElement).hasAttribute(name)) {
          removeAttribute(element as HTMLElement, name, isSVG);
        }
      }
    } else {
      if (!value) {
        removeAttribute(element as HTMLElement, name, isSVG);
      } else {
        setAttribute(element as HTMLElement, name, value, isSVG);
      }
    }
  }
}

export class EventPart extends AttributePart {
  constructor(path: Array<string | number>, target: Node, isSVG: boolean = false) {
    super(path, target, isSVG);
  }
  public update(value?: Optional<EventListener>) {
    if (isDirective(value)) {
      (value as IDirective)(this);
      return;
    }
    if (isPromise(value)) {
      (value as Promise<PartValue>).then(promised => {
        this.update(promised as EventListener);
      });
      return;
    }
    if (!value) {
      delete (this.target.start as any)[this.prop];
      value = undefined;
    } else {
      if (this.value !== value) {
        (this.target.start as any)[this.prop] = value;
        this.value = value;
      }
    }
    this.value = value;
  }
}

export class NodePart extends Part {
  constructor(path: Array<string | number>, target: Node, isSVG: boolean = false) {
    super(path, target, isSVG);
  }
  public update(value?: Optional<NodePartValue>) {
    if (isDirective(value)) {
      (value as IDirective)(this);
      return;
    }
    let val: Optional<PartValue | Template> = value;
    if (val == null || arguments.length === 0) {
      val = this.value;
    }
    if (isPromise(val)) {
      (val as Promise<PartValue>).then(promised => {
        this.update(promised);
      });
      return;
    }
    if (isIterable(val)) {
      val = Array.from(val as any);
    }
    if (isArray(val)) {
      const directive = repeat(val);
      directive(this);
      return;
    }
    const first = this.target.first();
    const parent = first.parentNode;
    if (isTemplateGenerator(value)) { 
      const instance = isTemplate(this.value) ? this.value : undefined;
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
        this.target.remove();
        this.target.start = newStart;
        this.target.end = newEnd;
        this.value = template;
      } else {
        fail();
      }
    } else {
      if (value == null) {
        value = document.createComment(`${PART_START}${PART_END}`);
      }
      let newStart: Optional<Node> = undefined;
      let newEnd: Optional<Node> = undefined;
      const partValue = this.value;
      if (isText(partValue)) {
        if (isNode(value)) {
          newStart = value;
          newEnd = value;
          if (isDocumentFragment(value)) {
            newStart = value.firstChild;
            newEnd = value.lastChild;
          }
          (parent as Node).insertBefore(value as Node, first);
          this.target.remove();
          this.target.start = newStart;
          this.target.end = newEnd;
          this.value = value;
        } else if (isText(value) && partValue.textContent !== value.textContent) {
          partValue.textContent = value.textContent;
        } else {
          if (!isString(value)) {
            value = value.toString();
          }
          if (partValue.textContent !== value) {
            partValue.textContent = value as string;
          }
        }
      } else {
        const bText = isText(value);
        if (bText || !isNode(value)) {
          if (!bText) {
            value = document.createTextNode(
              !isString(value) ? value.toString() : value
            );
          }
          newStart = value as Node;
          newEnd = value as Node;
          (parent as Node).insertBefore(value as Node, first);
          this.target.remove();
          this.target.start = newStart;
          this.target.end = newEnd;
          this.value = value;
        } else {
          if (partValue !== value) {
            newStart = value;
            newEnd = value;
            if (isDocumentFragment(value)) {
              newStart = value.firstChild;
              newEnd = value.lastChild;
            }
            (parent as Node).insertBefore(value, first);
            this.target.remove();
            this.target.start = newStart;
            this.target.end = newEnd;
            this.value = value;
          }
        }
      }
    }
  }
}

export class DomTarget {
  public start: Optional<Node | Part | Template> = undefined;
  public end: Optional<Node | Part | Template> = undefined;
  constructor(target?: Node, public isSVG: boolean = false) {
    if (target) {
      this.start = target;
      this.end = target;
    }
  }
  public first(): Node {
    const start = this.start;
    if (isNode(start)) {
      return start;
    } else {
      return (start as Part).target.first();
    }
  }
  public last(): Node {
    const end = this.end;
    if (isNode(end)) {
      return end;
    } else {
      return (end as Part).target.last();
    }
  }
  public remove(): DocumentFragment {
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
  return x && x.nodeType != null;
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
  return x && typeof x === "function";
}

function isString(x: any): x is string {
  return x && typeof x === "string";
}

function isArray<T>(x: any): x is Array<T> {
  return x && Array.isArray(x);
}

function isText(x: any): x is Text {
  return isNode(x) && (x as Node).nodeType === TEXT_NODE;
}

function isIterable<T>(x: any): x is Iterable<T> {
  return x && !isString(x) && !isArray(x) && isFunction((x as any)[Symbol.iterator]);
}

function isPartComment(x: any): x is Comment {
  return isComment(x) && x.textContent === PART_MARKER;
}

function isPromise<T>(x: any): x is Promise<T> {
  return x && isFunction(x.then);
}

function isTemplate(x: any): x is Template {
  return x && x instanceof Template;
}

function isTemplateElement(x: any): x is HTMLTemplateElement {
  return x && isDocumentFragment(x.content);
}

function isTemplateGenerator(x: any): x is ITemplateGenerator {
  return isFunction(x) && x.id;
}

function isPart(x: any): x is Part {
  return x && x instanceof Part;
}

function isAttributePart(x: any) {
  if (isPart(x) && x.prop && x.prop !== "") {
    return true;
  }
  return false;
}

function isEventPart(x: any) {
  if (isAttributePart(x) && x.prop[0] === "o" && x.prop[1] == "n") {
    return true;
  }
  return false;
}

export function directive(fn: DirectiveFn): IDirective {
  (fn as any).directive = true;
  return fn as IDirective;
}

function defaultKeyFn(item: any, index: number): Key {
  return index as number;
}

function defaultTemplateFn(item: any): ITemplateGenerator {
  return html`${item}`;
}
const repeatCache = new Map<Part, [Key[], Map<Key, Template>]>();
export function repeat(
  items: Array<any>,
  keyFn: KeyFn = defaultKeyFn,
  templateFn: TemplateFn = defaultTemplateFn
): IDirective {
  return directive((part: Part) => {
    let keys: Key[] = [];
    let generators: ITemplateGenerator[] = [];
    items.forEach((item, index) => {
      keys.push(keyFn(item, index));
      generators.push(templateFn(item));
    });
    let cursor = part.target.first();
    let parent = cursor.parentNode;
    const cacheEntry = repeatCache.get(part);
    if (!cacheEntry) {
      const newFragment = document.createDocumentFragment();
      const newCacheEntry: [Key[], Map<Key, Template>] = [
        [],
        new Map<Key, Template>()
      ];
      const generatorLen = generators.length - 1;
      let newStart = undefined;
      let newEnd = undefined;
      generators.forEach((generator, index) => {
        const key = keys[index];
        const template = (generator as ITemplateGenerator)();
        template.update();
        newFragment.appendChild(template.element.content);
        newCacheEntry[0].push(key);
        newCacheEntry[1].set(key, template);
        if (index === 0) {
          newStart = template;
        }
        if (index === generatorLen) {
          newEnd = template;
        }
      });
      (parent as Node).insertBefore(newFragment, cursor);
      part.target.remove();
      part.target.start = newStart;
      part.target.end = newEnd;
      repeatCache.set(part, newCacheEntry);
    } else {
      const newMap = new Map<Key, ITemplateGenerator>();
      let index = 0;
      const keysLen = keys.length;
      for (; index < keysLen; index++) {
        const key = keys[index];
        newMap.set(key, generators[index]);
      }
      const [oldOrder, oldMap] = cacheEntry;
      let delta = 0;
      index = 0;
      for (; index + delta < oldOrder.length; index++) {
        const offset = index + delta;
        const key = oldOrder[offset];
        const newEntry = newMap.get(key);
        const oldEntry = oldMap.get(key);
        if (oldEntry && !newEntry) {
          oldEntry.target.remove();
          oldMap.delete(key);
          oldOrder.splice(offset, 1);
          delta--;
        }
      }
      index = 0;
      for (; index < keysLen; index++) {
        const key = keys[index];
        const oldKey = oldOrder[index];
        const newTemplateGenerator = newMap.get(key);
        const oldTemplate = oldMap.get(key);
        const oldTargetTemplate = oldMap.get(oldKey);
        const target = oldTargetTemplate
          ? oldTargetTemplate.target.first()
          : null;
        if (!oldTemplate) {
          const newTemplate = (newTemplateGenerator as ITemplateGenerator)();
          (parent as Node).insertBefore(newTemplate.element.content, target);
          oldOrder.splice(index, 0, key);
          oldMap.set(key, newTemplate);
        } else if (key === oldKey) {
          if (
            oldTemplate.id === (newTemplateGenerator as ITemplateGenerator).id
          ) {
            oldTemplate.update(
              (newTemplateGenerator as ITemplateGenerator).exprs
            );
          } else {
            const oldFirst = oldTemplate.target.first();
            const newTemplate = (newTemplateGenerator as ITemplateGenerator)();
            (parent as Node).insertBefore(
              newTemplate.element.content,
              oldFirst
            );
            oldTemplate.target.remove();
          }
        } else {
          const oldFragment = oldTemplate.target.remove();
          const oldIndex = oldOrder.indexOf(key);
          if (
            oldTemplate.id === (newTemplateGenerator as ITemplateGenerator).id
          ) {
            oldTemplate.update(
              (newTemplateGenerator as ITemplateGenerator).exprs
            );
            (parent as Node).insertBefore(oldFragment, target);
          } else {
            const newTemplate = (newTemplateGenerator as ITemplateGenerator)();
            (parent as Node).insertBefore(newTemplate.element.content, target);
          }
          oldOrder.splice(oldIndex, 1);
          oldOrder.splice(index, 0, key);
        }
        part.target.start = oldMap.get(oldOrder[0]);
        part.target.end = oldMap.get(oldOrder[oldOrder.length - 1]);
      }
    }
  });
}

export function until(
  promise: Promise<PrimitivePartValue>,
  defaultContent: PrimitivePartValue
): IDirective {
  return directive(<T extends any>(part: T) => {
    part.update(defaultContent as T);
    promise.then(value => part.update(value as T));
  });
}

function fail(msg?: Optional<string>): never {
  if (msg) {
    throw new RangeError(msg);
  } else {
    throw new RangeError();
  }
}

const idCache = new Map<TemplateStringsArray, number>();
function getId(arr: TemplateStringsArray): number {
  if (idCache.has(arr)) {
    return idCache.get(arr) as number;
  }
  const str = arr.toString();
  let id = 0;
  if (str.length > 0) {
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      id = (id << 5) - id + char;
      id = id & id;
    }
  }
  idCache.set(arr, id);
  return id;
}

function normalizeMarkUp(strings: TemplateStringsArray) {
  const result: string[] = [];
  let i = 0;
  const len = strings.length;
  for (; i < len; i++) {
    result.push(strings[i].replace(/(\r\n\t|\n|\r\t)/gm,"").replace(/>\s*</gm, "><"));
  }
  return result.join(PART_MARKER).trim();
}

// TODO: breakout the logic in templateSetup() and use TreeWalker instead to fix the missed nodes in some templates with walkDOM...
//  also consider changing to use html`<div id=${"prop"} data-stuff$=${"attribute"} onSomething=${eventHandler}`
/*
function templateSetup(
  serial: ISerializedPart[],
  partGenerators: PartGenerator[]
): WalkFn {
  return (element, walkPath) => {
    const parent = element.ParentNode;
    const isSVG = element ? isNodeSVGChild(element) : false;
    if (isText(element)) {
      const text = element && element.textContent;
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
              const partTarget = followPath(target, adjustedPath as number[]);
              return new NodePart(adjustedPath, partTarget as Node, isSVG);
            });
            cursor++;
          }
        });
        nodes.forEach(node => {
          parent.insertBefore(node, element);
        });
        parent.removeChild(element);
      }
    } else if (isElementNode(element)) {
      [].forEach.call(element.attributes, (attr: Attr) => {
        if (attr.value === PART_MARKER) {
          const name = attr.name;
          const attrPath = walkPath.concat(name);
          serial.push([attrPath, isSVG]);
          partGenerators.push((target: Node) => createAttributePart(target, attrPath, isSVG));
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
          partGenerators.push((target: Node) => createAttributePart(target, propPath, isSVG));
          delete (element as any)[name];
        }
      }
    }
  };
}
*/

const factoryCache = new Map<number, ITemplateGeneratorFactory>();
const serialCache = new Map<number, ISerialCacheEntry>();
export function html(
  strings: TemplateStringsArray,
  ...expressions: PartValue[]
): ITemplateGenerator {
  const id = getId(strings);
  let factory = factoryCache.get(id);
  if (factory) {
    return factory(expressions);
  }
  const markUp = normalizeMarkUp(strings);
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
        // TODO: changeto TreeWalker...
        /*
        walkDOM(
          fragment,
          undefined,
          templateSetup(serializedParts, partGenerators)
        );
        */
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
  view: PartValue,
  container: Node
) {
  if (isIterable(view)) {
    view = Array.from(view as IterablePartValue);
  }
  if (!isTemplateGenerator(view)) {
    view = defaultTemplateFn(view);
  }
  const instance = (container as any).__template;
  let template: Template;
  if (instance && instance.id === (view as ITemplateGenerator).id) {
    instance.update((view as ITemplateGenerator).exprs);
    return;
  } else {
    template = (view as ITemplateGenerator)();
    template.update();
    if (!instance && container.hasChildNodes() && template.hydrate(container)) {
      return;
    }
    instance && instance.disposer.dispose();
  }
  while (container.hasChildNodes()) {
    container.removeChild(container.lastChild as Node);
  }
  container.appendChild(template.element.content);
  (container as any).__template = template;
}
