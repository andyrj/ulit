const SVG_NS = "https://www.w3.org/2000/svg";
const PART_MARKER="{{}}";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT = 11;
const templateCache = new Map<number, ITemplateCacheEntry>();
const idCache = new Map<string, number>();
const repeatCache = new Map<IPart, [Key[], Map<Key, ITemplate>]>();

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
  end: Node | IDomTarget | string;
  firstNode: () => Node;
  lastNode: () => Node;
  pull: () => DocumentFragment;
  start: Node | IDomTarget;
}

function isPart(x: any): boolean {
  return x && x.type && x.type === "part";
}

export type Optional<T> = T | undefined | null;

function PullTarget(target: IPart | ITemplate): () => DocumentFragment {
  const start = target.start;
  const end = target.end;
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
    let target = part.firstNode();
    const parent: Optional<Node> = (target as Node).parentNode;
    const isSVG = part.isSVG;
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
        oldEntry.pull();
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
            oldEntry.pull();
            oldCacheMap.set(key, nextTemplate);
          }
        } else {
          const targetEntry = oldCacheMap.get(oldCacheOrder[index]);
          if (!targetEntry) {
            throw new RangeError();
          }
          target = targetEntry.firstNode();
          // mutate oldCacheOrder to match move
          const oldIndex = oldCacheOrder.indexOf(key);
          oldCacheOrder.splice(oldIndex, 1);
          oldCacheOrder.splice(index, 0, key);
          // pull oldEntry from dom and update before moving to correct location
          // TODO: change insertBefore/insertAfter/append/replace, to check if IDomTarget is attached
          //  and pull IDomTarget as needed...
          // const frag = oldEntry.pull();
          if (oldEntry.key === nextTemplate.key) {
            oldEntry.update(nextTemplate.values);
            oldEntry.insertBefore(target);
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
        // TODO: build replace out of pull and insert...
        nextTemplate.replace(firstNode);
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
      ? (target as IDomTarget).start
      : (target as IDomTarget).end;
    if (isPart(next) || isTemplate(next)) {
      return followEdge(next as IDomTarget, edge);
    } else if (isNode(next)) {
      return next as Node;
    } else if (isString(next)) {
      return (target as IDomTarget).start as Node;
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

interface Part extends IDomTarget {
  addDisposer: (disposer: PartDispose) => void;
  attach: (node: Node) => void;
  disposers: PartDispose[];
  isSVG: boolean;
  path: Array<number | string>;
  removeDisposer: (disposer: PartDispose) => void;
  type: string;
  update: (value: PartValue) => void;
  value: Optional<PartValue>;
};

export interface IPart extends IDomTarget {
  addDisposer: (disposer: PartDispose) => void;
  readonly end: Node | IDomTarget | string;
  readonly isSVG: boolean;
  readonly path: Array<number | string>;
  readonly start: Node | IDomTarget;
  removeDisposer: (disposer: PartDispose) => void;
  readonly type: string;
  update: (value: PartValue) => void;
  readonly value: Optional<PartValue>;
};

const PartRO: string[] = [
  "end",
  "isSVG",
  "path",
  "start",
  "type",
  "value"
];
const PartHide: string[] = [
  "attach",
  "disposers"
]; 

const iPartCache = new Map<IPart, Part>();
export function Part(
  path: Array<number | string>,
  initStart: Node,
  initEnd: Node | string,
  isSVG: boolean = false
): IPart {
  const disposers: PartDispose[] = [];
  let result: Part;
  let start: Node | IDomTarget = initStart;
  let end: Node | IDomTarget | string = initEnd; 
  let last: Optional<PartValue>; 
  const updateArray = (part: IPart, value: PartValue[]) => {
    repeat(value)(part);
  }
  const updateNode = (part: IPart, value: PrimitivePart) => {
    const element = part.start as Node;
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
      (last as ITemplate).update(template.values);
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
    addDisposer(handler: PartDispose) {
      if (
        isFunction(handler) &&
        disposers.indexOf(handler) === -1
      ) {
        disposers.push(handler);
      }
    },
    disposers,
    end,
    firstNode: () => followEdge(result, "start"),
    isSVG: isSVG || false,
    lastNode: () => followEdge(result, "end"),
    path,
    pull: () => PullTarget(result)(),
    removeDisposer(handler: PartDispose) {
      const index = disposers.indexOf(handler);
      if (index > -1) {
        disposers.splice(index, 1);
      }
    },
    start,
    type: "part",
    update(value: PartValue) {
      set(value);
      last = value;
    },
    value: last,
    attach(node: Node) {
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
    }
  };
  Object.seal(result);
  const proxy = createAPIProxy(PartHide, PartRO, result);
  iPartCache.set(proxy, result);
  return proxy;
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
    defaultNode = document.createComment("{{}}");
  } 
  return defaultNode;
};

interface Template extends IDomTarget {
  dispose: () => void;
  hydrate: (target: Node) => void | never;
  insertAfter: (target: Node | IDomTarget) => void;
  insertBefore: (target: Node | IDomTarget) => void;
  key: string;
  parts: IPart[];
  render: (target: Node) => void;
  type: string;
  update: (newValues?: PartValue[]) => void;
  values: PartValue[];
};
export interface ITemplate extends IDomTarget {
  dispose: () => void;
  readonly end: Node | IDomTarget | string;
  insertAfter: (target: Node | IDomTarget) => void;
  insertBefore: (target: Node | IDomTarget) => void;
  readonly key: string;
  readonly parts: IPart[];
  render: (target: Node) => void;
  readonly start: Node | IDomTarget;
  readonly type: string;
  update: (newValues?: PartValue[]) => void;
  readonly values: PartValue[];
};
const TemplateRO: string[] = [
  "end",
  "key",
  "parts",
  "start",
  "type",
  "values"
];
const TemplateHide: string[] = [
  "dispose",
  "hydrate",
  ""
];
const iTemplateCache = new Map<ITemplate, Template>();
export function Template(
  key: string,
  template: HTMLTemplateElement,
  parts: IPart[],
  values: PartValue[]
): ITemplate {
  let result: Template;
  let fragment: DocumentFragment;
  let last: PartValue[] = [];
  let start: Node = getDefaultNode();
  let end: Node = getDefaultNode();
  const attachPart = (part: IPart, target: Node) => {
    const p = iPartCache.get(part);
    if (!p) {
      throw new RangeError();
    }
    const cursor = followDOMPath(target, p.path);
    if (!cursor) {
      throw new RangeError();
    }
    p.attach(isNode(cursor) ? cursor as Node : (cursor as [Node, string]) [0]);
  };
  result = {
    /*
    appendTo: (node: Node) => {
      if (fragment && !fragment.hasChildNodes()) {
        node.appendChild(fragment);
      }
    },*/
    end,
    firstNode: () => followEdge(result, "start"),
    hydrate: (target: Node) => {
      if (fragment) {
        throw new Error(); // only hydrate newly created Templates...
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
    insertAfter: (target: Node | IDomTarget) => {
      if (!fragment || !fragment.hasChildNodes()) {
        return;
      }
      const t = isNode(target) ? target as Node : (target as IDomTarget).lastNode() as Node;
      const next = t.nextSibling;
      const parent = t.parentNode;
      if (!parent) {
        throw new Error();
      }
      if (!next) {
        result.render(parent);
      } else if (next){
        result.insertBefore(next);
      }
    },
    insertBefore: (target: Node | IDomTarget) => {
      if (!fragment || !fragment.hasChildNodes()) {
        return;
      }
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
    parts,
    pull: () => PullTarget(result)(),
    render: (target: Node) => {
      // TODO: implement render...
    },
    start,
    type: "template",
    values: last,
    update(newValues: PartValue[] | null | undefined) {
      // if (!newValues || newValues.length !== parts.length) {
      //   throw new RangeError();
      // } 
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
        const p = iPartCache.get(part);
        if (!p) {
          throw new RangeError();
        }
        const disposers = p.disposers;
        if (disposers) {
          disposers.forEach(disposer => {
            disposer(part);
          });
        }
      });
    }
  };
  Object.seal(result);
  const proxy = createAPIProxy(TemplateHide, TemplateRO, result);
  iTemplateCache.set(proxy, result);
  return proxy as ITemplate;
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
  const id = idCache.get(staticMarkUp) || generateId(staticMarkUp);
  const cacheEntry = templateCache.get(id);
  const des = cacheEntry ? cacheEntry : checkForSerialized(id) as IDeserializedTemplate;
  let template = des && des.template;
  const parts = (des && des.parts) || [];
  if (!template) {
    template = document.createElement("template");
    template.innerHTML = strs.join(PART_MARKER);
    walkDOM(template.content, undefined, templateSetup(parts));
    templateCache.set(id, { template, parts });
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
      instance.pull();
      renderedTemplates.set(target, template);
    }
  } else {
    const t = iTemplateCache.get(template);
    if (!t) {
      throw new RangeError();
    }
    t.render(target);
    /*
    if (target.hasChildNodes()) {
      const hydrated = template.hydrate(target);
      const first = target.firstChild;
      if (!hydrated) {
        let cursor: Optional<Node | null> = target.lastChild;
        while (cursor) {
          const next: Optional<Node | null> = cursor.previousSibling;
          target.removeChild(cursor);
          cursor = cursor !== first ? next : undefined;
        }
        template.appendTo(target);
      }
    } else {
      template.update();
      template.appendTo(target);
    }
    */
    renderedTemplates.set(target, template);
  }
}
