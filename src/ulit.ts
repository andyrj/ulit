const SVG_NS = "https://www.w3.org/2000/svg";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT = 11;
const templateCache = new Map<number, ITemplateCacheEntry>();
const idCache = new Map<string, number>();
const repeatCache = new Map<symbol, IRepeatCacheEntry>();
const walkPath: Array<number | string> = [];

type WalkFn = (parent: Node, element: Node | null | undefined) => void;

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
export type PartValue =
  | string
  | number
  | Node
  | DocumentFragment
  | Directive
  | ITemplate
  | IPartPromise
  | IPartArray;
export interface IPartPromise extends Promise<PartValue> {};
export interface IPartArray extends Array<PartValue> {};
export type EdgeTypes = "start" | "end";
export type Edge = StartEdge | EndEdge;
export type StartEdge = Node | IPart | null | undefined;
export type EndEdge = StartEdge | string;
export type PartDispose = (part: IPart) => void;

//   private updateTextNode(part: Part, value: any) {
//     const element = findEdge(part, "start") as HTMLElement;
//     const parent = element && element.parentNode;
//     if (part.start !== part.end) {
//       // TODO: refactor this logic to use pull()...
//       // part.target.flush();
//     }
//     if (element == null) {
//       // console.log(part, value);
//       throw new RangeError();
//     }
//     if (element.nodeType === TEXT_NODE && element.nodeValue !== value) {
//       element.nodeValue = value;
//     } else {
//       const newNode = document.createTextNode(value);
//       if (!parent) {
//         throw new RangeError("7");
//       }
//       parent.replaceChild(newNode, element);
//       part.start = part.end = newNode;
//     }
//   }

//   private updateArray(part: Part, value: PartValue[]) {
//     repeat(value)(part);
//   }

//   private updateNode(part: Part, value: any) {
//     const element = findEdge(
//       part,
//       "start"
//     ) as HTMLElement;
//     const parent = element && element.parentNode;
//     if (!parent) {
//       throw new RangeError("6");
//     }
//     if (element !== value) {
//       const isFrag = value.nodeType === DOCUMENT_FRAGMENT;
//       const newStart = isFrag ? value.firstChild : value;
//       const newEnd = isFrag ? value.lastChild : value;
//       // TODO: change to use pull()
//       parent.replaceChild(value, part.target.flush());
//       part.start = newStart;
//       part.end = newEnd;
//     }
//   }

//   private updateAttribute(part: Part, value: any) {
//     const element = findEdge(
//       part,
//       "start"
//     ) as HTMLElement;
//     const name = typeof part.end === "string" ? part.end : "";
//     try {
//       (element as any)[name] = value == null ? "" : value;
//     } catch (_) {}
//     if (element != null && typeof value !== "function" && isNode(element)) {
//       if (value == null) {
//         removeAttribute(part, element as HTMLElement, name);
//       } else {
//         setAttribute(part, element as HTMLElement, name, value);
//       }
//     }
//   }

//   private set(value: PartValue) {
//     if (typeof this.end === "string") {
//       this.updateAttribute(this, value);
//     } else {
//       if (
//         typeof value !== "string" &&
//         !Array.isArray(value) &&
//         typeof (value as any)[Symbol.iterator] === "function"
//       ) {
//         value = Array.from(value as any);
//       }
//       if (isPromise(value)) {
//         (value as Promise<PartValue>).then(promised => {
//           this.set(promised);
//         });
//       } else if (isTemplate(value)) {
//         render(value as Template, this);
//       } else if ((value as Node).nodeType) {
//         this.updateNode(this, value);
//       } else if (Array.isArray(value)) {
//         this.updateArray(this, value);
//       } else {
//         this.updateTextNode(this, value);
//       }
//     }
//   }
// }

export interface IDomTarget {
  getStart: () => Node;
  getEnd: () => Node | string;
  pull: (target: IPart | ITemplate) => DocumentFragment;
}

export interface IPart extends IDomTarget {
  readonly id: symbol;
  readonly path: Array<number | string>;
  readonly isSVG: boolean;
  readonly last: PartValue | null;
  addDisposer: (disposer: PartDispose) => void;
  removeDisposer: (disposer: PartDispose) => void;
  update: (value: PartValue) => void;
};
function PullTarget(target: IPart | ITemplate): DocumentFragment {
  // TODO: finish writing logic to pull part/templates...
  return document.createDocumentFragment();
}
const PartDisposers = new Map<symbol, PartDispose[]>();
export function Part(path: Array<number | string>, isSVG?: boolean, start?: StartEdge, end?: EndEdge): IPart {
  const disposers: PartDispose[] = [];
  let result: IPart;
  result = {
    getStart() {
      return document.createElement("remove-this");
    },
    getEnd() {
      return "remove-this";
    },
    id: Symbol(),
    isSVG: isSVG || false,
    last: null,
    path,
    addDisposer(handler: PartDispose) {
      if (
        typeof handler === "function" &&
        disposers.indexOf(handler) === -1
      ) {
        disposers.push(handler);
      }
    },
    pull: () => PullTarget(result),
    removeDisposer(handler: PartDispose) {
      const index = disposers.indexOf(handler);
      if (index > -1) {
        disposers.splice(index, 1);
      }
    },
    update(value?: PartValue) {
      if (value == null) {
        return;
      }
      // this.set(value);
      // TODO: finish rewrite...
    }
  };
  PartDisposers.set(result.id, disposers);
  return Object.seal(result);
}

export interface ITemplate extends IDomTarget {
  readonly key: string;
  readonly template: HTMLTemplateElement;
  update: (template: ITemplate) => void;
  dispose: () => void;
};
export function Template(
  key: string,
  templateElement: HTMLTemplateElement,
  parts: IPart[],
  values: PartValue[],
  start?: StartEdge,
  end?: EndEdge
): ITemplate {
  // TODO: rewrite template class functional
  let result: ITemplate;
  result = {
    getStart() {
      return document.createElement("remove-this");
    },
    getEnd() {
      return "remove-this";
    },
    key,
    pull: () => PullTarget(result),
    template: templateElement,
    update(template: ITemplate) {

    },
    dispose() {
      parts.forEach(part => {
        const disposer = PartDisposers.get(part.id);
        if (typeof disposer === "function") {
          disposer(part);
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
  if (value == null) {
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
  if (el == null) {
    return;
  }
  const frag = (el.cloneNode(true) as HTMLTemplateElement).content;
  if (frag == null) {
    return;
  }
  const first = frag.firstChild;
  if (first == null) {
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
    if (element == null) {
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
  while (current != null) {
    if (current.nodeName === "SVG") {
      result = true;
      current = null;
    } else {
      current = current.parentNode;
    }
  }
  return result;
}

function templateSetup(parts: IPart[]): WalkFn {
  return (parent, element) => {
    if (element == null) {
      throw new RangeError("invalid <WalkFn> call with null element");
    }
    const nodeType = element && element.nodeType;
    if (nodeType === TEXT_NODE) {
      const isSVG = isSVGChild(element);
      const text = element && element.nodeValue;
      const split = text && text.split("{{}}");
      const end = split != null ? split.length - 1 : null;
      const nodes: Node[] = [];
      let cursor = 0;
      if (split && split.length > 0 && end) {
        split.forEach((node, i) => {
          if (node !== "") {
            nodes.push(document.createTextNode(node));
            cursor++;
          }
          if (i < end) {
            nodes.push(document.createComment("{{}}"));
            const adjustedPath = walkPath.slice(0);
            const len = adjustedPath.length - 1;
            (adjustedPath[len] as number) += cursor;
            parts.push(Part(adjustedPath, isSVG));
            cursor++;
          }
        });
        nodes.forEach(node => {
          parent.insertBefore(node, element as Node);
        });
        /* // really not sure why I had this here...
        if (parent != null && [].indexOf.call(parent.childNodes, element) > -1) {
          throw new RangeError(`${parent}, ${parent.childNodes}, ${element}`);
        }*/
        parent.removeChild(element);
      }
    } else if (nodeType === ELEMENT_NODE) {
      const isSVG = isSVGChild(element);
      [].forEach.call(element.attributes, (attr: Attr) => {
        if (attr.nodeValue === "{{}}") {
          parts.push(Part(walkPath.concat(attr.nodeName), isSVG));
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
  const des = (cacheEntry != null
    ? cacheEntry
    : checkForSerialized(id) as IDeserializedTemplate);
  let template = des && des.template;
  const parts = (des && des.parts) || [];
  if (template == null) {
    template = document.createElement("template");
    template.innerHTML = strs.join("{{}}");
    walkDOM(template.content, null, templateSetup(parts));
    templateCache.set(id, { template, parts });
  }
  return Template(staticMarkUp, template, parts, exprs);
}

// export class Template extends DomTarget{
//   public fragment: DocumentFragment;
//   constructor(
//     public key: string,
//     public template: HTMLTemplateElement,
//     public parts: Part[],
//     public values: PartValue[],
//     start?: StartEdge,
//     end?: EndEdge
//   ) {
//     super(start, end);
//   }

//   public dispose() {
//     this.parts.forEach(part =>
//       part.disposers.forEach(
//         dispose => typeof dispose === "function" && dispose(part)
//       )
//     );
//     this.pull();
//   }

//   public update(values?: PartValue[]) {
//     if (values != null && Array.isArray(values)) {
//       this.values = values;
//     }
//     if (!this.fragment) {
//       const t: HTMLTemplateElement = document.importNode(this.template, true);
//       const frag = t.content;
//       this.fragment = frag;
//       const templateStart = this.fragment.firstChild as Node;
//       const templateEnd = this.fragment.lastChild as Node;
//       /* TODO: can't we keep start and end private to DomTarget?
//       this.target.start = isPartComment(templateStart)
//         ? this.parts[0]
//         : templateStart;
//       this.target.end = isPartComment(templateEnd)
//         ? this.parts[this.parts.length - 1]
//         : templateEnd;
//       */
//       this.parts.forEach(part => {
//         const target = followDOMPath(this.fragment, part.path);
//         if (Array.isArray(target)) {
//           part.start = target[0];
//           part.end = target[1];
//         } else {
//           part.start = target;
//           part.end = target;
//         }
//       });
//     }
//     this.parts.forEach((part, i) => {
//       const newVal: PartValue = this.values[i];
//       if (isDirective(part, newVal)) {
//         (newVal as Directive)(part);
//       } else {
//         part.update(newVal);
//       }
//     });
//   }
// }

// function isPromise(x: any): boolean {
//   return x && typeof x.then === "function";
// }

// function isTemplate(x: any): boolean {
//   return x && x.values && x.parts && x.update;
// }

// function isDirective(part: Part, expression: any) {
//   const end = part.getEnd();
//   if (typeof expression === "function") {
//     if (typeof end === "string" && (end as string).startsWith("on")) {
//       return false;
//     } else {
//       return true;
//     }
//   } else {
//     return false;
//   }
// }

// function isPartComment(x: any | null | undefined): boolean {
//   return (
//     isNode(x) && (x as Node).nodeType === COMMENT_NODE && x.nodeValue === "{{}}"
//   );
// }

// function isNode(x: any): boolean {
//   return x as Node && (x as Node).nodeType > 0;
// }

// function isPart(x: any): boolean {
//   return x instanceof Part;
// }

// export function render(
//   template: Template,
//   target: Node | Part = document.body
// ): void {
//   if (target == null) {
//     throw new RangeError("invalid render target");
//   }
//   const part: Node | Part | null =
//     (target as Node).nodeType == null ? target : null;
//   const start = part && (part as Part).getStart();
//   const instance: Template =
//     (target as any).__template ||
//     (start && (start as any).__template) ||
//     getChildTemplate(target as HTMLElement);
//   if (instance) {
//     if (instance.key === template.key) {
//       instance.update(template.values);
//     } else {
//       instance.dispose();
//       // TODO: move this logic into Template class, maybe add an attach method
//       /*
//       const fragment = document.createDocumentFragment();
//       const comment = document.createComment("{{}}");
//       fragment.appendChild(comment);
//       render(template, comment);
//       const first = fragment.firstChild;
//       template.start = first != null ? first : null;
//       template.end = fragment.lastChild;
//       (first as any).__template = template;
//       */
//       // END
//       // re-write
//       /*
//       const parent = findParentNode(instance.getStart());
//       if (parent) {
//         parent.replaceChild(fragment, instance.getStart());
//       }
//       */
//     }
//     return;
//   }
//   if (part == null && target != null) {
//     const node = target;
//     // TODO: fix here...  we should remove all children, in target
//     //   create new comment node, and set templates target to the new node,
//     //   and appendChild to target...
//     template.start = template.end = target;
//     if ((node as Node).childNodes.length > 0) {
//       while ((node as Node).hasChildNodes) {
//         const lastChild = (node as Node).lastChild;
//         if (lastChild) {
//           (node as Node).removeChild(lastChild);
//         }
//       }
//     }
//     if (template.fragment != null) {
//       template.start = template.fragment.firstChild;
//       template.end = template.fragment.lastChild;
//       (template.fragment.firstChild as any).__template = template;
//       (target as Node).appendChild(template.fragment);
//     }
//   } else {
//     if (part == null) {
//       throw new RangeError();
//     }
//     template.update();
//     const start = findEdge(part, "start");
//     const parent = start.parentNode;
//     if (part != null) {
//       const p: Part = part as Part;
//       p.start = template.fragment.firstChild;
//       p.end = template.fragment.lastChild;
//       if (parent) {
//         parent.replaceChild(template.fragment, start as Node);
//         if (p.start != null) {
//           (p.start as any).__template = template;
//         }
//       }
//     }
//   }
// }

// function removeAttribute(part: Part, element: HTMLElement, name: string) {
//   if (element == null) {
//     throw new RangeError();
//   }
//   if (part.isSVG) {
//     element.removeAttributeNS(SVG_NS, name);
//   } else {
//     element.removeAttribute(name);
//   }
// }

// function setAttribute(
//   part: Part,
//   element: HTMLElement,
//   name: string,
//   value: any
// ) {
//   if (element == null) {
//     throw new RangeError();
//   }
//   if (part.isSVG) {
//     element.setAttributeNS(SVG_NS, name, value);
//   } else {
//     element.setAttribute(name, value);
//   }
// }

// function getChildTemplate(
//   target: HTMLElement | null | undefined
// ): Template | undefined {
//   if (target == null) {
//     return;
//   }
//   if (
//     target.childNodes &&
//     target.childNodes.length > 0 &&
//     (target.childNodes[0] as any).__template
//   ) {
//     return (target.childNodes[0] as any).__template;
//   }
//   return;
// }

// export type Directive = (part: Part) => void;
// export type PartValue =
//   | string
//   | number
//   | Node
//   | DocumentFragment
//   | Directive
//   | Template
//   | IPartPromise
//   | IPartArray;
// export interface IPartPromise extends Promise<PartValue> {};
// export interface IPartArray extends Array<PartValue> {};
// export type EdgeTypes = "start" | "end";
// export type Edge = StartEdge | EndEdge;
// export type StartEdge = Node | Part | null | undefined;
// export type EndEdge = StartEdge | string;
// export type PartDispose = (part: Part) => void;

// export class DomTarget {
//   constructor(protected start: StartEdge, protected end: EndEdge) {}
//   public getStart(): Node {
//     const result = this.findEdge(this, "start");
//     if (!result) {
//       throw new RangeError("invalid target start");
//     }
//     return result as Node;
//   }
//   public getEnd(): Node | string {
//     const result = this.findEdge(this, "end");
//     if (!result) {
//       throw new RangeError("invalid target end");
//     }
//     return result as Node | string;
//   }
//   public pull(): DocumentFragment {
//     const fragment = document.createDocumentFragment();
//     const start = this.findEdge(this, "start");
//     const parent = start.parentNode;
//     if (parent == null) {
//       throw new RangeError("invalid dom parentNode");
//     }
//     const end = this.findEdge(this, "end");
//     let cursor: Node | null = end;
//     while (cursor != null) {
//       const next: Node | null = cursor !== start ? cursor.previousSibling : null;
//       fragment.insertBefore(parent.removeChild(cursor), fragment.firstChild);
//       cursor = next;
//     }
//     return fragment;
//   }

//   private findEdge(
//     target: DomTarget | Node,
//     edge: EdgeTypes
//   ): Node {
//     if (isNode(target)) {
//       return target as Node;
//     }
//     return this.findEdge((target as any)[edge], edge);
//   }

//   private findParentNode(
//     part: Node | Edge | Part | null | undefined
//   ): Node | null | undefined {
//     if (part != null && isPart(part)) {
//       const start = this.findEdge(part as Part, "start") as Node;
//       return start.parentNode;
//     } else if (isNode(part)) {
//       const parent = (part as Node).parentNode;
//       if ((part && !isNode(part)) || (parent && !isNode(parent))) {
//         throw new RangeError("8");
//       }
//       return parent as Node;
//     }
//     return;
//   }
// }

// type NodeAttribute = [Node, string];
// function followDOMPath(
//   node: Node | null | undefined,
//   pointer: Array<string | number>
// ): Node | NodeAttribute | null | undefined {
//   if (
//     pointer.length === 0 ||
//     node == null ||
//     (node && (node.nodeType === TEXT_NODE || node.nodeType === COMMENT_NODE))
//   ) {
//     return node;
//   }
//   const cPath = pointer.slice(0);
//   const current = cPath.shift();
//   const num = typeof current === "string" ? parseInt(current, 10) : current;
//   if (typeof current === "string") {
//     return [node, current];
//   } else if (num != null && !isNaN(num as number)) {
//     const el =
//       node &&
//       node.childNodes &&
//       node.childNodes.length < num &&
//       node.childNodes[num]
//         ? node.childNodes[num as number]
//         : null;
//     return followDOMPath(el, cPath);
//   } else {
//     throw new RangeError("part path not found");
//   }
// }

// export function defaultKeyFn(item: any, index?: number): Key;
// export function defaultKeyFn(index: number): Key {
//   return index;
// }

// export function defaultTemplateFn(item: any): Template {
//   return html`${item}`;
// }

// export function repeat(
//   items: Array<{}>,
//   keyFn: typeof defaultKeyFn = defaultKeyFn,
//   templateFn: typeof defaultTemplateFn = defaultTemplateFn
// ): Directive {
//   return (part: Part) => {
//     const target = findEdge(part, "start");
//     const parent = findParentNode(part);
//     const id = part.id;
//     const isSVG = part.isSVG;

//     const normalized = items.map(item => {
//       if (isTemplate(item)) {
//         return item;
//       }
//       return templateFn(item);
//     }) as Template[];
//     const keys = items.map((_, index) => keyFn(index));
//     const cacheEntry = repeatCache.get(id);
//     let map = new Map<Key, number>();
//     let list: Part[] = [];
//     if (cacheEntry && cacheEntry.map && cacheEntry.list) {
//       map = cacheEntry.map;
//       list = cacheEntry.list;
//     }
//     let i = 0;
//     if (map != null && target && (target as Node).nodeType === COMMENT_NODE) {
//       const fragment = document.createDocumentFragment();
//       const len = keys.length;
//       for (; i < len; i++) {
//         const key = keys[i];
//         const node = document.createComment("{{}}");
//         const newPart: Part = new Part([0, 0], isSVG || false, node, node);
//         if (i === 0) {
//           part.start = newPart;
//         } else if (i === len) {
//           part.targe.end = newPart;
//         }
//         list.push(newPart);
//         map.set(key, i);
//         fragment.appendChild(node);
//         render(normalized[i] as Template, newPart);
//       }
//       repeatCache.set(id, { map, list });
//       if (parent) {
//         parent.replaceChild(fragment, target as Node);
//       }
//       return;
//     }
//     const normLen = normalized.length;
//     const oldLen = list && list.length;
//     const maxLen = Math.max(normLen, oldLen || 0);
//     Object.keys(map).forEach(key => {
//       if (keys.indexOf(key) === -1) {
//         const oldIndex = map.get(key);
//         if (oldIndex) {
//           list[oldIndex].pull();
//           list.splice(oldIndex, 1);
//         }
//         map.delete(key);
//       }
//     });
//     for (i = 0; i < maxLen; i++) {
//       const newTemplate = normalized[i];
//       const newKey = keys[i];
//       const oldIndex = map.get(newKey) || -1;
//       const oldPart = oldIndex ? list[oldIndex] : null;
//       if (oldPart && oldIndex === i) {
//         // update existing in place
//         oldPart.update(newTemplate);
//       } else if (oldIndex > -1 && parent != null) {
//         // add new
//         const p = list[oldIndex];
//         const move = p.pull();
//         p.update(newTemplate);
//         const el = findEdge(list[i], "start");
//         if (el) {
//           parent.insertBefore(move, el as Node);
//           list.splice(oldIndex, 1);
//           // TODO: clean up...
//           //list.splice(i, 0, move.part);
//         }
//       } else {
//         // move and update...
//         const fragment = document.createDocumentFragment();
//         const node = document.createComment("{{}}");
//         fragment.appendChild(node);
//         const newPart = new Part([0, 0], false, node, node);
//         render(newTemplate, newPart);
//         const elEdge = findEdge(list[i], "start");
//         if (elEdge && parent) {
//           parent.insertBefore(fragment, elEdge as Node);
//           list.splice(i, 0, newPart);
//         }
//       }
//       // TODO: why did you have this?
//       // parent && parent.removeChild(map[list[i]])
//     }
//   };
// }

// export function until(
//   promise: Promise<PartValue>,
//   defaultContent: PartValue
// ): Directive {
//   return (part: Part) => {
//     part.update(defaultContent);
//     promise.then(value => part.update(value));
//   };
// }
