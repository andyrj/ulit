const SVG = "SVG";
const FOREIGN_OBJECT = "FOREIGNOBJECT";
const PART_START = "{{";
const PART_END = "}}";
const PART_MARKER = `${PART_START}${PART_END}`;
const TEMPLATE = "template";
const DIRECTIVE = "directive";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
// const DOCUMENT_FRAGMENT = 11;
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
  id: number;
  parts: IPart[];
  values: Optional<PartValue[]>;
};
export interface IPart extends IDomTarget {
  (value?: PartValue, index?: number, parent?: ITemplate): void;
  path: Array<string | number>;
  parent: ITemplate;
};
export interface IDirective {
  (part: IPart): void;
  kind: string;
}
export interface ITemplateGenerator {
  (values?: PartValue[]): ITemplate;
  id: number;
}
export type WalkFn = (
  parent: Node,
  element: Node | null | undefined,
  path: Array<string | number>
) => boolean;
export type KeyFn = (item: any, index?: number) => Key;
export type TemplateFn = (item: any) => ITemplateGenerator;
interface ISerialCacheEntry {
  template: HTMLTemplateElement;
  parts: IPart[];
}
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

function isDirective(x: any): x is IDirective {
  return isFunction(x) && x.kind === DIRECTIVE;
}

// function isDocumentFragment(x: any): x is DocumentFragment {
//   return isNode(x) && (x as Node).nodeType === DOCUMENT_FRAGMENT;
// }

function isComment(x: any): x is Comment {
  return isNode(x) && (x as Node).nodeType === COMMENT_NODE;
}

function isFunction(x: any): x is Function {
  return typeof x === "function";
}

function isString(x: any): x is string {
  return typeof x === "string";
}

// function isText(x: any): x is Text {
//   return x && isNode(x) && !!x.textContent;
// }

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

function generateTemplateElement(str: string) {
  const element = document.createElement(TEMPLATE);
  element.innerHTML = str;
  return element as HTMLTemplateElement;
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
    throw new RangeError();
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
      if (this.disposers.indexOf(handler) > -1) {
        return;
      }
      this.disposers.push(handler);
    };
    fn.dispose = function() {
      if (isPart(this)) {
        partParentCache.delete(this);
      } else if (isTemplate(this)) {
        // TODO: special dispose logic for Template.dispose()?
      }
      while (this.disposers.length > 0) {
        (this.disposers.pop() as IDisposer)();
      }
    };
    fn.firstNode = function() {
      if (isNode(this.start)) {
        return this.start;
      } else {
        return (this.start as IDomTarget).firstNode();
      }
    };
    fn.lastNode = function() {
      if (isNode(this.end)) {
        return this.end;
      } else {
        return (this.end as IDomTarget).lastNode();
      }
    };
    fn.remove = function(): Optional<DocumentFragment> {
      const fragment = document.createDocumentFragment();
      let cursor: Optional<Node> = this.firstNode();
      while (cursor != null) {
        const next: Node = cursor.nextSibling as Node;
        fragment.appendChild(cursor);
        cursor = cursor === this.end || !next ? undefined : next;
      }
      return fragment;
    }
    fn.removeDisposer = function(handler: IDisposer) {
      const index = this.disposers.indexOf(handler);
      if (index === -1) {
        return;
      }
      this.disposers.splice(index, 1);
    };
    BaseDomTarget = fn;
  }
  return BaseDomTarget;
}

function updateAttribute(part: IPart, value: Optional<PartValue>) {
  // TODO: implement
  if (isEventPart(part)) {

  }
}

function updateArray(part: IPart, value: Optional<PartValue[]>) {
  // TODO: implement
}

function updateTemplate(part: IPart, value: ITemplateGenerator) {
  // TODO: implement
}

function updateNode(part: IPart, value: Optional<PartValue>) {
  // TODO: either coerce to string, or update Node | DocumentFragment...
}

const partParentCache = new Map<IPart, ITemplate>();
function Part(path: Array<string | number>, start: Node, end: Node, index?: number, isSVG?: boolean) {
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
  Object.freeze((part as IPart).path);
  part.start = start;
  part.end = end;
  if (isSVG) {
    part.isSVG = true;
  }
  part.prototype = getBaseDomTarget();
  return part;
}

function templateSetup(parts: IPart[]): WalkFn {
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
            parts.push(Part(adjustedPath, newPartComment, newPartComment, parts.length, isSVG));
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
          parts.push(Part(walkPath.concat(attr.nodeName), element, attr, parts.length, isSVG));
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
  }
  template.id = id;
  template.parts = parts;
  template.values = values;
  return template;
}

const serialCache = new Map<number, ISerialCacheEntry>();
function createTemplateGenerator(id: number, strs: TemplateStringsArray): ITemplateGenerator {
  const markUp = strs.join(PART_MARKER);
  let foundSerial = true;
  const serial = serialCache.get(id) || function(){
    foundSerial = false;
    return {
      parts: [],
      template: generateTemplateElement(markUp)
    };
  }();
  const generator = (values: PartValue[]): ITemplate => {
    const { parts, template } = serial;
    if (!foundSerial) {
      walkDOM(template.content, undefined, templateSetup(parts));
      serialCache.set(id, serial);
    } else {

    }
    return Template(id, parts, values);
  }
  (generator as ITemplateGenerator).id = id;
  return generator as ITemplateGenerator;
}

const templateGeneratorCache = new Map<number, ITemplateGenerator>();
export function html(strs: TemplateStringsArray, ...exprs: PartValue[]): ITemplateGenerator {
  const id = getId(strs.toString());
  const generator = templateGeneratorCache.get(id);
  if (generator) {
    return generator;
  }
  const newGenerator = createTemplateGenerator(id, strs);
  templateGeneratorCache.set(id, newGenerator);
  return newGenerator;
}

export function defaultKeyFn(index: number): Key {
  return index;
}

export function defaultTemplateFn(item: PartValue): ITemplateGenerator {
  return html`${item}`;
}

// const renderedCache = new WeakMap<Node, ITemplate>();
export function render(
  view: PartValue | PartValue[] | Iterable<PartValue>,
  container: Optional<Node>
) {
  if (!container) {
    container = document.body;
  }
  if (!isTemplateGenerator(view)) {
    view = defaultTemplateFn(view as PartValue);
    if (!isTemplateGenerator(view)) {
      throw new Error();
    }
  }
  
  // TODO: finsish render function...
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
            throw new RangeError();
          }
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
