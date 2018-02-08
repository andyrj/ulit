const SVG_NS = "https://www.w3.org/2000/svg";
const PART_START="{{";
const PART_END="}}";
const PART_MARKER=`${PART_START}${PART_END}`;
const SERIAL_PART_START=`${PART_START}parts:`;
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT = 11;
const serialCache = new Map<number, ISerialCacheEntry>();
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
  remove: () => void;
  removeDisposer: (handler: IDomTargetDispose) => void;
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

const iDomTargetCache = new Map<IDomTarget, PrivatePart | PrivateTemplate>();
class DomTarget {
  public isAttached: boolean = false;
  public fragment: DocumentFragment;
  public isSVG: boolean = false;
  public disposers: IDomTargetDispose[] = [];
  constructor(
    public start: Node | DomTarget,
    public end: Node | DomTarget | string, 
  ) {
    this.fragment = getFragment();
  }
  
  public addDisposer(handler: IDomTargetDispose) {
    if (
      isFunction(handler) &&
      this.disposers.indexOf(handler) === -1
    ) {
      this.disposers.push(handler);
    }
  }

  public removeDisposer(handler: IDomTargetDispose) {
    const index = this.disposers.indexOf(handler);
      if (index > -1) {
        this.disposers.splice(index, 1);
      }
  }

  public firstNode(): Node {
    return followEdge(this, "start");
  }
  public lastNode(): Node {
    return followEdge(this, "end");
  }

  public appendTo(parent: Node) {
    const _ = iDomTargetCache.get(this as IDomTarget) || this;
    if (this.isAttached) {
      this.remove();
    }
    parent.appendChild(this.fragment);
    _.isAttached = true;
  }

  public insertAfter(target: DomTarget | Node) {
    const _ = iDomTargetCache.get(this as IDomTarget) || this;
    if (this.isAttached) {
      this.remove();
    }
    if (!this.fragment || !this.fragment.hasChildNodes()) {
      return;
    }
    const t = isNode(target) ? target as Node : (target as DomTarget).lastNode() as Node;
    const next = t.nextSibling;
    const parent = t.parentNode;
    if (!parent) {
      throw new Error();
    }
    if (!next) {
      this.appendTo(parent);
    } else if (next){
      this.insertBefore(next);
    }
    _.isAttached = true;
  }
  public insertBefore(target: DomTarget | Node) {
    const _ = iDomTargetCache.get(this as IDomTarget) || this;
    if (this.isAttached) {
      this.remove();
    }
    if (!this.fragment || !this.fragment.hasChildNodes()) {
      return;
    }
    const t = isNode(target) ? target as Node : (target as DomTarget).firstNode() as Node;
    const parent = t.parentNode;
    if (parent) {
      parent.insertBefore(t, this.fragment);
    } else {
      throw new Error();
    }
    _.isAttached = true;
  }

  public remove() {
    const _ = iDomTargetCache.get(this as IDomTarget) || this;
    if (!this.isAttached) {
      return;
    }
    let cursor: Optional<Node> = this.firstNode();
    while (cursor !== undefined) {
      const next: Node = cursor.nextSibling as Node;
      this.fragment.appendChild(cursor);
      cursor = (cursor === this.end || !next) ? undefined : next;
    }
    _.isAttached = false;
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

function followEdge(target: DomTarget | Node, edge: "start" | "end"): Node {
  if (isNode(target)) {
    return target as Node;
  } else {
    const cond = edge === "start";
    const next = cond
      ? (target as DomTarget).start
      : (target as DomTarget).end;
    if (isPart(next) || isTemplate(next)) {
      return followEdge(next as DomTarget, edge);
    } else if (isNode(next)) {
      return next as Node;
    } else if (isString(next)) {
      return (target as DomTarget).start as Node;
    } else {
      throw new RangeError();
    }
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
  update: (value: PartValue) => void;
  readonly value: Optional<PartValue>;
};

const PartRO: string[] = DomTargetRO.concat([
  "path",
  "value"
]);
const PartHide: string[] = DomTargetHide.concat([
  "attach",
  "proxy",
  "updateArray",
  "updateNode",
  "updateTemplate",
  "updateAttribute"
]);

class PrivatePart extends DomTarget {
  public value: PartValue;
  public proxy: IPart;
  constructor(
    public path: Array<string | number>,
    public start: Node | DomTarget,
    public end: Node | DomTarget | string,
    public isSVG: boolean = false
  ) {
    super(start, end);
    if (!isNode(start)) {
      throw new Error();
    }
    if (isString(end)) { 
      this.value = isString(end) ? "" : start as Node;
    }
  }
  public attach(node: Node) {
    const _ = iDomTargetCache.get(this as IDomTarget) as PrivatePart || this;
    const target = followDOMPath(node, this.path);
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
    const _ = iDomTargetCache.get(this as IDomTarget) as PrivatePart || this;
    if (_.disposers.length > 0) {
      _.disposers.forEach(disposer => disposer(_.proxy));
    }
  }

  public updateArray(value: PartValue[]) {
    const _ = iDomTargetCache.get(this as IDomTarget) as PrivatePart || this;
    repeat(value)(_.proxy);
  }
  
  public updateNode(value: PrimitivePart) {
    const _ = iDomTargetCache.get(this as IDomTarget) as PrivatePart || this;
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
      if (element.nodeValue !== value) {
        (element as Text).nodeValue = strVal;
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
  }

  public updateTemplate(template: ITemplate) {
    const _ = iDomTargetCache.get(this as IDomTarget) as PrivatePart || this;
    if (isTemplate(_.value) && template.key === (_.value as ITemplate).key) {
      (_.value as ITemplate).update(template.values);
    } else {
      const newStart = template.firstNode();
      const newEnd = template.lastNode();
      template.insertBefore(_.firstNode());
      _.remove();
      _.start = newStart;
      _.end = newEnd;
    }
  }

  public updateAttribute(value: any) {
    const _ = iDomTargetCache.get(this as IDomTarget) as PrivatePart || this;
    const element: Node = _.start as Node;
    const name: string = isString(_.end) ? _.end as string : "";
    if (isFunction(value) || name in element) {
      (element as any)[name] = !value && value !== false ? "" : value
    } else if (value || value === false) {
      if (_.isSVG) {
        (element as HTMLElement).setAttributeNS(SVG_NS, name, value);
      } else {
        (element as HTMLElement).setAttribute(name, value);
      }
    }
    if (!value || value !== false) {
      if (_.isSVG) {
        (element as HTMLElement).removeAttributeNS(SVG_NS, name);
      } else {
        (element as HTMLElement).removeAttribute(name);
      }
    }
  }

  public update(value: PartValue) {
    const _ = iDomTargetCache.get(this as IDomTarget) as PrivatePart || this;
    if (isDirectivePart(value)) {
      (value as Directive)(_.proxy);
      return;
    }
    if (isString(_.end)) {
      _.updateAttribute(value);
    } else {
      if (
        !isString(value) &&
        !Array.isArray(value) &&
        isFunction((value as any)[Symbol.iterator])
      ) {
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
  part.proxy = proxy;
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

let defaultNode: Node;
function getDefaultNode() {
  if (!defaultNode) {
    defaultNode = document.createComment(PART_MARKER);
  } 
  return defaultNode;
};

export interface ITemplate extends IDomTarget {
  dispose: () => void;
  readonly key: string;
  readonly parts: IPart[];
  update: (newValues?: PartValue[]) => void;
  readonly values: PartValue[];
};
const TemplateRO: string[] = DomTargetRO.concat([
  "key",
  "parts",
  "values"
]);
const TemplateHide: string[] = [
  "hydrate",
  "render",
  "proxy"
];

class PrivateTemplate extends DomTarget {
  public initialized: boolean = false;
  public proxy: ITemplate;
  public disposers: IDomTargetDispose[] = [];
  constructor(
    public key: string,
    public template: HTMLTemplateElement,
    public parts: IPart[],
    public values: PartValue[]
  ) {
    super(defaultNode || getDefaultNode(), defaultNode);
    // TODO: finsih writing code to move from old functional setup...
    
  }
  
  public hydrate(target: Node): void | never {
    const _ = iDomTargetCache.get(this as IDomTarget) as PrivateTemplate;
    if (this.fragment) {
      throw new Error(); // only hydrate newly created Templates...
    }
    this.update();
    try {
      this.parts.forEach(part => {
        const p = iDomTargetCache.get(part as IDomTarget) as PrivatePart;
        if (!p) {
          throw new RangeError();
        }
        p.attach(target);
      });
      const frag = this.fragment as DocumentFragment;
      if (frag) {
        while (frag.hasChildNodes) {
          frag.removeChild(frag.lastChild as Node);
        }
      }
    } catch(err) {
      throw err;
    }
  };

  public render(target: Node) {
    const _: PrivateTemplate = iDomTargetCache.get(this as IDomTarget) as PrivateTemplate || this;
    if (_.isAttached) {
      return;
    }
    if (target.hasChildNodes()) {
      const hydrated = _.hydrate(target);
      const first = target.firstChild;
      if(!hydrated) {
        let cursor: Optional<Node | null> = target.lastChild;
        while (cursor) {
          const next: Optional<Node | null> = cursor.previousSibling;
          target.removeChild(cursor);
          cursor = cursor !== first ? next : undefined;
        }
        _.appendTo(target);    
      }
    } else {
      _.update();
      _.appendTo(target);
    }
    _.isAttached = true;
  }

  public dispose() {
    const _ = iDomTargetCache.get(this as IDomTarget) as PrivateTemplate || this;
    _.parts.forEach(part => {
      const p = iDomTargetCache.get(part);
      if (!p) {
        throw new RangeError();
      }
      p.dispose();
    });
    if (_.disposers.length > 0) {
      _.disposers.forEach(disposer => {
        disposer(_.proxy);
      });
    }
  }

  public update(values?: PartValue[]) { 
    const _ = iDomTargetCache.get(this as IDomTarget) as PrivateTemplate || this;
    if (!_.initialized) {
      const t: HTMLTemplateElement = document.importNode(_.template, true);
      _.fragment = t.content;
      _.start = _.fragment.firstChild as Node;
      _.end = _.fragment.lastChild as Node; 
      _.parts.forEach(part => {
        const p = iDomTargetCache.get(part) as PrivatePart;
        if (!p) {
          throw new RangeError();
        }
        p.attach(this.fragment);
      });
    }
    _.values = !values ? _.values : values;
    if (_.values) {
      _.parts.forEach((part, i) => {
        part.update(_.values[i]);
      });
    }
  }
}

export function Template(key: string, tempEl: HTMLTemplateElement, parts: IPart[], values: PartValue[]) {
  const template = new PrivateTemplate(key, tempEl, parts, values);
  const proxy = createAPIProxy(TemplateHide, TemplateRO, template);
  iDomTargetCache.set(proxy, template);
  template.proxy = proxy;
  return proxy as ITemplate;
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
  const frag = (el.cloneNode(true) as HTMLTemplateElement).content;
  if (!frag) {
    return;
  }
  const first = frag.firstChild;
  if (!first) {
    return;
  }
  const isFirstSerial = isFirstChildSerial(frag);
  let deserialized: IDeserializedTemplate | null | undefined;
  if (isFirstSerial) {
    const fc = frag.removeChild(first);
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
  const des = cacheEntry ? cacheEntry : checkForSerialized(id) as IDeserializedTemplate;
  let template = des && des.template;
  const parts = (des && des.parts) || [];
  if (!template) {
    template = document.createElement("template");
    template.innerHTML = strs.join(PART_MARKER);
    walkDOM(template.content, undefined, templateSetup(parts));
    serialCache.set(id, { template, parts });
  }
  return Template(staticMarkUp, template, parts, exprs);
}

const renderedTemplates = new Map<Node, ITemplate>();
export function render(
  template: ITemplate,
  target?: Node
) {
  if (!target) {
    target = document.body;
  }
  const instance = renderedTemplates.get(target);
  if (instance) {
    if (instance.key === template.key) {
      instance.update(template.values);
    } else {
      template.insertBefore(instance);
      instance.remove();
      renderedTemplates.set(target, template);
    }
  } else {
    const t = iDomTargetCache.get(template) as PrivateTemplate;
    if (!t) {
      throw new RangeError();
    }
    t.render(target);
    renderedTemplates.set(target, template);
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
          const frag = oldEntry.remove();
          if (oldEntry.key === nextTemplate.key) {
            oldEntry.update(nextTemplate.values);
            parent.insertBefore(frag, target);
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
