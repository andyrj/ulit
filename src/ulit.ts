const SVG = "SVG";
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
export type Optional<T> = T | undefined | null;
export type Key = symbol | string | number;
export interface IDomTarget {
  end: Optional<Node | IPart>;
  isSVG: boolean;
  start: Optional<Node | IPart>;
  firstNode: () => Node;
  lastNode: () => Node;
  remove: () => DocumentFragment;
}
export interface ITemplate extends IDomTarget {
  (values?: PartValue[]): void;
  element: Optional<HTMLTemplateElement>;
  id: number;
  parts: IPart[];
  values: Optional<PartValue[]>;
};
export interface IPart extends IDomTarget {
  (value?: PartValue, index?: number, parent?: ITemplate): void;
  path: Array<string | number>;
  parent: ITemplate;
  value: Optional<PartValue>;
};
export interface IDirective {
  (part: IPart): void;
  kind: string;
}
export interface ITemplateGenerator {
  (values?: PartValue[]): ITemplate;
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
};
export type PrimitivePart = string | Node | DocumentFragment;
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

function isTemplate(x: any): x is ITemplate {
  return isFunction(x) && x.id !== undefined;
}

// function isTemplateElement(x: any): x is HTMLTemplateElement {
//   return x && isNode(x) && x.nodeName === TEMPLATE;
// }

function isTemplateGenerator(x: any): x is ITemplateGenerator {
  return isFunction(x) && x.id;
}

function isPart(x: any): x is IPart {
  return x && x.path != null;
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

export type DirectiveFn = (part: IPart) => void;
export function Directive(fn: DirectiveFn): IDirective {
  (fn as any).kind = DIRECTIVE;
  return fn as IDirective;
}

let BaseDomTarget: IDomTarget;
function getBaseDomTarget() {
  if (!BaseDomTarget) {
    const fn: any = function() {}
    fn.disposers = [];
    fn.start = undefined;
    fn.end = undefined;
    fn.isSVG = false;
    fn.addDisposer = function(handler: IDisposer) {
      const disposers = this.disposers;
      if (disposers.indexOf(handler) > -1) {
        return;
      }
      disposers.push(handler);
    };
    fn.dispose = function() {
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
    };
    fn.firstNode = function() {
      const start = this.start;
      if (isNode(start)) {
        return start;
      } else {
        return (start as IDomTarget).firstNode();
      }
    };
    fn.lastNode = function() {
      const end = this.end;
      if (isNode(end)) {
        return end;
      } else {
        return (end as IDomTarget).lastNode();
      }
    };
    fn.remove = function(): Optional<DocumentFragment> {
      const fragment = document.createDocumentFragment();
      const end = this.lastNode();
      let cursor: Optional<Node> = this.firstNode();
      while (cursor != null) {
        const next: Node = cursor.nextSibling as Node;
        fragment.appendChild(cursor);
        cursor = cursor === end || !next ? undefined : next;
      }
      return fragment;
    }
    fn.removeDisposer = function(handler: IDisposer) {
      const disposers = this.disposers;
      const index = disposers.indexOf(handler);
      if (index === -1) {
        return;
      }
      disposers.splice(index, 1);
    };
    BaseDomTarget = fn;
  }
  return BaseDomTarget;
}

function updateAttribute(part: IPart, value: Optional<PartValue>) {
  // TODO: implement
  if (isEventPart(part) && isFunction(value)) {

  }
}

function updateArray(part: IPart, value: Optional<PartValue[]>) {
  // TODO: implement
  // call into repeat() to "emulate" unkeyed using index as key
  // in standard array/iterable we make no guarantee to nodes not being recreated
  // so index as key is fine...
}

function updateTemplate(part: IPart, value: ITemplateGenerator) {
  // TODO: implement
  // if part.value.id === value.id update in place
  // else insert new template above part and remove current...
}

function updateNode(part: IPart, value: Optional<PartValue>) {
  if (value == null) {
    value = document.createComment(`${PART_START}${PART_END}`);
  }
  const first = part.firstNode();
  const parent = first.parentNode;
  if (parent == null) {
    fail();
  }
  if (!isNode(value)) {
    if (!isString(value)) {
      if (isFunction((value as any).toString)) {
        value = (value as any).toString();
      }
      if (!isString(value)) {
        fail();
      }
    }
    if (isText(first)) {
      if (first.textContent !== value) {
        first.textContent = value as string;
      }
    } else {
      const newTextNode = document.createTextNode(value as string);
      (parent as Node).insertBefore(newTextNode, first); // working around fail(): never not propagating as expected...
      part.remove();
      part.start = newTextNode;
      part.end = newTextNode;
    }
  } else {
    const isFrag = isDocumentFragment(value);
    if (!isFrag && first === value) {
      return; // early return value is already present in dom no need to replace it...
    }
    const newStart = isFrag ? value.firstChild : first;
    const newEnd = isFrag ? value.lastChild : first;
    if (!newStart || !newEnd) {
      fail();
    }
    (parent as Node).insertBefore(value, first);
    part.remove();
    part.start = newStart;
    part.end = newEnd;
  }
}

const partParentCache = new Map<IPart, ITemplate>();
function Part(path: Array<string | number>, target: Node, index?: number, isSVG?: boolean) {
  const part: any = function(value?: PartValue) {
    if (!value) {
      value = part.value;
    }
    if (isDirective(value)) {
      (value as IDirective)(part);
      return;
    }
    if (isAttributePart(part)) {
      updateAttribute(part, value);
      part.value = value;
      return;
    }
    if (isIterable(value)) {
      value = Array.from(value as any);
    }
    if (Array.isArray(value)) {
      updateArray(part, value);
    }
    if (isPromise(value)) {
      (value as Promise<PartValue>).then(promised => {
        part(promised);
        part.value = promised;
      });
    }
    if (isTemplateGenerator(value)) {
      updateTemplate(part, value);
    } else {
      updateNode(part, value);
    }
  };
  (part as IPart).path = path.slice(0);
  part.value = target;
  part.start = target;
  part.end = target;
  if (isSVG) {
    part.isSVG = true;
  }
  part.prototype = getBaseDomTarget();
  return part;
}

function templateSetup(serial: ISerializedPart[], parts: IPart[]): WalkFn {
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
            parts.push(Part(adjustedPath, newPartComment, parts.length, isSVG));
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
            parts.push(Part(attrPath, element, parts.length, isSVG));
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

function Template(id: number, parts: IPart[], values: PartValue[]): ITemplate {
  const template: any = function(newValues?: PartValue[]) {
    newValues = newValues || template.values || values;
    const templateParts = template.parts as IPart[] || parts;
    templateParts.forEach((part, index) => {
      const newVal = newValues ? newValues[index] : undefined;
      part(newVal, template);
    });
  };
  template.id = id;
  template.parts = parts;
  template.values = values;
  template.element = undefined;
  template.prototype = getBaseDomTarget();
  return template;
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
  return; // satisifying typescript, can't be reached... ><
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
    return JSON.parse(value.split(SERIAL_PART_START)[1].slice(0, -2)) as ISerializedPart[];
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

const serialCache = new Map<number, ISerialCacheEntry>();
const templateGeneratorFactoryCache = new Map<number, ITemplateGeneratorFactory>();
type ITemplateGeneratorFactory = (exprs: PartValue[]) => ITemplateGenerator;
function getTemplateGeneratorFactory(id: number, strs: TemplateStringsArray): ITemplateGeneratorFactory {
  const cacheEntry = templateGeneratorFactoryCache.get(id);
  if (cacheEntry) {
    return cacheEntry;
  }
  const markUp = strs.join(PART_MARKER);
  const newTemplateGeneratorFactory: ITemplateGeneratorFactory = (exprs: PartValue[]) => {
    const newGenerator = (values: PartValue[]) => {
      let serial = serialCache.get(id) || getSerializedTemplate(id);
      let parts: IPart[] = [];
      if (serial == null) {
        const newTemplateEl = document.createElement(TEMPLATE);
        newTemplateEl.innerHTML = markUp;
        const fragment = newTemplateEl.content;
        serial = {
          serializedParts: [],
          template: newTemplateEl
        };
        walkDOM(fragment, undefined, templateSetup(serial.serializedParts, parts));
        serialCache.set(id, serial as ISerialCacheEntry);
        return Template(id, parts, values);
      } else {
        const fragment = serial.template.content;
        parts = serial.serializedParts.map((pair, index) => {
          const path = pair[0];
          const isSVG = pair[1];
          const target = followPath(fragment, path);
          const start = Array.isArray(target) ? target[0] : target;
          return Part(path, start as Node, index, isSVG);
        });
        return Template(id, parts, values);
      }
    };
    (newGenerator as ITemplateGenerator).id = id;
    (newGenerator as ITemplateGenerator).exprs = exprs;
    return newGenerator as ITemplateGenerator;
  }; 
  templateGeneratorFactoryCache.set(id, newTemplateGeneratorFactory);
  return newTemplateGeneratorFactory;
}

const templateGeneratorCache = new Map<number, ITemplateGenerator>();
export function html(strs: TemplateStringsArray, ...exprs: PartValue[]): ITemplateGenerator {
  const id = getId(strs.toString());
  const generator = templateGeneratorCache.get(id);
  if (generator) {
    return generator;
  }
  const factory = getTemplateGeneratorFactory(id, strs);
  const newGenerator = factory(exprs);
  templateGeneratorCache.set(id, newGenerator);
  return newGenerator;
}

export function defaultKeyFn(index: number): Key {
  return index;
}

export function defaultTemplateFn(item: PartValue): ITemplateGenerator {
  return html`${item}`;
}

const renderedCache = new WeakMap<Node, ITemplate>();
export function render(
  view: PartValue | PartValue[] | Iterable<PartValue>,
  container?: Optional<Node>
) {
  if (!container) {
    container = document.body;
  }
  if (!isTemplateGenerator(view)) {
    view = defaultTemplateFn(view as PartValue);
    if (!isTemplateGenerator(view)) {
      fail();
    }
  }
  // TODO: finsish render function...
  const instance = renderedCache.get(container);
  if (instance) {
    if (instance.id === view.id) {
      instance(view.exprs);
    } else {
      // replace instance with view
      const template = view();
      // TODO: think about best way to build the api from here...
      //  I want this to be lazy initialized...
    }
  } else {
    if (isPartComment(container)) {
      // replace comment with template
    } else if (isNode(container)){
      // otherwise take over all children for this template
      if (!container.hasChildNodes()) {
        // hydrate and if fails remove all children and append view
      }
      // empty so append view into container...
    }
  }
}

// TODO: re-write/cleanup repeat()...
const repeatCache = new Map<IPart, [Key[], Map<Key, ITemplate>]>();
export function repeat(
  items: Array<{}>,
  keyFn: KeyFn = defaultKeyFn,
  templateFn: TemplateFn = defaultTemplateFn
): IDirective {
  return Directive((part: IPart) => {
    let target = part.firstNode();
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
    }) as ITemplate[];
    const keys = items.map((item, index) => keyFn(item, index));
    const [oldCacheOrder, oldCacheMap] = repeatCache.get(part) || [
      [],
      new Map<Key, ITemplate>()
    ];
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
        // oldEntry.remove();
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
            // oldEntry.update(nextTemplate.values);
          } else {
            //  maybe at some point think about diffing between templates?
            // nextTemplate.update();
            // TODO: rewrite without helper methods...
            // nextTemplate.insertBefore(oldEntry);
            // oldEntry.remove();
            oldCacheMap.set(key, nextTemplate);
          }
        } else {
          const targetEntry = oldCacheMap.get(oldCacheOrder[index]);
          if (!targetEntry) {
            fail();
          } else {
            target = targetEntry.firstNode();
            const oldIndex = oldCacheOrder.indexOf(key);
            oldCacheOrder.splice(oldIndex, 1);
            oldCacheOrder.splice(index, 0, key);
            // const frag = oldEntry.remove();
            if (oldEntry.id === nextTemplate.id) {
              // oldEntry.update(nextTemplate.values);
              // parent.insertBefore(frag, target);
            } else {
              // nextTemplate.update();
              // TODO: rewrite without the dom helper methods...
              // nextTemplate.insertBefore(target);
            }
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
        if (!parent) {
          fail();
        } else {
          parent.removeChild(firstNode);
          oldCacheOrder.push(key);
        }
      } else {
        if (!oldEntry) {
          fail();
        } else {
          // TODO: rewrite without dom helpers...
          // nextTemplate.insertBefore(oldEntry);
          oldCacheOrder.splice(index, 0, key);
        }
      }
      oldCacheMap.set(key, nextTemplate);
    });
  });
}

export function until(
  promise: Promise<PartValue>,
  defaultContent: PartValue
): IDirective {
  return Directive((part: IPart) => {
    part(defaultContent);
    promise.then(value => part(value));
  });
}
