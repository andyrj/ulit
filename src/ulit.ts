const SVG_NS = "https://www.w3.org/2000/svg";
const SVG = "SVG";
const FOREIGN_OBJECT = "FOREIGNOBJECT";
const EMPTY_STRING = "";
const PART_START = "{{";
const PART = "part";
const PART_END = "}}";
const TEMPLATE = "template";
const TEMPLATE_ID_START = "ulit-";
const PART_MARKER = `${PART_START}${PART_END}`;
const SERIAL_PART_START = `${PART_START}${PART}s:`;
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT = 11;

// FIND YOUR OWN ABSTRACTION...
export type Optional<T> = T | undefined | null;
export type Key = symbol | number | string;
export type Directive = (part: Part) => void;
export type PrimitivePart = 
  | string
  | Node
  | DocumentFragment
export type PartValue =
  | PrimitivePart
  | IPartPromise
  | Directive
  | IPartArray
  | Template;
export interface IPartPromise extends Promise<PartValue> {};
export interface IPartArray extends Array<PartValue> {};
export type IDisposer = () => void;
export class Disposable {
  public readonly disposed: boolean = false;
  private disposers: IDisposer[] = [];
  constructor() {}
  public addDisposer(handler: IDisposer) {
    if (this.disposers.indexOf(handler) > -1) {
      return;
    }
    this.disposers.push(handler);
  }
  public dispose() {
    while(this.disposers.length > 0) {
      (this.disposers.pop() as IDisposer)();
    }
  }
  public removeDisposer(handler: IDisposer) {
    const index = this.disposers.indexOf(handler);
    if (index === -1) {
      return;
    }
    this.disposers.splice(index, 1);
  }
}

function isFunction(x: any): boolean {
  return typeof x === "function";
}

function isString(x: any): boolean {
  return typeof x === "string";
}

function isNumber(x: any): boolean {
  return typeof x === "number";
}

function isNode(x: any): boolean {
  return x as Node && (x as Node).nodeType > 0;
}

function isIterable(x: any) {
  return !isString(x) &&
        !Array.isArray(x) &&
        isFunction((x as any)[Symbol.iterator]);
}

function isDirectivePart(x: any) {
  return isFunction(x) && x.length === 1;
}

function isDocumentFragment(x: any): boolean {
  return isNode(x) && (x as Node).nodeType === DOCUMENT_FRAGMENT;
}

function isComment(x: any) {
  return isNode(x) && (x as Node).nodeType === COMMENT_NODE;
}

function isPartComment(x: any | null | undefined): boolean {
  return isComment(x) && x.nodeValue === PART_MARKER;
}

function isPromise(x: any): boolean {
  return x && isFunction(x.then);
}

function isTemplate(x: any): boolean {
  return x && x.type && x.type === TEMPLATE;
}

const fragmentCache: DocumentFragment[] = [];
function getFragment(): DocumentFragment {
  if (fragmentCache.length === 0) {
    return document.createDocumentFragment();
  } else {
    return fragmentCache.pop() as DocumentFragment;
  }
}

function recoverFragment(fragment: DocumentFragment) {
  while(fragment.hasChildNodes()) {
    fragment.removeChild(fragment.lastChild as Node);
  }
  fragmentCache.push(fragment);
}

export class DomTarget extends Disposable {
  public start: Optional<Node | DomTarget> = undefined;
  public end: Optional<Node | DomTarget> = undefined;
  constructor(
    start?: Node | DomTarget,
    end?: Node | DomTarget,
    public readonly isSVG: boolean = false,
    public attribute: string = EMPTY_STRING
  ) {
    super();
    if (start) {
      this.start = start;
    }
    if (end) {
      this.end = end;
    }
  }
  public firstNode(): Node {
    return isNode(this.start) ? this.start as Node : (this.start as DomTarget).firstNode();
  }
  public lastNode(): Node {
    if (isNode(this.end)) {
      return this.end as Node;
    } else if(isString(this.end)){
      return isNode(this.start) ? this.start as Node : (this.start as DomTarget).lastNode();
    }
    return (this.end as DomTarget).lastNode();
  }
  public remove(): Optional<DocumentFragment> {
    const fragment = getFragment();
    let cursor: Optional<Node> = this.firstNode();
    while (cursor !== undefined) {
      const next: Node = cursor.nextSibling as Node;
      fragment.appendChild(cursor);
      cursor = (cursor === this.end || !next) ? undefined : next;
    }
    return fragment;
  }
}

export class Template extends DomTarget {
  public static type: string = TEMPLATE;
  public fragment: Optional<DocumentFragment> = undefined;
  public parent: Optional<DomTarget> = undefined;
  constructor(public id: number, public templateElement: HTMLTemplateElement, public values: PartValue[]) {
    super();
  }
  public update(values?: PartValue[]) {}
}

type NodeAttribute = [Node, string];
function followPath(
  target: Optional<Node | Template>,
  pointer: Array<string | number>
): Optional<Node | NodeAttribute> {
  if (
    pointer.length === 0 ||
    !target ||
    isPartComment(target)
  ) {
    return target as Node | undefined;
  }
  const node = isTemplate(target) ? (target as Template).firstNode() : target as Node;
  const cPath = pointer.slice(0);
  const current = cPath.shift() as string;
  const num = isString(current) ? parseInt(current, 10) : current;
  if (isString(current)) {
    return [node as Node, current as string];
  } else {
    if (
      node &&
      node.childNodes &&
      node.childNodes.length > num &&
      (node.childNodes as any)[num]
    ) {
      const el = node.childNodes[num as number];
      return followPath(el, cPath);
    } else {
      throw new RangeError();
    }
  }
}

export class Part extends DomTarget {
  public static type: string = PART;
  public isAttached: boolean = false;
  public parent: Optional<Template> = undefined;
  public readonly path: Array<string | number>;
  public value: Optional<PartValue> = undefined;
  constructor(
    path: Array<string | number>,
    start: Node,
    end: Node | string,
    isSVG: boolean = false
  ) {
    super(start, isString(end) ? undefined : end as Node, isSVG, isString(end) ? end as string : EMPTY_STRING);
    Object.freeze(path);
    this.path = path;
  }
  public attachTo(container: Template) {
    this.parent = container;
    const target = followPath(container, this.path);
    // TODO: finish attachTo logic...
  }
  public update(value?: PartValue) {
    if (this.isAttached) {
      if (value !== this.value) {
        this.set(value);
      }
    }
    this.value = value;
  }
  private set(value?: PartValue) {
    // TODO: write a new set implementation for coerced templates as only type of Part....
  }
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

export type ITemplateGenerator = () => Template;
const templateGeneratorCache = new Map<number, ITemplateGenerator>();
interface ISerialCacheEntry {
  template: HTMLTemplateElement;
  parts: Part[];
}
const serialCache = new Map<number, ISerialCacheEntry>();
export function html(strs: string[], ...exprs: PartValue[]): ITemplateGenerator {
  const id = getId(strs.toString());
  const generator = templateGeneratorCache.get(id);
  if (generator) {
    return generator;
  }
  const cacheEntry = serialCache.get(id);
  const deserialized = cacheEntry
    ? cacheEntry
    : checkForSerialized(id);
  let template: Optional<HTMLTemplateElement> = undefined;
  let parts: Part[] = [];
  if (deserialized) {
    template = deserialized.template;
    parts = deserialized.parts;
  }
  const newGenerator = () => {
    if (!template) {
      template = document.createElement(TEMPLATE);
      template.innerHTML = strs.join(PART_MARKER);
      walkDOM(template.content, undefined, templateSetup(parts as Part[]));
      serialCache.set(id, { template, parts: parts || [] });
    }
    return new Template(id, template as HTMLTemplateElement, exprs);
  }
  templateGeneratorCache.set(id, newGenerator);
  return newGenerator;
}

const renderedCache = new WeakMap<Node, Template>();
export function render(generator: ITemplateGenerator, container?: Node, element?: Node) {

}

type WalkFn = (
  Parent: Node,
  element: Node | null | undefined,
  path: Array<string | number>
) => boolean;

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
  if (!condition || !element || element.childNodes.length === 0) {
    throw new RangeError();
  }
  [].forEach.call(element.childNodes, (child: Node, index: number) => {
    path.push(index);
    walkDOM(element as HTMLElement, child, fn, path);
    path.pop();
  });
}

function templateSetup(parts: Part[]): WalkFn {
  return (parent, element, walkPath) => {
    if (!element) {
      throw new RangeError();
    }
    const nodeType = element && element.nodeType;
    const isSVG = isNodeSVGChild(element);
    if (nodeType === TEXT_NODE) {
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
            parts.push(new Part(adjustedPath, newPartComment, newPartComment, isSVG));
            cursor++;
          }
        });
        nodes.forEach(node => {
          parent.insertBefore(node, element as Node);
        });
        parent.removeChild(element);
      }
    } else if (nodeType === ELEMENT_NODE) {
      [].forEach.call(element.attributes, (attr: Attr) => {
        if (attr.nodeValue === PART_MARKER) {
          parts.push(new Part(walkPath.concat(attr.nodeName), element, attr, isSVG));
        }
      });
    }
    return true;
  };
}

function isNodeSVGChild(node: Node): boolean {
  let result = false;
  let current: Optional<Node> = node;
  while (current) {
    if (current.nodeName === SVG) {
      result = true;
      current = undefined;
    } else if(current.nodeName === FOREIGN_OBJECT) {
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

function parseSerializedParts(
  value: string | null | undefined
): Array<Part | null | undefined> {
  if (!value) {
    return [];
  } else {
    return JSON.parse(value.split(SERIAL_PART_START)[1].slice(0, -2));
  }
}

function checkForSerialized(
  id: number
): Optional<ISerialCacheEntry> {
  const el = document.getElementById(TEMPLATE_ID_START+id) as HTMLTemplateElement;
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
  let deserialized: ISerialCacheEntry | null | undefined;
  if (isFirstSerial) {
    const fc = fragment.removeChild(first);
    const parts = parseSerializedParts(fc.nodeValue) as Part[];
    const template = el as HTMLTemplateElement;
    if (parts && template) {
      deserialized = { template, parts };
    }
  }
  if (deserialized) {
    return deserialized;
  }
  return;
}

export type KeyFn = (item: any, index?: number) => Key;
function defaultKeyFn(index: number): Key {
  return index;
}

export type TemplateFn = (item: {}) => Template;
function defaultTemplateFn(item: {}): Template {
  // @ts-ignore
  return html`${item}`();
}

const repeatCache = new Map<Part, [Key[], Map<Key, Template>]>();
export function repeat(
  items: Array<{}>,
  keyFn: KeyFn = defaultKeyFn,
  templateFn: TemplateFn = defaultTemplateFn
): Directive {
  return (part: Part) => {
    let target = part.firstNode();
    const parent = target.parentNode;
    if (!parent) {
      throw new RangeError();
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
    const [oldCacheOrder, oldCacheMap] = repeatCache.get(part) || [[], new Map<Key, Template>()];
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
      let oldEntry = oldCacheMap.get(key);
      const nextTemplate = templates[index];
      if (oldEntry) {
        if (key === oldCacheOrder[index]) {
          // update in place
          if (oldEntry.id === nextTemplate.id) {
            oldEntry.update(nextTemplate.values);
          } else {
            //  maybe at some point think about diffing between templates?
            nextTemplate.update();
            // TODO: rewrite without helper methods...
            // nextTemplate.insertBefore(oldEntry);
            oldEntry.remove();
            oldCacheMap.set(key, nextTemplate);
          }
        } else {
          const targetEntry = oldCacheMap.get(oldCacheOrder[index]);
          if (!targetEntry) {
            throw new RangeError();
          }
          target = targetEntry.firstNode();
          const oldIndex = oldCacheOrder.indexOf(key);
          oldCacheOrder.splice(oldIndex, 1);
          oldCacheOrder.splice(index, 0, key);
          // const frag = oldEntry.remove();
          if (oldEntry.id === nextTemplate.id) {
            oldEntry.update(nextTemplate.values);
            // parent.insertBefore(frag, target);
          } else {
            nextTemplate.update();
            // TODO: rewrite without the dom helper methods...
            // nextTemplate.insertBefore(target);
          }
        }
        return;
      }
      // add template to 
      const cursor = oldCacheOrder[index];
      oldEntry = oldCacheMap.get(cursor);
      const firstNode = part.firstNode();
      if (index === 0 && isPartComment(firstNode) && !cursor && !oldEntry) {
        // TODO: rewrite without dom helpers...
        // nextTemplate.insertBefore(firstNode);
        parent.removeChild(firstNode);
        oldCacheOrder.push(key);
      } else {
        if (!oldEntry) {
          throw new RangeError();
        }
        // TODO: rewrite without dom helpers...
        // nextTemplate.insertBefore(oldEntry);
        oldCacheOrder.splice(index, 0, key);
      }
      oldCacheMap.set(key, nextTemplate);
    });
  };
}

export function until(
  promise: Promise<PartValue>,
  defaultContent: PartValue
): Directive {
  return (part: Part) => {
    part.update(defaultContent);
    promise.then(value => part.update(value));
  };
}

/*
const idCache = new Map<string, number>();

type WalkFn = (
  parent: Node,
  element: Node | null | undefined,
  path: Array<string | number>
) => boolean;

interface ISerialCacheEntry {
  template: HTMLTemplateElement;
  parts: IPart[];
}

export type Key = symbol | number | string;
export type Directive = (part: IPart) => void;
export type PrimitivePart = 
  | string
  | number
  | Node
  | DocumentFragment
export type PartValue =
  | PrimitivePart
  | IPartPromise
  | Directive
  | IPartArray
  | ITemplate;
export interface IPartPromise extends Promise<PartValue> {};
export interface IPartArray extends Array<PartValue> {};
export type IDomTargetDispose = (part: IDomTarget) => void;

const DomTargetHide: string[] = [
  "disposers",
  "fragment",
  "start",
  "end"
];
const DomTargetRO: string[] = [
  "isAttached",
  "isSVG"
];

export interface IDomTarget {
  readonly isAttached: boolean;
  addDisposer: (handler: IDomTargetDispose) => void;
  firstNode: () => Node;
  lastNode: () => Node;
  appendTo: (parent: Node) => void;
  insertAfter: (target: IDomTarget | Node) => void;
  insertBefore: (target: IDomTarget | Node) => void;
  remove: () => DocumentFragment;
  removeDisposer: (handler: IDomTargetDispose) => void;
  replaceWith: (next: Node | IDomTarget) => void;
}

const fragmentCache: DocumentFragment[] = [];
function getFragment(): DocumentFragment {
  if (fragmentCache.length > 0) {
    const frag = fragmentCache.pop();
    if (!frag) {
      throw new Error();
    }
    return frag;
  } else {
    return document.createDocumentFragment();
  }
}

function recoverFragment(fragment: DocumentFragment) {
  while(fragment.hasChildNodes()) {
    fragment.removeChild(fragment.lastChild as Node);
  }
  fragmentCache.push(fragment);
}

function getIDomTarget(target: IDomTarget): PrivatePart | PrivateTemplate {
  const entry = iDomTargetCache.get(target) || target;
  if (!entry) {
    throw new RangeError();
  }
  return entry as PrivatePart | PrivateTemplate;
}

const iDomTargetCache = new Map<IDomTarget, PrivatePart | PrivateTemplate>();
class DomTarget {
  public isAttached: boolean = false;
  public fragment: Optional<DocumentFragment> = undefined;
  public isSVG: boolean = false;
  public disposers: IDomTargetDispose[] = [];
  public start: Optional<Node | IDomTarget> = undefined;
  public end:Optional<Node | IDomTarget | string> = undefined;
  constructor(
    start?: Node | IDomTarget,
    end?: Node | IDomTarget | string, 
  ) {
    if (start) {
      this.start = start;
    }
    if (end) {
      this.end = end;
    }
  }
  
  public addDisposer(handler: IDomTargetDispose) {
    const _ = getIDomTarget(this as IDomTarget);
    if (
      isFunction(handler) &&
      _.disposers.indexOf(handler) === -1
    ) {
      _.disposers.push(handler);
    }
  }

  public removeDisposer(handler: IDomTargetDispose) {
    const _ = getIDomTarget(this as IDomTarget);
    const index = _.disposers.indexOf(handler);
      if (index > -1) {
        _.disposers.splice(index, 1);
      }
  }

  public firstNode(): Node {
    return followEdge(this as IDomTarget, "start");
  }
  public lastNode(): Node {
    return followEdge(this as IDomTarget, "end");
  }

  public appendTo(parent: Node) {
    if (!parent) {
      throw new Error();
    }
    const _ = getIDomTarget(this as IDomTarget);
    if (_.isAttached) {
      _.remove();
    }
    if (!_.fragment) {
      _.fragment = getFragment();
    }
    parent.appendChild(_.fragment);
    _.isAttached = true;
  }

  public insertAfter(target: DomTarget | Node) {
    if (!target) {
      throw new Error();
    }
    const _ = getIDomTarget(this as IDomTarget);
    if (_.isAttached) {
      _.remove();
    }
    if (!_.fragment || !_.fragment.hasChildNodes()) {
      return;
    }
    const t = isNode(target) ? target as Node : (target as DomTarget).lastNode() as Node;
    const next = t.nextSibling;
    const parent = t.parentNode;
    if (!parent) {
      throw new Error();
    }
    if (!next) {
      _.appendTo(parent);
    } else if (next){
      _.insertBefore(next);
    }
    _.isAttached = true;
  }
  public insertBefore(target: DomTarget | Node) {
    if (!target) {
      throw new Error();
    }
    const _ = getIDomTarget(this as IDomTarget);
    if (_.isAttached) {
      _.remove();
    }
    if (!this.fragment) {
      throw new RangeError();
    }
    const t = isNode(target) ? target as Node : (target as DomTarget).firstNode() as Node;
    const parent = t.parentNode;
    if (parent) {
      parent.insertBefore(this.fragment, t);
    } else {
      throw new Error();
    }
    _.isAttached = true;
  }

  public remove() {
    if (!this.isAttached) {
      return;
    }
    const _ = getIDomTarget(this as IDomTarget);
    const fragment = getFragment();
    let cursor: Optional<Node> = _.firstNode();
    while (cursor !== undefined) {
      const next: Node = cursor.nextSibling as Node;
      fragment.appendChild(cursor);
      cursor = (cursor === this.end || !next) ? undefined : next;
    }
    _.isAttached = false;
    return fragment;
  }

  public replaceWith(next: Node | IDomTarget) {
    if (!next) {
      throw new Error();
    }
    if (!this.isAttached) {
      return;
    }
    const _ = getIDomTarget(this as IDomTarget);
    // TODO: fix this logic...
    const first = _.firstNode();
    const parent = first.parentNode;
    if (!parent) {
      throw new RangeError();
    }
    if (isNode(next)) {
      parent.insertBefore(next as Node, first);
      _.remove();
    } else {
      const n = getIDomTarget(next as IDomTarget);
      n.insertBefore(first);
      // TODO: is this enough to replace the Part/Template...?
      _.remove();
      _.start = n.start;
      _.end = n.end;
      _.isAttached = n.isAttached;
    }
  }
}

function isPart(x: any): boolean {
  return x && x.type && x.type === "part";
}

export type Optional<T> = T | undefined | null;

function isFunction(x: any): boolean {
  return typeof x === "function";
}

function isString(x: any): boolean {
  return typeof x === "string";
}

function isNumber(x: any): boolean {
  return typeof x === "number";
}

function followEdge(target: IDomTarget | Node, edge: "start" | "end"): Node | never {
  if (!target) {
    throw new RangeError();
  }
  if (isNode(target)) {
    return target as Node;
  }
  const _ = getIDomTarget(target as IDomTarget);
  const cond = edge === "start";
  const next = cond
    ? (target as DomTarget).start
    : (target as DomTarget).end;
  if (isPart(next) || isTemplate(next)) {
    return followEdge(next as IDomTarget, edge);
  } else if (isNode(next)) {
    return next as Node;
  } else {
    // has to be a string here...
    return (target as DomTarget).start as Node;
  }
}

function createAPIProxy(hide: string[], ro: string[], obj: any) {
  const APIHandler = {
    get(target: any, name: string) {
      if (name in target && hide.indexOf(name) === -1) {
        return target[name];
      } else {
        return undefined;
      }
    },
    set(target: any, name: string, value: any) {
      if (hide.indexOf(name) > -1) {
        return false;
      }
      if (ro.indexOf(name) > -1) {
        throw new RangeError(`${name} is readonly`);
      }
      if (name in target) {
        target[name] = value;
        return true;
      } else {
        return false;
      }
    }
  };
  return new Proxy(obj, APIHandler);
}

export interface IPart extends IDomTarget{
  readonly path: Array<number | string>;
  readonly type: string;
  update: (value: PartValue) => void;
  readonly value: Optional<PartValue>;
};

const PartRO: string[] = DomTargetRO.concat([
  "path",
  "type",
  "value"
]);
const PartHide: string[] = DomTargetHide.concat([
  "attach",
  "updateArray",
  "updateNode",
  "updateTemplate",
  "updateAttribute"
]);

class PrivatePart extends DomTarget {
  public value: Optional<PartValue> = undefined;
  public type = "part";
  constructor(
    public path: Array<string | number>,
    public start: Node | IDomTarget,
    public end: Node | IDomTarget | string,
    public isSVG: boolean = false
  ) {
    super(start, end);
    this.path = path.slice(0);
    Object.freeze(this.path);
    Object.freeze(this.type);
    if (!isNode(start)) {
      throw new Error();
    }
  }
  public attach(node: Node) {
    const _ = getIDomTarget(this as IDomTarget) as PrivatePart;
    const target = followDOMPath(node, _.path);
    if (!target) {
      throw new RangeError();
    }
    if (Array.isArray(target)) {
      _.start = target[0];
      _.end = target[1];
    } else {
      _.start = target;
      if (isDocumentFragment(_.value)) {
        let newPath;
        walkDOM(node as HTMLElement | DocumentFragment, undefined, (parent, element, walkPath) => {
          if (element === (this.value as DocumentFragment).lastChild) {
            newPath = walkPath;
            return false;
          }
          return true;
        });
        if (newPath) {
          _.end = followDOMPath(node, _.path.concat(newPath)) as Node;
        } else {
          throw new RangeError();
        }
      } else if (isTemplate(_.value)) {
        _.end = (_.value as ITemplate).lastNode();
      } else {
        _.end = target;
      }
    }
    _.isAttached = true;
  }

  public dispose() {
    const _ = getIDomTarget(this as IDomTarget) as PrivatePart;
    if (_.disposers.length > 0) {
      _.disposers.forEach(disposer => disposer(_ as IDomTarget));
    }
  }

  public updateArray(value: PartValue[]) {
    const _ = getIDomTarget(this as IDomTarget) as PrivatePart;
    repeat(value)(_ as IPart);
  }
  
  public updateNode(value: PrimitivePart) {
    const _ = getIDomTarget(this as IDomTarget) as PrivatePart;
    const element = this.firstNode();
    const parent = element.parentNode;
    if (!parent) {
      throw new RangeError();
    }
    const valueIsNumber = isNumber(value);
    if (valueIsNumber || isString(value)) {
      const strVal = valueIsNumber ? value as string : value.toString();
      if (element.nodeType !== TEXT_NODE) {
        const newEl = document.createTextNode(strVal);
        parent.insertBefore(newEl, element);
        _.remove();
        _.start = newEl;
        _.end = newEl;
      }
      if (element.textContent !== value) {
        (element as Text).textContent = strVal;
      }
    } else {
      const isFrag = (value as Node).nodeType === DOCUMENT_FRAGMENT;
      const newStart = isFrag ? (value as DocumentFragment).firstChild : value as Node;
      const newEnd = isFrag ? (value as DocumentFragment).lastChild : value as Node;
      parent.insertBefore(value as Node | DocumentFragment, element);
      _.remove();
      if (newStart && newEnd) {
        _.start = newStart;
        _.end = newEnd;
      } else {
        throw new RangeError();
      }
    }
    _.value = value;
  }

  public updateTemplate(template: ITemplate) {
    const _ = getIDomTarget(this as IDomTarget) as PrivatePart;
    if (isTemplate(_.value) && template.key === (_.value as ITemplate).key) {
      (_.value as ITemplate).update(template.values);
    } else {
      template.update();
      _.replaceWith(template);
      _.value = template;
    }
  }

  public updateAttribute(value: any) {
    const _ = getIDomTarget(this as IDomTarget) as PrivatePart;
    const element: HTMLElement = _.start as HTMLElement;
    const name: Optional<string> = isString(_.end) ? _.end as string : undefined;
    if (!name) {
      throw new RangeError();
    }
    try {
      (element as any)[name] = !value && value !== false ? "" : value;
    } catch (_) {} // eslint-disable-line
    if (!isFunction(value)) {
      if (!value && value !== false) {
        if (_.isSVG) {
          element.removeAttributeNS(SVG_NS, name);
        } else {
          element.removeAttribute(name);
        }
      } else {
        if (_.isSVG) {
          element.setAttributeNS(SVG_NS, name, value);
        } else {
          element.setAttribute(name, value);
        }
      }
    }
    _.value = value;
  }

  public update(value: PartValue) {
    const _ = getIDomTarget(this as IDomTarget) as PrivatePart;
    if (!value && _.value) {
      value = _.value;
    }
    if (isDirectivePart(value)) {
      (value as Directive)(this as IPart);
      return;
    }
    if (isString(_.end)) {
      _.updateAttribute(value);
    } else {
      if (isIterable(value)) {
        value = Array.from(value as any);
      }
      if (isPromise(value)) {
        (value as Promise<PartValue>).then(promised => {
          _.update(promised);
        });
      } else if (isTemplate(value)) {
        _.updateTemplate(value as ITemplate);
      } else if (Array.isArray(value)) {
        _.updateArray(value);
      } else {
        _.updateNode(value as PrimitivePart);
      }
    }
  }
}

export function Part(
  path: Array<number | string>,
  start: Node,
  end: Node | string,
  isSVG: boolean = false
): IPart {
  const part = new PrivatePart(path, start, end, isSVG);
  const proxy = createAPIProxy(PartHide, PartRO, part);
  iDomTargetCache.set(proxy, part);
  Object.seal(part);
  return proxy;
}

// function isAttributePart(part: IPart): boolean {
//   const start = part.start;
//   const end = part.end;
//   if (isString(end) && isNode(start)) {
//     return true;
//   }
//   return false;
// }

// function isEventPart(part: IPart): boolean {
//   const end = part.end;
//   if (isAttributePart(part) && (end as string).startsWith("on")) {
//     return true;
//   }
//   return false;
// }

type NodeAttribute = [Node, string];
function followDOMPath(
  node: Node | null | undefined,
  pointer: Array<string | number>
): Node | NodeAttribute | null | undefined {
  if (
    pointer.length === 0 ||
    !node ||
    (node && (node.nodeType === TEXT_NODE || node.nodeType === COMMENT_NODE))
  ) {
    return node;
  }
  const cPath = pointer.slice(0);
  const current = cPath.shift() as string;
  const num = isString(current) ? parseInt(current, 10) : current;
  if (isString(current)) {
    return [node, current as string];
  } else {
    if (
      node &&
      node.childNodes &&
      node.childNodes.length > num &&
      (node.childNodes as any)[num]
    ) {
      const el = node.childNodes[num as number];
      return followDOMPath(el, cPath);
    } else {
      throw new RangeError();
    }
  }
}

function isIterable(x: any) {
  return !isString(x) &&
        !Array.isArray(x) &&
        isFunction((x as any)[Symbol.iterator]);
}

function isDirectivePart(x: any) {
  return isFunction(x) && x.length === 1;
}

function isDocumentFragment(x: any): boolean {
  return isNode(x) && (x as Node).nodeType === DOCUMENT_FRAGMENT;
}

function isComment(x: any) {
  return isNode(x) && (x as Node).nodeType === COMMENT_NODE;
}

function isPartComment(x: any | null | undefined): boolean {
  return isComment(x) && x.nodeValue === PART_MARKER;
}

function isNode(x: any): boolean {
  return x as Node && (x as Node).nodeType > 0;
}

function isPromise(x: any): boolean {
  return x && isFunction(x.then);
}

function isTemplate(x: any): boolean {
  return x && x.type && x.type === "template";
}

export interface ITemplate extends IDomTarget {
  dispose: () => void;
  readonly key: string;
  readonly parts: IPart[];
  readonly type: string;
  update: (newValues?: PartValue[]) => void;
  readonly values: PartValue[];
};
const TemplateRO: string[] = DomTargetRO.concat([
  "initialized",
  "key",
  "parts",
  "values",
  "type"
]);
const TemplateHide: string[] = [
  "hydrate"
];

class PrivateTemplate extends DomTarget {
  public initialized: boolean = false;
  public disposers: IDomTargetDispose[] = [];
  public type = "template";
  constructor(
    public key: string,
    public template: HTMLTemplateElement,
    public parts: IPart[],
    public values: PartValue[]
  ) {
    super();
    Object.freeze(this.key);
    Object.freeze(this.type);
    // TODO: fix init, set start and end to something valid here...
  }
  
  public hydrate(target: Node): boolean | never {
    const _ = getIDomTarget(this as IDomTarget) as PrivateTemplate;
    if (this.initialized) {
      throw new Error(); // only hydrate newly created Templates...
    }
    _.update();
    try {
      _.parts.forEach(part => {
        const p = getIDomTarget(part as IDomTarget) as PrivatePart;
        if (!p) {
          throw new RangeError();
        }
        p.attach(target);
      });
      const fragment = _.fragment as DocumentFragment;
      if (fragment) {
        while (fragment.hasChildNodes) {
          fragment.removeChild(fragment.lastChild as Node);
        }
      }
    } catch(err) {
      return false;
    }
    return true;
  };

  public dispose() {
    const _ = getIDomTarget(this as IDomTarget) as PrivateTemplate;
    _.parts.forEach(part => {
      const p = getIDomTarget(part);
      if (!p) {
        throw new RangeError();
      }
      p.dispose();
    });
    if (_.disposers.length > 0) {
      _.disposers.forEach(disposer => {
        disposer(this as IDomTarget);
      });
    }
  }

  public update(values?: PartValue[]) { 
    const _ = getIDomTarget(this as IDomTarget) as PrivateTemplate;
    if (!_.fragment) {
      _.fragment = getFragment();
    }
    if (!_.initialized) {
      const t: HTMLTemplateElement = document.importNode(_.template, true);
      _.fragment = t.content;
      if (!_.fragment.firstChild || !_.fragment.lastChild) {
        throw new RangeError();
      }
      // TODO: debug from here why my lazy init of fragment is causing undefined.firstNode() on line #912/179
      _.start = isComment(_.fragment.firstChild as Node) ? _.fragment.firstChild : _.parts[0] as IDomTarget;
      _.end = isComment(_.fragment.lastChild as Node) ? _.fragment.lastChild : _.parts[_.parts.length - 1] as IDomTarget; 
      // _.isAttached = true;
      _.parts.forEach(part => {
        const p = getIDomTarget(part) as PrivatePart;
        if (!p) {
          throw new RangeError();
        }
        p.attach(_.fragment as Node);
      });
    }
    _.values = !values ? _.values : values;
    if (_.values) {
      _.parts.forEach((part, i) => {
        part.update(_.values[i]);
      });
    }
    if (!_.initialized) {
      _.initialized = true;
    }
  }
}

type ITemplateFactoryFn = (values?: PartValue[]) => ITemplate;
const templateFactoryCache = new Map<string, ITemplateFactoryFn>();
function TemplateFactory(key: string, element: HTMLTemplateElement, parts: IPart[], values: PartValue[]): ITemplateFactoryFn {
  const result = templateFactoryCache.get(key);
  if (!result) {
    const fn = (newValues?: PartValue[]) => {
      const template = new PrivateTemplate(key, element, parts, newValues || values);
      const proxy = createAPIProxy(TemplateHide, TemplateRO, template);
      iDomTargetCache.set(proxy, template);
      Object.seal(template);
      return proxy as ITemplate;
    };
    templateFactoryCache.set(key, fn);
    return fn;
  }
  return result; 
}

function hashCode(str: string): number {
  let id = 0;
  if (str.length > 0) {
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      id = (id << 5) - id + char;
      id = id & id;
    }
  }
  return id;
}

interface IDeserializedTemplate {
  template: HTMLTemplateElement;
  parts: IPart[];
};

function isFirstChildSerial(parent: DocumentFragment): boolean {
  const child = parent.firstChild;
  return (child &&
    child.nodeType === COMMENT_NODE &&
    child.nodeValue &&
    child.nodeValue.startsWith(SERIAL_PART_START)) as boolean;
}

function parseSerializedParts(
  value: string | null | undefined
): Array<IPart | null | undefined> {
  if (!value) {
    return [];
  } else {
    return JSON.parse(value.split("{{parts:")[1].slice(0, -2));
  }
}

function checkForSerialized(
  id: number
): IDeserializedTemplate | null | undefined {
  const el = document.getElementById(
    `template-${id}`
  ) as HTMLTemplateElement;
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
  let deserialized: IDeserializedTemplate | null | undefined;
  if (isFirstSerial) {
    const fc = fragment.removeChild(first);
    const parts = parseSerializedParts(fc.nodeValue) as IPart[];
    const template = el as HTMLTemplateElement;
    if (parts && template) {
      deserialized = { template, parts };
    }
  }
  if (deserialized) {
    return deserialized;
  }
  return;
}

function walkDOM(
  parent: HTMLElement | DocumentFragment,
  element: Node | null | undefined,
  fn: WalkFn,
  path: Array<number | string> = []
) {
  let cont = true;
  if (element) {
    cont = fn(parent, element, path);
  } else {
    element = parent;
  }
  if (cont && element && element.childNodes.length > 0) {
    if (!element) {
      throw new RangeError();
    }
    [].forEach.call(element.childNodes, (child: Node, index: number) => {
      path.push(index);
      walkDOM(element as HTMLElement, child, fn, path);
      path.pop();
    });
  }
}

function isSVGChild(node: Node | null | undefined): boolean {
  let result = false;
  let current = node;
  while (current) {
    if (current.nodeName === "SVG") {
      result = true;
      current = undefined;
    } else {
      current = current.parentNode;
    }
  }
  return result;
}

function templateSetup(parts: IPart[]): WalkFn {
  return (parent, element, walkPath) => {
    if (!element) {
      throw new RangeError();
    }
    const nodeType = element && element.nodeType;
    if (nodeType === TEXT_NODE) {
      const isSVG = isSVGChild(element);
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
            parts.push(Part(adjustedPath, newPartComment, newPartComment, isSVG));
            cursor++;
          }
        });
        nodes.forEach(node => {
          parent.insertBefore(node, element as Node);
        });
        parent.removeChild(element);
      }
    } else if (nodeType === ELEMENT_NODE) {
      const isSVG = isSVGChild(element);
      [].forEach.call(element.attributes, (attr: Attr) => {
        if (attr.nodeValue === PART_MARKER) {
          parts.push(Part(walkPath.concat(attr.nodeName), element, attr, isSVG));
        }
      });
    }
    return true;
  };
}

export function html(
  strs: TemplateStringsArray,
  ...exprs: PartValue[]
) {
  const staticMarkUp = strs.toString();
  const id = idCache.get(staticMarkUp) || hashCode(staticMarkUp);
  const cacheEntry = serialCache.get(id);
  const deserialized = cacheEntry
    ? cacheEntry
    : checkForSerialized(id) as IDeserializedTemplate;
  let template = deserialized && deserialized.template;
  const parts = (deserialized && deserialized.parts) || [];
  if (!template) {
    template = document.createElement("template");
    template.innerHTML = strs.join(PART_MARKER);
    walkDOM(template.content, undefined, templateSetup(parts));
    serialCache.set(id, { template, parts });
  }
  return TemplateFactory(staticMarkUp, template, parts, exprs)();
}

const renderedTemplates = new WeakMap<Node, ITemplate>();
export function render(
  template: ITemplate | PartValue[] | PartValue,
  target?: Node
) {
  if (isPart(template)) {
    template = [template];
  }
  if (isIterable(template)) {
    
  }
  if (Array.isArray(template)) {
    template = html`${template.map(
      entry => isTemplate(entry) ? entry : defaultTemplateFn(entry)
    )}`;
  }
  if (!isTemplate(template)) {
    throw new RangeError();
  }
  if (!target) {
    target = document.body;
  }
  const instance = renderedTemplates.get(target);
  if (instance) {
    if (instance.key === (template as ITemplate).key) {
      instance.update((template as ITemplate).values);
    } else {
      (template as ITemplate).update();
      instance.replaceWith(template as ITemplate);
      renderedTemplates.set(target, template as ITemplate);
    }
  } else {
    const t = getIDomTarget(template as ITemplate) as PrivateTemplate;
    if (!t) {
      throw new RangeError();
    }
    if (target.hasChildNodes()) {
      const hydrated = t.hydrate(target);
      if (!hydrated) {
        const first = target.firstChild;
        let cursor: Optional<Node | null> = target.lastChild;
          while (cursor) {
            const next: Optional<Node | null> = cursor.previousSibling;
            target.removeChild(cursor);
            cursor = cursor !== first ? next : undefined;
          }
          t.appendTo(target);
      }
    } else {
      t.update();
      t.appendTo(target);
    }
    t.isAttached = true;
    renderedTemplates.set(target, template as ITemplate);  
  }
}

export function defaultKeyFn(item: any, index?: number): Key;
export function defaultKeyFn(index: number): Key {
  return index;
}

export function defaultTemplateFn(item: any): ITemplate {
  return html`${item}`;
}

const repeatCache = new Map<IPart, [Key[], Map<Key, ITemplate>]>();
export function repeat(
  items: Array<{}>,
  keyFn: typeof defaultKeyFn = defaultKeyFn,
  templateFn: typeof defaultTemplateFn = defaultTemplateFn
): Directive {
  return (part: IPart) => {
    let target = part.firstNode();
    const parent = target.parentNode;
    if (!parent) {
      throw new RangeError();
    }
    // const isSVG = part.isSVG;
    // might need for hydrate...
    // const attacher = partAttachers.get(part);

    const templates = items.map(item => {
      if (isTemplate(item)) {
        return item;
      }
      return templateFn(item);
    }) as ITemplate[];
    const keys = items.map((item, index) => keyFn(item, index));
    const [oldCacheOrder, oldCacheMap] = repeatCache.get(part) || [[], new Map<Key, ITemplate>()];
    const newCache = [keys, new Map<Key, ITemplate>()];
    const newCacheMap = newCache[1] as Map<Key, ITemplate>;
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
      let oldEntry = oldCacheMap.get(key);
      const nextTemplate = templates[index];
      if (oldEntry) {
        if (key === oldCacheOrder[index]) {
          // update in place
          if (oldEntry.key === nextTemplate.key) {
            oldEntry.update(nextTemplate.values);
          } else {
            //  maybe at some point think about diffing between templates?
            nextTemplate.update();
            nextTemplate.insertBefore(oldEntry);
            oldEntry.remove();
            oldCacheMap.set(key, nextTemplate);
          }
        } else {
          const targetEntry = oldCacheMap.get(oldCacheOrder[index]);
          if (!targetEntry) {
            throw new RangeError();
          }
          target = targetEntry.firstNode();
          const oldIndex = oldCacheOrder.indexOf(key);
          oldCacheOrder.splice(oldIndex, 1);
          oldCacheOrder.splice(index, 0, key);
          // const frag = oldEntry.remove();
          if (oldEntry.key === nextTemplate.key) {
            oldEntry.update(nextTemplate.values);
            // parent.insertBefore(frag, target);
          } else {
            nextTemplate.update();
            nextTemplate.insertBefore(target);
          }
        }
        return;
      }
      // add template to 
      const cursor = oldCacheOrder[index];
      oldEntry = oldCacheMap.get(cursor);
      const firstNode = part.firstNode();
      if (index === 0 && isPartComment(firstNode) && !cursor && !oldEntry) {
        nextTemplate.insertBefore(firstNode);
        parent.removeChild(firstNode);
        oldCacheOrder.push(key);
      } else {
        if (!oldEntry) {
          throw new RangeError();
        }
        nextTemplate.insertBefore(oldEntry);
        oldCacheOrder.splice(index, 0, key);
      }
      oldCacheMap.set(key, nextTemplate);
    });
  };
}

export function until(
  promise: Promise<PartValue>,
  defaultContent: PartValue
): Directive {
  return (part: IPart) => {
    part.update(defaultContent);
    promise.then(value => part.update(value));
  };
}
*/
