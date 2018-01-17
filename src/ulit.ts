const SVG_NS = "https://www.w3.org/2000/svg";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT = 11;
const templateCache = new Map<number, ITemplateCacheEntry>();
const idCache = new Map<string, number>();
const repeatCache = new Map<symbol, IRepeatCacheEntry>();
const walkPath: Array<number | string> = [];

type WalkFn = (
  parent: Node,
  element: Node | null | undefined
) => void;

interface ITemplateCacheEntry {
  template: HTMLTemplateElement;
  parts: IPart[];
}
export type Key = symbol | number | string;
interface IRepeatCacheEntry {
  map: Map<Key, number>;
  list: IPart[];
}
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
export type PartDispose = (part: IPart) => void;

export interface IDomTarget {
  getStart: () => Node | IDomTarget;
  firstNode: () => Node;
  getEnd: () => Node | IDomTarget | string;
  lastNode: () => Node;
  pull: () => DocumentFragment;
}

function isPart(x: any): boolean {
  return x && x.type && x.type === "part";
}

type Optional<T> = T | undefined;

export interface IPart extends IDomTarget {
  readonly id: symbol;
  readonly path: Array<number | string>;
  readonly isSVG: boolean;
  getValue: () => PartValue | null;
  addDisposer: (disposer: PartDispose) => void;
  removeDisposer: (disposer: PartDispose) => void;
  readonly type: string;
  update: (value: PartValue) => void;
};
function PullTarget(target: IPart | ITemplate): () => DocumentFragment {
  const start = target.getStart();
  const end = target.getEnd();
  const fragment = document.createDocumentFragment();
  if (typeof end !== "string") {
    let cursor: Optional<Node> = start as Node;
    while (cursor !== undefined) {
      const next: Node = cursor.nextSibling as Node;
      fragment.appendChild(cursor);
      cursor = (cursor === end || !next) ? undefined : next;
    }
  }
  return () => fragment;
}

export function defaultKeyFn(item: any, index?: number): Key;
export function defaultKeyFn(index: number): Key {
  return index;
}

export function defaultTemplateFn(item: any): ITemplate {
  return html`${item}`;
}

export function repeat(
  items: Array<{}>,
  keyFn: typeof defaultKeyFn = defaultKeyFn,
  templateFn: typeof defaultTemplateFn = defaultTemplateFn
): Directive {
  return (part: IPart) => {
    const target = part.getStart();
    const parent: Optional<Node> = (target as Node).parentNode || undefined;
    const id = part.id;
    const isSVG = part.isSVG;

    const normalized = items.map(item => {
      if (isTemplate(item)) {
        return item;
      }
      return templateFn(item);
    }) as ITemplate[];
    const keys = items.map((_, index) => keyFn(index));
    const cacheEntry = repeatCache.get(id);
    let map = new Map<Key, number>();
    let list: IPart[] = [];
    if (cacheEntry && cacheEntry.map && cacheEntry.list) {
      map = cacheEntry.map;
      list = cacheEntry.list;
    }
    let i = 0;
    if (target && (target as Node).nodeType === COMMENT_NODE) {
      const fragment = document.createDocumentFragment();
      const len = keys.length;
      for (; i < len; i++) {
        const key = keys[i];
        const node = document.createComment("{{}}");
        const newPart: IPart = Part([0, 0], node, node, isSVG);
        if (i === 0) {
          // TODO: need to reconsider logic here to instead use pull()...
          //start = newPart;
        } else if (i === len) {
          //end = newPart;
        }
        list.push(newPart);
        map.set(key, i);
        fragment.appendChild(node);
        render(normalized[i] as ITemplate, newPart);
      }
      repeatCache.set(id, { map, list });
      if (parent) {
        parent.replaceChild(fragment, target as Node);
      }
      return;
    }
    const normLen = normalized.length;
    const oldLen = list && list.length;
    const maxLen = Math.max(normLen, oldLen || 0);
    Object.keys(map).forEach(key => {
      if (keys.indexOf(key) === -1) {
        const oldIndex = map.get(key);
        if (oldIndex) {
          list[oldIndex].pull();
          list.splice(oldIndex, 1);
        }
        map.delete(key);
      }
    });
    for (i = 0; i < maxLen; i++) {
      const newTemplate = normalized[i];
      const newKey = keys[i];
      const oldIndex = map.get(newKey) || -1;
      const oldPart = oldIndex ? list[oldIndex] : undefined;
      if (oldPart && oldIndex === i) {
        // update existing in place
        oldPart.update(newTemplate);
      } else if (oldIndex > -1 && !parent) {
        // add new
        const p = list[oldIndex];
        const move = p.pull();
        p.update(newTemplate);
        const el = list[i].getStart();
        if (el && parent) {
          (parent as Node).insertBefore(move, el as Node);
          list.splice(oldIndex, 1);
          // TODO: clean up...
          // list.splice(i, 0, move.part);
        }
      } else {
        // move and update...
        const fragment = document.createDocumentFragment();
        const node = document.createComment("{{}}");
        fragment.appendChild(node);
        const newPart = Part([0, 0], node, node, false);
        render(newTemplate, newPart);
        const elEdge = list[i].getStart();
        if (elEdge && parent) {
          parent.insertBefore(fragment, elEdge as Node);
          list.splice(i, 0, newPart);
        }
      }
      // TODO: why did you have this?
      // parent && parent.removeChild(map[list[i]])
    }
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

function isFunction(x: any): boolean {
  return typeof x === "function";
}

function isString(x: any): boolean {
  return typeof x === "string";
}

function isNumber(x: any): boolean {
  return typeof x === "number";
}

function isUndef(x: any): boolean {
  return x === undefined;
}

function isNull(x: any): boolean {
  return x === null;
}

function followEdge(target: IDomTarget | Node, edge: "start" | "end"): Node {
  if (isNode(target)) {
    return target as Node;
  } else {
    const cond = edge === "start";
    const next = cond
      ? (target as IDomTarget).getStart()
      : (target as IDomTarget).getEnd();
    if (isPart(next) || isTemplate(next)) {
      return followEdge(next as IDomTarget, edge);
    } else if (isNode(next)) {
      return next as Node;
    } else if (isString(next)) {
      return (target as IDomTarget).getStart() as Node;
    } else {
      throw new RangeError();
    }
  }
}

type PartAttacher = (target: Node) => void;
const partDisposers = new Map<symbol, PartDispose[]>();
const partAttachers = new Map<symbol, PartAttacher>();
export function Part(
  path: Array<number | string>,
  initStart: Node,
  initEnd: Node | string,
  isSVG: boolean = false
): IPart {
  const disposers: PartDispose[] = [];
  let result: IPart;
  let start: Node | IDomTarget = initStart;
  let end: Node | IDomTarget | string = initEnd; 
  let last: Optional<PartValue>; 
  const updateArray = (part: IPart, value: PartValue[]) => {
    repeat(value)(part);
  }
  const updateNode = (part: IPart, value: PrimitivePart) => {
    const element = part.getStart() as Node;
    const parent = element.parentNode;
    if (!parent) {
      throw new RangeError("6");
    }
    const valueIsNumber = isNumber(value);
    const newVal = isNumber(value) ? value.toString() : value.toString();
    if (valueIsNumber || isString(value)) {
      if (element.nodeType !== TEXT_NODE) {
        const newEl = document.createTextNode(newVal);
        parent.insertBefore(newEl, element);
        part.pull();
        start = newEl;
        end = newEl;
      }
      if (element.nodeValue !== value) {
        (element as Text).nodeValue = newVal;
      }
    } else {
      const isFrag = (value as Node).nodeType === DOCUMENT_FRAGMENT;
      const newStart = isFrag ? (value as DocumentFragment).firstChild : value as Node;
      const newEnd = isFrag ? (value as DocumentFragment).lastChild : value as Node;
      parent.insertBefore(value as Node | DocumentFragment, element);
      part.pull();
      if (newStart && newEnd) {
        start = newStart;
        end = newEnd;
      } else {
        throw new RangeError();
      }
    }
  }
  const updateAttribute = (value: any) => {
    const element: Node = start as Node;
    const name = typeof end === "string" ? end : "";
    if (isFunction(value) || name in element) {
      (element as any)[name] = !value && value !== false ? "" : value
    } else if (value || value === false) {
      (element as HTMLElement).setAttribute(name, value)
    }
    if (!value || value !== false) {
      (element as HTMLElement).removeAttribute(name)
    }
  }

  const set = (value: PartValue) => {
    if (typeof end === "string") {
      updateAttribute(value);
    } else {
      if (
        typeof value !== "string" &&
        !Array.isArray(value) &&
        typeof (value as any)[Symbol.iterator] === "function"
      ) {
        value = Array.from(value as any);
      }
      if (isPromise(value)) {
        (value as Promise<PartValue>).then(promised => {
          set(promised);
        });
      } else if (isTemplate(value)) {
        // TODO: change this, instead here we should get part.getStart().__template.update(value.getValues()) or render template to a new
        //   DocumentFragment that should be replacing whatever is currently in dom, (insertBefore + pull)...
        render(value as ITemplate, result);
      } else if (Array.isArray(value)) {
        updateArray(result, value);
      } else {
        updateNode(result, value as Node | DocumentFragment);
      }
    }
  }
  
  result = {
    firstNode: () => followEdge(result, "start"),
    getEnd: () => end,
    getStart: () => start,
    getValue: () => last as PartValue,
    id: Symbol(),
    isSVG: isSVG || false,
    lastNode: () => followEdge(result, "end"),
    path,
    addDisposer(handler: PartDispose) {
      if (
        typeof handler === "function" &&
        disposers.indexOf(handler) === -1
      ) {
        disposers.push(handler);
      }
    },
    pull: () => PullTarget(result)(),
    removeDisposer(handler: PartDispose) {
      const index = disposers.indexOf(handler);
      if (index > -1) {
        disposers.splice(index, 1);
      }
    },
    type: "part",
    update(value?: PartValue) {
      if (value === undefined) {
        return;
      }
      set(value);
      last = value;
    }
  };
  partDisposers.set(result.id, disposers);
  partAttachers.set(result.id, (node: Node) => {
    if (!start || !end) {
      throw new RangeError("can't re-attach a part that has been initialized");
    }
    const target = followDOMPath(node, result.path);
    if (!target) {
      throw new RangeError();
    }
    if (Array.isArray(target)) {
      start = target[0];
      end = target[1];
    } else {
      start = end = target as Node;
    }
  });
  return Object.seal(result);
}

function isAttributePart(part: IPart): Node | IDomTarget | undefined {
  const start = part.getStart();
  const end = part.getEnd();
  if (typeof end === "string" && isNode(start)) {
    return start;
  }
  return;
}

function removeAttribute(element: Node, name: string, isSVG: boolean = false) {
  if (!element) {
    throw new RangeError();
  }
  if (isSVG) {
    (element as HTMLElement).removeAttributeNS(SVG_NS, name);
  } else {
    (element as HTMLElement).removeAttribute(name);
  }
}

function setAttribute(
  element: Node,
  name: string,
  value: any,
  isSVG: boolean = false
) {
  if (!element) {
    throw new RangeError();
  }
  if (isSVG) {
    (element as HTMLElement).setAttributeNS(SVG_NS, name, value);
  } else {
    (element as HTMLElement).setAttribute(name, value);
  }
}

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
  } else if (num && !isNaN(num as number)) {
    const el =
      node &&
      node.childNodes &&
      node.childNodes.length < num &&
      (node.childNodes as any)[num]
        ? node.childNodes[num as number]
        : undefined;
    return followDOMPath(el, cPath);
  } else {
    throw new RangeError("part path not found");
  }
}

function isDirective(part: IPart, expression: any) {
  const end = part.getEnd();
  if (isFunction(expression)) {
    if (isString(end) && (end as string).startsWith("on")) {
      return false;
    } else {
      return true;
    }
  } else {
    return false;
  }
}

function isNode(x: any): boolean {
  return x as Node && (x as Node).nodeType > 0;
}

function isDocumentFragment(x: any): boolean {
  return isNode(x) && (x as Node).nodeType === DOCUMENT_FRAGMENT;
}

function isComment(x: any) {
  return isNode(x) && (x as Node).nodeType === COMMENT_NODE;
}

function isPartComment(x: any | null | undefined): boolean {
  return isComment(x) && x.nodeValue === "{{}}";
}

function isPromise(x: any): boolean {
  return x && typeof x.then === "function";
}

function isTemplate(x: any): boolean {
  return x && x.type && x.type === "template";
}

export interface ITemplate extends IDomTarget {
  getValues: () => PartValue[] | undefined;
  readonly key: string;
  readonly type: string,
  update: (newValues?: PartValue[]) => void;
  dispose: () => void;
};
export function Template(
  key: string,
  template: HTMLTemplateElement,
  parts: IPart[],
  values: PartValue[]
): ITemplate {
  let result: ITemplate;
  let fragment: DocumentFragment;
  let last: PartValue[];
  let start: Node;
  let end: Node | string;
  result = {
    firstNode: () => followEdge(result, "start"),
    getEnd: () => end,
    getStart: () => start,
    getValues() {
      return last;
    },
    key,
    lastNode: () => followEdge(result, "end"),
    pull: () => PullTarget(result)(),
    type: "template",
    update(newValues: PartValue[] | null | undefined) {
      if (!newValues || newValues.length !== parts.length) {
        throw new RangeError("invalid number of new values for template");
      } 
      if (!fragment) {
        const t: HTMLTemplateElement = document.importNode(template, true);
        fragment = t.content;
        start = fragment.firstChild as Node;
        end = fragment.lastChild as Node; 
        parts.forEach(part => {
          const attacher = partAttachers.get(part.id);
          if (!attacher || !isFunction(attacher)) {
            throw new RangeError();
          }
          attacher(fragment as Node);
        });
      }
      last = !newValues ? values : newValues;
      if (last) {
        parts.forEach((part, i) => {
          part.update(last[i]);
        });
      }
    },
    dispose() {
      parts.forEach(part => {
        const disposers = partDisposers.get(part.id);
        if (disposers) {
          disposers.forEach(disposer => {
            disposer(part);
          });
        }
      });
    }
  };
  return Object.seal(result);
}

function generateId(str: string): number {
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
    child.nodeValue.startsWith("{{parts:")) as boolean;
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
  fn: WalkFn
) {
  if (element) {
    fn(parent, element);
  } else {
    element = parent;
  }
  if (element && element.childNodes.length > 0) {
    if (!element) {
      throw new RangeError("2");
    }
    [].forEach.call(element.childNodes, (child: Node, index: number) => {
      walkPath.push(index);
      walkDOM(element as HTMLElement, child, fn);
      walkPath.pop();
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
  return (parent, element) => {
    if (!element) {
      throw new RangeError("invalid <WalkFn> call with null element");
    }
    const nodeType = element && element.nodeType;
    if (nodeType === TEXT_NODE) {
      const isSVG = isSVGChild(element);
      const text = element && element.nodeValue;
      const split = text && text.split("{{}}");
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
            const newPartComment = document.createComment("{{}}");
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
        if (attr.nodeValue === "{{}}") {
          parts.push(Part(walkPath.concat(attr.nodeName), element, attr, isSVG));
        }
      });
    }
  };
}

export function html(
  strs: TemplateStringsArray,
  ...exprs: PartValue[]
) {
  const staticMarkUp = strs.toString();
  const id = idCache.get(staticMarkUp) || generateId(staticMarkUp);
  const cacheEntry = templateCache.get(id);
  const des = cacheEntry ? cacheEntry : checkForSerialized(id) as IDeserializedTemplate;
  let template = des && des.template;
  const parts = (des && des.parts) || [];
  if (!template) {
    template = document.createElement("template");
    template.innerHTML = strs.join("{{}}");
    walkDOM(template.content, undefined, templateSetup(parts));
    templateCache.set(id, { template, parts });
  }
  return Template(staticMarkUp, template, parts, exprs);
}

function getChildTemplate(
  target: HTMLElement | null | undefined
): ITemplate | undefined {
  if (!target) {
    return;
  }
  if (
    target.childNodes &&
    target.childNodes.length > 0 &&
    (target.childNodes[0] as any).__template
  ) {
    return (target.childNodes[0] as any).__template;
  }
  return;
}

// TODO: major re-write of render function...
export function render(
  template: ITemplate,
  target: Node | IPart = document.body
): void {
  if (!target) {
    throw new RangeError("invalid render target");
  }
  const part: Node | IPart | undefined =
    !(target as Node).nodeType ? target : undefined;
  const start = part && (part as IPart).getStart();
  const instance: ITemplate =
    (target as any).__template ||
    (start && (start as any).__template) ||
    getChildTemplate(target as HTMLElement);
  if (instance) {
    if (instance.key === template.key) {
      instance.update(template.getValues());
    } else {
      instance.dispose();
      // TODO: move this logic into Template class, maybe add an attach method
      /*
      const fragment = document.createDocumentFragment();
      const comment = document.createComment("{{}}");
      fragment.appendChild(comment);
      render(template, comment);
      const first = fragment.firstChild;
      template.start = first != null ? first : null;
      template.end = fragment.lastChild;
      (first as any).__template = template;
      */
      // END
      // re-write
      /*
      const parent = findParentNode(instance.getStart());
      if (parent) {
        parent.replaceChild(fragment, instance.getStart());
      }
      */
    }
    return;
  }
  if (!part && target) {
    const node = target;
    // TODO: fix here...  we should remove all children, in target
    //   create new comment node, and set templates target to the new node,
    //   and appendChild to target...
    /*
    template.start = template.end = target;
    if ((node as Node).childNodes.length > 0) {
      while ((node as Node).hasChildNodes) {
        const lastChild = (node as Node).lastChild;
        if (lastChild) {
          (node as Node).removeChild(lastChild);
        }
      }
    }
    if (template.fragment != null) {
      template.start = template.fragment.firstChild;
      template.end = template.fragment.lastChild;
      (template.fragment.firstChild as any).__template = template;
      (target as Node).appendChild(template.fragment);
    }
    */
  } else {
    if (!part) {
      throw new RangeError();
    }
    template.update();
    /* TODO: clean up use of private start/end etc...
    const start = findEdge(part, "start");
    const parent = start.parentNode;
    if (part != null) {
      const p: Part = part as Part;
      p.start = template.fragment.firstChild;
      p.end = template.fragment.lastChild;
      if (parent) {
        parent.replaceChild(template.fragment, start as Node);
        if (p.start != null) {
          (p.start as any).__template = template;
        }
      }
    }
    */
  }
}
