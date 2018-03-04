export type Optional<T> = T | undefined | null;
export type Key = symbol | string | number;
export type PrimitivePart =
  | IToString
  | string
  | Node
  | DocumentFragment
  | EventListener
  | AttributePartValue;
export type PartValue = Optional<
  | PrimitivePart
  | IPartPromise
  | IDirective
  | IPartArray
  | ITemplateGenerator
  | IterablePartValue
>;
export interface IPartPromise extends Promise<PartValue> {}
export interface IPartArray extends Array<PartValue> {}
export interface IterablePartValue extends Iterable<PartValue> {}
export type PartGenerator = (target: Node) => Part;
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
export type AttributePartValue = string | IToString | {};

const SVG = "SVG";
const SVG_NS = "http://www.w3.org/2000/svg";
const FOREIGN_OBJECT = "FOREIGNOBJECT";
const PART_START = "{{";
const PART_END = "}}";
const PART = "part";
const THREE_DOT = "...";
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
      firstChild.nodeValue || undefined
    );
    const templateElement: HTMLTemplateElement = el;
    if (serializedParts && templateElement) {
      const partGenerators: PartGenerator[] = serializedParts.map(serial => {
        return (target: Node) => {
          const path = serial[0];
          const isSVG = serial[1];
          const partTarget = followPath(target, path);
          if (Array.isArray(partTarget)) {
            return new Part(path, partTarget[0], isSVG);
          }
          return new Part(path, partTarget as Node, isSVG);
        };
      });
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
    const isSVG = element ? isNodeSVGChild(element) : false;
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
              const partTarget = followPath(target, adjustedPath as number[]);
              return new Part(adjustedPath, partTarget as Node, isSVG);
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
        if (attr.nodeValue === PART_MARKER) {
          const name = attr.nodeName;
          const attrPath = walkPath.concat(name);
          serial.push([attrPath, isSVG]);
          partGenerators.push((target: Node) => {
            const partTarget = followPath(target, attrPath) as NodeAttribute;
            return new Part(attrPath, partTarget[0], isSVG);
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
  };
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
    cursor = cursor.childNodes[next as number];
  }
  return cursor;
}

export class Template {
  public disposer = new Disposable();
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
    const parts = (this.parts = partGenerators.map(generator =>
      generator(fragment)
    ));
    this.target.start = isPartComment(first) ? parts[0] : first;
    this.target.end = isPartComment(last) ? parts[parts.length - 1] : last;
    parts.forEach((part, i) => part.update(values[i]));
  }
  public hydrate(element: Node): boolean {
    // TODO: update() in this method or before???
    // I think before would be better but then I have to walk to the 
    // first child of element from both start and end
    let result = true;
    let i = 0;
    const len = this.parts.length;
    for (; i < len; i++) {
      const part = this.parts[i];
      const path = part.path;
      const start = part.target.first();
      const end = part.target.last();
      let cursor: Optional<Node> = start;
      let rank = 0;
      while (cursor && start !== end) {
        let next: Optional<Node> = cursor.nextSibling;
        rank++;
        if (cursor === end) {
          next = undefined;
        }
        cursor = next;
      }
      const onlyNodes = isString(path[len - 1])
        ? (path.slice(0, -1) as number[])
        : (path as number[]);
      const onlyNodesLen = onlyNodes.length;
      const endPath = onlyNodes
        .slice(0, -1)
        .concat(onlyNodes[onlyNodesLen - 1] + rank);
      console.log(endPath);
      // TODO: erase log
    }
    return result;
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

function removeAttribute(
  element: HTMLElement,
  name: string,
  isSVG: boolean = false
) {
  if (!element || !name) {
    return;
  }
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
  if (!element || !name) {
    return;
  }
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
    if (isString(path[path.length - 1])) {
      this.prop = path[path.length - 1] as string;
    }
    this.path = path.slice(0);
    this.value = target;
  }
  public update(value?: PartValue) {
    if (isAttributePart(this)) {
      if (this.prop === THREE_DOT) {
        if (isString(value)) {
          fail();
        }
        const props = value as any;
        const keys = Object.keys(value as any);
        const keysLen = keys.length;
        const oldProps = this.value as any;
        const oldKeys = Object.keys(oldProps);
        const len = oldKeys.length;
        let i = 0;
        for (; i < len; i++) {
          const key = oldKeys[i];
          if (key in props) {
            this.updateAttribute(key, props[key]);
          } else {
            this.updateAttribute(key, undefined);
          }
        }
        for (i = 0; i < keysLen; i++) {
          const key = keys[i];
          if (!(key in oldKeys)) {
            this.updateAttribute(key, props[key]);
          }
        }
      } else {
        this.updateAttribute(this.prop, value);
      }
      return;
    }
    let val: Optional<PartValue | Template> = value;
    if (val == null || arguments.length === 0) {
      val = this.value;
    }
    if (isDirective(val)) {
      (val as IDirective)(this);
      return;
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
    if (Array.isArray(val)) {
      const directive = repeat(val);
      this.value = directive;
      directive(this);
      return;
    }
    if (isTemplateGenerator(val) || isTemplate(val)) {
      this.updateTemplate(val as ITemplateGenerator);
    } else {
      this.updateNode(val as Optional<PartValue>);
    }
  }

  private updateAttribute(name: string, value: Optional<PartValue>) {
    if (isPromise(value)) {
      value.then(promised => {
        this.updateAttribute(name, promised);
      });
      return;
    }
    if (isDirective(value)) {
      value(this);
      return;
    }
    const element = this.target.start as Node;
    if (!element) {
      fail();
    }
    const isSVG = this.isSVG;
    if (!name) {
      fail();
    }
    const isValFn = isFunction(value);
    if (name in element || (isValFn && isEventPart(this))) {
      if (value && (element as any)[name] !== value) {
        (element as any)[name] = value;
      } else {
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

  private updateTemplate(value: ITemplateGenerator) {
    const first = this.target.first();
    const parent = first.parentNode;
    if (!parent) {
      fail();
    }
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
  }

  private updateNode(value: Optional<PartValue>) {
    if (value == null) {
      value = document.createComment(`${PART_START}${PART_END}`);
    }
    const first = this.target.first();
    const parent = first.parentNode;
    if (parent == null) {
      fail();
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
      } else if (isText(value) && partValue.nodeValue !== value.nodeValue) {
        partValue.nodeValue = value.nodeValue;
      } else {
        if (!isString(value)) {
          value = value.toString();
        }
        if (partValue.nodeValue !== value) {
          partValue.nodeValue = value as string;
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

function isIterable<T>(x: any): x is Iterable<T> {
  return (
    !isString(x) && !Array.isArray(x) && isFunction((x as any)[Symbol.iterator])
  );
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
  return x && x instanceof HTMLTemplateElement;
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
  if (isAttributePart(x) && x.prop.startsWith("on")) {
    return true;
  }
  return false;
}

export interface IDirective {
  (part: Part): void;
  directive: boolean;
}
export type DirectiveFn = (part: Part) => void;
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
  promise: Promise<PartValue>,
  defaultContent: PartValue
): IDirective {
  return directive((part: Part) => {
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
  const markUp = strings.join(PART_MARKER);
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
  if (isIterable(view as PartValue)) {
    view = Array.from(view as IterablePartValue);
  }
  if (!isTemplateGenerator(view)) {
    view = defaultTemplateFn(view as PartValue);
  }
  const instance = (container as any).__template;
  if (instance) {
    if (instance.id === (view as ITemplateGenerator).id) {
      instance.update((view as ITemplateGenerator).exprs);
      return;
    } else {
      const newInstance = (view as ITemplateGenerator)();
      container.insertBefore(newInstance.element.content, container.firstChild);
      instance.target.remove();
      (container as any).__template = newInstance;
    }
    return;
  }
  let template = (view as ITemplateGenerator)();
  if (container.hasChildNodes()) {
    if (template.hydrate(container)) {
      return;
    } else {
      while (container.hasChildNodes()) {
        container.removeChild(container.lastChild as Node);
      }
      template = (view as ITemplateGenerator)();
      template.update();
    }
  }
  template.update();
  if (isTemplateElement(template.element)) {
    const first: Optional<Node> = container.firstChild;
    const parent: Optional<Node> = container;
    (parent as Node).insertBefore(template.element.content, first);
    (container as any).__template = template;
  }
}
