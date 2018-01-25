const SVG_NS = "https://www.w3.org/2000/svg";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT = 11;
const templateCache = new Map<number, ITemplateCacheEntry>();
const idCache = new Map<string, number>();
const repeatCache = new Map<IPart, IRepeatCacheEntry>();

type WalkFn = (
  parent: Node,
  element: Node | null | undefined,
  path: Array<string | number>
) => boolean;

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

type Optional<T> = T | undefined | null;

export interface IPart extends IDomTarget {
  readonly path: Array<number | string>;
  readonly isSVG: boolean;
  addDisposer: (disposer: PartDispose) => void;
  getValue: () => PartValue | null;
  removeDisposer: (disposer: PartDispose) => void;
  readonly type: string;
  update: (value: PartValue) => void;
};
function PullTarget(target: IPart | ITemplate): () => DocumentFragment {
  const start = target.getStart();
  const end = target.getEnd();
  const fragment = document.createDocumentFragment();
  if (!isString(end)) {
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
    const target = part.firstNode();
    const parent: Optional<Node> = (target as Node).parentNode;
    const isSVG = part.isSVG;

    const templates = items.map(item => {
      if (isTemplate(item)) {
        return item;
      }
      return templateFn(item);
    }) as ITemplate[];
    const keys = items.map((_, index) => keyFn(index));
    const cacheEntry = repeatCache.get(part);
    let map = new Map<Key, number>();
    let list: IPart[] = [];
    if (cacheEntry && cacheEntry.map && cacheEntry.list) {
      map = cacheEntry.map;
      list = cacheEntry.list;
    } 
    
    if (isComment(target) && map.size === 0 && list.length === 0) {
      const fragment = document.createDocumentFragment();
      for(let i = 0; i < keys.length; i++) {
        const newChild = document.createComment("");
        fragment.appendChild(newChild);
        map.set(keys[i], i);
        const newPart = Part([i], newChild, newChild, part.isSVG);
        list.push(newPart);
        newPart.update(templates[i]);
      }
      if (parent) {
        parent.replaceChild(fragment, target);
        repeatCache.set(part, { map, list });
        return;
      } else {
        throw new Error();
      }
    } else {

    }
    /*
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
        // render(newTemplate, newPart);
        const elEdge = list[i].getStart();
        if (elEdge && parent) {
          parent.insertBefore(fragment, elEdge as Node);
          list.splice(i, 0, newPart);
        }
      }
      // TODO: why did you have this?
      // parent && parent.removeChild(map[list[i]])
    }
    */
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
const partDisposers = new Map<IPart, PartDispose[]>();
const partAttachers = new Map<IPart, PartAttacher>();
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
      throw new RangeError();
    }
    const valueIsNumber = isNumber(value);
    if (valueIsNumber || isString(value)) {
      const strVal = valueIsNumber ? value as string : value.toString();
      if (element.nodeType !== TEXT_NODE) {
        const newEl = document.createTextNode(strVal);
        parent.insertBefore(newEl, element);
        part.pull();
        start = newEl;
        end = newEl;
      }
      if (element.nodeValue !== value) {
        (element as Text).nodeValue = strVal;
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
  };
  const updateTemplate = (part: IPart, template: ITemplate) => {
    if (isTemplate(last) && template.key === (last as ITemplate).key) {
      (last as ITemplate).update(template.getValues());
    } else {
      const newStart = template.firstNode();
      const newEnd = template.lastNode();
      template.insertBefore(part);
      part.pull();
      start = newStart;
      end = newEnd;
    }
  };
  const updateAttribute = (value: any) => {
    const element: Node = start as Node;
    const name: string = isString(end) ? end as string : "";
    if (isFunction(value) || name in element) {
      (element as any)[name] = !value && value !== false ? "" : value
    } else if (value || value === false) {
      if (isSVG) {
        (element as HTMLElement).setAttributeNS(SVG_NS, name, value);
      } else {
        (element as HTMLElement).setAttribute(name, value);
      }
    }
    if (!value || value !== false) {
      if (isSVG) {
        (element as HTMLElement).removeAttributeNS(SVG_NS, name);
      } else {
        (element as HTMLElement).removeAttribute(name);
      }
    }
  }

  const set = (value: PartValue) => {
    if (isDirectivePart(value)) {
      (value as Directive)(result);
      return;
    }
    if (isString(end)) {
      updateAttribute(value);
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
          set(promised);
        });
      } else if (isTemplate(value)) {
        updateTemplate(result, value as ITemplate);
      } else if (Array.isArray(value)) {
        updateArray(result, value);
      } else {
        updateNode(result, value as PrimitivePart);
      }
    }
  };
  
  result = {
    firstNode: () => followEdge(result, "start"),
    getEnd: () => end,
    getStart: () => start,
    getValue: () => last as PartValue,
    isSVG: isSVG || false,
    lastNode: () => followEdge(result, "end"),
    path,
    addDisposer(handler: PartDispose) {
      if (
        isFunction(handler) &&
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
  partDisposers.set(result, disposers);
  partAttachers.set(result, (node: Node) => {
    if (!start || !end) {
      throw new RangeError();
    }
    const target = followDOMPath(node, result.path);
    if (!target) {
      throw new RangeError();
    }

    if (Array.isArray(target)) {
      start = target[0];
      end = target[1];
    } else {
      start = target;
      if (isDocumentFragment(last)) {
        let newPath;
        walkDOM(node as HTMLElement | DocumentFragment, undefined, (parent, element, walkPath) => {
          if (element === (last as DocumentFragment).lastChild) {
            newPath = walkPath;
            return false;
          }
          return true;
        });
        if (newPath) {
          end = followDOMPath(node, result.path.concat(newPath)) as Node;
        } else {
          throw new RangeError();
        }
      } else if (isTemplate(last)) {
        end = (last as ITemplate).lastNode();
      } else {
        end = target;
      }
    }
  });
  return Object.seal(result);
}

// function isAttributePart(part: IPart): boolean {
//   const start = part.getStart();
//   const end = part.getEnd();
//   if (isString(end) && isNode(start)) {
//     return true;
//   }
//   return false;
// }

// function isEventPart(part: IPart): boolean {
//   const end = part.getEnd();
//   if (isAttributePart(part) && isString(end) && (end as string).startsWith("on")) {
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
    throw new RangeError();
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

// function isPartComment(x: any | null | undefined): boolean {
//   return isComment(x) && x.nodeValue === "{{}}";
// }

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
  append: (node: Node) => void;
  getValues: () => PartValue[] | undefined;
  hydrate: (target: Node) => void | never;
  insertBefore: (target: Node | IDomTarget) => void;
  readonly key: string;
  readonly type: string;
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
  let end: Node;
  const attachPart = (part: IPart, target: Node) => {
    const cursor = followDOMPath(target, part.path);
    if (!cursor) {
      throw new RangeError();
    }
    const attacher = partAttachers.get(part);
    if (!attacher || !isFunction(attacher)) {
      throw new RangeError();
    }
    attacher(isNode(cursor) ? cursor as Node : (cursor as [Node, string]) [0]);
  };
  result = {
    append: (node: Node) => {
      if (fragment) {
        throw new Error();
      }
      result.update();
      node.appendChild(fragment);
    },
    firstNode: () => followEdge(result, "start"),
    getEnd: () => end,
    getStart: () => start,
    getValues() {
      return last;
    },
    hydrate: (target: Node) => {
      if (fragment) {
        throw new Error();
      }
      result.update();
      try {
        parts.forEach(part => attachPart(part, target));
        const frag = fragment as DocumentFragment;
        if (frag) {
          while (frag.hasChildNodes) {
            frag.removeChild(frag.lastChild as Node);
          }
        }
      } catch(err) {
        throw err;
      }
    },
    insertBefore: (target: Node | IDomTarget) => {
      if (fragment) {
        throw new Error();
      }
      result.update();
      const t = isNode(target) ? target as Node : (target as IDomTarget).firstNode() as Node;
      const parent = t.parentNode;
      if (parent) {
        parent.insertBefore(t, fragment);
      } else {
        throw new Error();
      }
    },
    key,
    lastNode: () => followEdge(result, "end"),
    pull: () => PullTarget(result)(),
    type: "template",
    update(newValues: PartValue[] | null | undefined) {
      if (!newValues || newValues.length !== parts.length) {
        throw new RangeError();
      } 
      if (!fragment) {
        const t: HTMLTemplateElement = document.importNode(template, true);
        fragment = t.content;
        start = fragment.firstChild as Node;
        end = fragment.lastChild as Node; 
        parts.forEach(part => attachPart(part, fragment));
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
        const disposers = partDisposers.get(part);
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
    return true;
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

export function render(
  template: ITemplate,
  target?: Node
) {
  if (!target) {
    target = document.body;
  }
  const instance: ITemplate = (target as any).__template;
  if (instance) {
    if (instance.key === template.key) {
      instance.update(template.getValues());
    } else {
      template.insertBefore(instance.firstNode());
      instance.pull();
      (target as any).__template = template;
    }
  } else {
    if (target.hasChildNodes) {
      const hydrated = template.hydrate(target);
      const first = target.firstChild;
      if (!hydrated) {
        let cursor: Optional<Node | null> = target.lastChild;
        while (cursor) {
          const next: Optional<Node | null> = cursor.previousSibling;
          target.removeChild(cursor);
          cursor = cursor !== first ? next : undefined;
        }
        template.append(target);
      }
    } else {
      template.append(target);
    }
  }
}
