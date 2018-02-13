const SVG_NS = "https://www.w3.org/2000/svg";
const SVG = "SVG";
const FOREIGN_OBJECT = "FOREIGNOBJECT";
const EMPTY_STRING = "";
const PART_START = "{{";
const PART = "PART";
const PART_END = "}}";
const TEMPLATE = "TEMPLATE";
const TEMPLATE_GENERATOR = "TEMPLATE_GENERATOR";
const TEMPLATE_ID_START = "ULIT-";
const PART_MARKER = `${PART_START}${PART_END}`;
const SERIAL_PART_START = `${PART_START}${PART}S:`;
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT = 11;

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
  | ITemplateGenerator;
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

function isFunction(x: any): x is Function {
  return typeof x === "function";
}

function isString(x: any): x is string {
  return typeof x === "string";
}

function isText(x: any): x is Text {
  return x && isNode(x) && !!x.textContent;
}

function isNumber(x: any): x is number {
  return typeof x === "number";
}

function isNode(x: any): x is Node {
  return x as Node && (x as Node).nodeType > 0;
}

function isIterable(x: any): x is Iterable<any> {
  return !isString(x) &&
        !Array.isArray(x) &&
        isFunction((x as any)[Symbol.iterator]);
}

function isDirectivePart(x: any): x is Directive {
  return isFunction(x) && x.length === 1;
}

function isDocumentFragment(x: any) : x is DocumentFragment {
  return isNode(x) && (x as Node).nodeType === DOCUMENT_FRAGMENT;
}

function isComment(x: any): x is Comment {
  return isNode(x) && (x as Node).nodeType === COMMENT_NODE;
}

// function isPart(x: any): x is Part {
//   return x && x.kind === PART;
// }

// function isAttributePart(x: any) {
//   if (isPart(x) && x.attribute !== EMPTY_STRING && isNode(x.start)) {
//     return true;
//   }
//   return false;
// }

// function isEventPart(x: any) {
//   if (isAttributePart(x) && (x.attribute as string).startsWith("on")) {
//     return true;
//   }
//   return false;
// }

function isPartComment(x: any): boolean {
  return isComment(x) && x.textContent === PART_MARKER;
}

function isPromise(x: any): x is Promise<any> {
  return x && isFunction(x.then);
}

function isTemplate(x: any): x is Template {
  return x && x.kind === TEMPLATE;
}

function isTemplateElement(x: any): x is HTMLTemplateElement {
  return x && isNode(x) && x.nodeName === TEMPLATE;
}

function isTemplateGenerator(x: any): x is ITemplateGenerator {
  return x && x.kind === TEMPLATE_GENERATOR;
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
    public isSVG: boolean = false,
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
    return isNode(this.start) ? this.start : (this.start as DomTarget).firstNode();
  }
  public lastNode(): Node {
    if (isNode(this.end)) {
      return this.end;
    } else if(isString(this.end)){
      return isNode(this.start) ? this.start : (this.start as DomTarget).lastNode();
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
  public static kind = TEMPLATE;
  public fragment: Optional<DocumentFragment> = undefined;
  public parts: Part[] = [];
  constructor(public id: number, public templateElement: HTMLTemplateElement, public values: PartValue[]) {
    super();
  }

  public dispose() {
    if (isDocumentFragment(this.fragment)) {
      recoverFragment(this.fragment);
    }
    super.dispose();
  }

  public hydrate(template: Template) {
    this.update();
    try {
      this.parts.forEach(part => part.attachTo(template));
      const fragment = this.fragment;
      if (isDocumentFragment(fragment)) {
        while (fragment.hasChildNodes) {
          fragment.removeChild(fragment.lastChild as Node);
        }
      }
    } catch(err) {
      return false;
    }
    return true;
  }

  public update(values?: PartValue[]) {
    if (!this.fragment) {
      this.fragment = getFragment();
      const t: HTMLTemplateElement = document.importNode(this.templateElement, true);
      this.fragment = t.content;
      if (!this.fragment.firstChild || !this.fragment.lastChild) {
        throw new RangeError();
      }
      this.start = isComment(this.fragment.firstChild as Node) ? this.fragment.firstChild : this.parts[0];
      this.end = isComment(this.fragment.lastChild as Node) ? this.fragment.lastChild : this.parts[this.parts.length - 1]; 
      this.parts.forEach(part => {
        part.attachTo(this);
      });
    }
    this.values = !values ? this.values : values;
    if (this.values) {
      this.parts.forEach((part, i) => {
        part.update(this.values[i]);
      });
    }
  }
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
  const node = isTemplate(target) ? target.firstNode() : target;
  const cPath = pointer.slice(0);
  const current = cPath.shift() as string;
  const num = isString(current) ? parseInt(current, 10) : current;
  if (isString(current)) {
    return [node as Node, current];
  } else {
    if (
      node &&
      node.childNodes &&
      node.childNodes.length > num &&
      (node.childNodes as NodeList)[num]
    ) {
      const el = node.childNodes[num];
      return followPath(el, cPath);
    } else {
      throw new RangeError();
    }
  }
}

export class Part extends DomTarget {
  public static kind = PART;
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
    super(start, isString(end) ? undefined : end, isSVG, isString(end) ? end : EMPTY_STRING);
    Object.freeze(path);
    this.path = path;
  }
  public attachTo(container: Template) {
    this.parent = container;
    const target = followPath(container, this.path);
    if (!target) {
      throw new RangeError();
    }
    if (Array.isArray(target)) {
      this.start = target[0];
      this.end = undefined;
      this.attribute = target[1];
    } else if (isPartComment(target)) {
      this.start = target;
      this.end = target;
      this.attribute = EMPTY_STRING;
    } else {
      throw new RangeError();
    }
    this.isSVG = isNodeSVGChild(this.start);
    this.isAttached = true;
  }
  public update(value?: PartValue) {
    if (this.isAttached) {
      if (value !== this.value) {
        this.set(value);
      }
    }
    this.value = value;
  }

  public updateArray(value: PartValue[]) {
    repeat(value)(this);
  }
  
  public updateNode(value: PrimitivePart) {
    const element = this.firstNode();
    const parent = element.parentNode;
    if (!parent) {
      throw new RangeError();
    }
    if (isNumber(value)) {
      value = value.toString();
    }
    if (isString(value)) {
      if (element.nodeType !== TEXT_NODE) {
        const newEl = document.createTextNode(value);
        parent.insertBefore(newEl, element);
        this.remove();
        this.start = newEl;
        this.end = newEl;
      }
      if (isText(element) && element.textContent !== value) {
        element.textContent = value;
      }
    } else {
      const isFrag = isDocumentFragment(value as Node);
      const newStart = isFrag ? value.firstChild : value as Node;
      const newEnd = isFrag ? (value as DocumentFragment).lastChild : value as Node;
      parent.insertBefore(value as Node | DocumentFragment, element);
      this.remove();
      if (newStart && newEnd) {
        this.start = newStart;
        this.end = newEnd;
      } else {
        throw new RangeError();
      }
    }
  }

  public updateTemplate(generator: ITemplateGenerator) {
    // TODO: re-write below, referse if and else conditions... change to use ITemplateGenerator to get template...
    /*
    if (isTemplate(this.value) && template.id === (this.value as Template).id) {
      (this.value as Template).update(template.values);
    } else {
      template.update();
      // TODO: re-write below without helper methods...
      // _.replaceWith(template);
      // _.value = template;
    }
    */
  }

  public updateAttribute(value: any) {
    if (this.attribute === EMPTY_STRING || !isString(this.attribute)) {
      throw new RangeError();
    }
    const element: HTMLElement = this.start as HTMLElement;
    const name: Optional<string> = this.attribute; 
    if (!name) {
      throw new RangeError();
    }
    try {
      (element as any)[name] = !value && value !== false ? EMPTY_STRING : value;
    } catch (_) {} // eslint-disable-line
    if (!isFunction(value)) {
      if (!value && value !== false) {
        if (this.isSVG) {
          element.removeAttributeNS(SVG_NS, name);
        } else {
          element.removeAttribute(name);
        }
      } else {
        if (this.isSVG) {
          element.setAttributeNS(SVG_NS, name, value);
        } else {
          element.setAttribute(name, value);
        }
      }
    }
  }

  private set(value?: PartValue) {
    // TODO: write a new set implementation for coerced templates as only type of Part?
    if (!value && this.value) {
      value = this.value;
    }
    if (isDirectivePart(value)) {
      (value as Directive)(this as Part);
      return;
    }
    if (this.attribute !== EMPTY_STRING && isString(this.attribute)) {
      this.updateAttribute(value);
    } else {
      if (isIterable(value)) {
        value = Array.from(value as any);
      }
      if (isPromise(value)) {
        (value as Promise<PartValue>).then(promised => {
          this.set(promised);
        });
      } else if (isTemplateGenerator(value)) {
        this.updateTemplate(value);
      } else if (Array.isArray(value)) {
        this.updateArray(value);
      } else {
        this.updateNode(value as PrimitivePart);
      }
    }
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

export interface ITemplateGenerator {
  (): Template;
  kind: string;
}
const templateGeneratorCache = new Map<number, ITemplateGenerator>();
function createTemplateGenerator(
  strs: string[],
  exprs: PartValue[],
  id: number,
  template: HTMLTemplateElement,
  parts: Part[]
): ITemplateGenerator {
  const generator = () => {
    if (!template) {
      template = document.createElement(TEMPLATE) as HTMLTemplateElement;
      if (template == null) {
        throw new Error();
      }
      template.innerHTML = strs.join(PART_MARKER);
      walkDOM(template.content, undefined, templateSetup(parts as Part[]));
      serialCache.set(id, { template, parts });
    }
    return new Template(id, template as HTMLTemplateElement, exprs);
  }
  (generator as ITemplateGenerator).kind = TEMPLATE_GENERATOR;
  return generator as ITemplateGenerator;
};
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
  if (!isTemplateElement(template)) {
    throw new Error();
  }
  const newGenerator = createTemplateGenerator(strs, exprs, id, template, parts);
  newGenerator.kind = TEMPLATE_GENERATOR;
  templateGeneratorCache.set(id, newGenerator);
  return newGenerator;
}

// const renderedCache = new WeakMap<Node, Template>();
export function render(generator: ITemplateGenerator | ITemplateGenerator[], container?: Node, element?: Node) {
  // TODO: Templates on initial update should hydrate,
  // either the Template.fragment or the container.target render(TemplateGen, ParentNode, ChildNode?);
  // Could add custom hook for people to define their own default directives ordering...  ulit(options).html`...`
}
// TODO: remove the below old render() implementation...
// export function render(
//   template: ITemplate | PartValue[] | PartValue,
//   target?: Node
// ) {
//   if (isPart(template)) {
//     template = [template];
//   }
//   if (isIterable(template)) {
    
//   }
//   if (Array.isArray(template)) {
//     template = html`${template.map(
//       entry => isTemplate(entry) ? entry : defaultTemplateFn(entry)
//     )}`;
//   }
//   if (!isTemplate(template)) {
//     throw new RangeError();
//   }
//   if (!target) {
//     target = document.body;
//   }
//   const instance = renderedTemplates.get(target);
//   if (instance) {
//     if (instance.key === (template as ITemplate).key) {
//       instance.update((template as ITemplate).values);
//     } else {
//       (template as ITemplate).update();
//       instance.replaceWith(template as ITemplate);
//       renderedTemplates.set(target, template as ITemplate);
//     }
//   } else {
//     const t = getIDomTarget(template as ITemplate) as PrivateTemplate;
//     if (!t) {
//       throw new RangeError();
//     }
//     if (target.hasChildNodes()) {
//       const hydrated = t.hydrate(target);
//       if (!hydrated) {
//         const first = target.firstChild;
//         let cursor: Optional<Node | null> = target.lastChild;
//           while (cursor) {
//             const next: Optional<Node | null> = cursor.previousSibling;
//             target.removeChild(cursor);
//             cursor = cursor !== first ? next : undefined;
//           }
//           t.appendTo(target);
//       }
//     } else {
//       t.update();
//       t.appendTo(target);
//     }
//     t.isAttached = true;
//     renderedTemplates.set(target, template as ITemplate);  
//   }
// }

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
  value?: string
): Part[] {
  if (!value) {
    return [];
  } else {
    return JSON.parse(value.split(SERIAL_PART_START)[1].slice(0, -2)) as Part[];
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
  let deserialized: Optional<ISerialCacheEntry> = undefined;
  if (isFirstSerial) {
    const fc = fragment.removeChild(first);
    const parts = parseSerializedParts(fc.nodeValue || undefined);
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

export type TemplateFn = (item: {}) => ITemplateGenerator;
function defaultTemplateFn(item: {}): ITemplateGenerator {
  // @ts-ignore
  return html`${item}`;
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
