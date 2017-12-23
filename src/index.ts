const SVG_NS = "https://www.w3.org/2000/svg";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT = 11;
const templateCache = new Map<number, TemplateCacheEntry>();
const idCache = new Map<string, number>();
const repeatCache = new Map<number, RepeatCacheEntry>();
const walkPath: Array<number | string> = [];

type WalkFn = (parent: Node, element: Node | null | undefined) => void;

type Key = string | number;
interface TemplateCacheEntry {
  template: HTMLTemplateElement;
  parts: Array<Part>;
}

interface RepeatCacheEntry {
  map: Map<Key, number>;
  list: Array<Part>;
}

function isPromise(x: any): boolean {
  return x && typeof x.then === "function";
}

function isTemplate(x: any): boolean {
  return x && x.values && x.parts && x.update;
}

function isTagged(node: any): boolean {
  return node && node.__template != null;
}

function isDirective(part: Part, expression: any) {
  const end = part.target.end;
  if (typeof expression === "function") {
    if (typeof end !== "string") {
      return true;
    } else if (end.startsWith("on")) {
      return false;
    } else {
      return true;
    }
  } else {
    return false;
  }
}

function isPartComment(x: any | null | undefined): boolean {
  return x instanceof Comment && x.nodeValue === "{{}}";
}

function isNode(x: any): boolean {
  return x instanceof Node;
}

function isPart(x: any): boolean {
  return x instanceof Part;
}

function isFirstChildSerializedParts(parent: DocumentFragment): boolean {
  const child = parent.firstChild;
  return ((child &&
    child.nodeType === COMMENT_NODE &&
    child.nodeValue &&
    child.nodeValue.startsWith("{{parts:")) as boolean);
}

export function render(
  template: TemplateResult,
  target: Node | Part = document.body
): void {
  if (target == null) {
    throw new RangeError("invalid render target");
  }
  const part: Node | Part | null =
    (<Node>target).nodeType == null ? target : null;
  const instance: TemplateResult =
    (<any>target).__template ||
    ((<Part>part).target.start &&
      (<any>(<Part>part).target.start).__template) ||
    getChildTemplate(<HTMLElement>target);
  if (instance) {
    if (instance.key === template.key) {
      instance.update(template.values);
    } else {
      instance.dispose();
      const fragment = document.createDocumentFragment();
      const comment = document.createComment("{{}}");
      fragment.appendChild(comment);
      render(template, comment);
      const first = fragment.firstChild;
      template.target.start = first != null ? first : null;
      template.target.end = fragment.lastChild;
      (first as any).__template = template;
      const parent = findParentNode(<StartEdge>instance.target.start);
      parent && parent.replaceChild(fragment, <Node>instance.target.start);
    }
    return;
  }
  template.update();
  if (part == null && target != null) {
    const node = <Node>target;
    if (node.childNodes.length > 0) {
      while (node.hasChildNodes) {
        node.removeChild(<Node>node.lastChild);
      }
    }
    if (template.fragment != null) {
      template.target.start = template.fragment.firstChild;
      template.target.end = template.fragment.lastChild;
      (template.fragment.firstChild as any).__template = template;
      (<Node>target).appendChild(template.fragment);
    }
  } else {
    const tar = part && (<Part>part).target;
    if (tar == null) {
      throw new RangeError();
    }
    const start = followEdge(tar, "start");
    const parent = findParentNode(part);
    if (part != null) {
      const p = <Part>part;
      p.target.start = template.fragment.firstChild;
      p.target.end = template.fragment.lastChild;
      parent && parent.replaceChild(template.fragment, <Node>start);
      if (p.target.start != null) {
        (p.target.start as any).__template = template;
      }
    }
  }
}

function removeAttribute(part: Part, element: HTMLElement, name: string) {
  if (element == null) throw new RangeError();
  if (part.isSVG) {
    element.removeAttributeNS(SVG_NS, name);
  } else {
    element.removeAttribute(name);
  }
}

function setAttribute(
  part: Part,
  element: HTMLElement,
  name: string,
  value: any
) {
  if (element == null) throw new RangeError();
  if (part.isSVG) {
    element.setAttributeNS(SVG_NS, name, value);
  } else {
    element.setAttribute(name, value);
  }
}

function followEdge(edge: DomTarget, type: EdgeTypes): Edge | null | undefined {
  if (isPart(edge)) {
    if (type === "start") {
      return edge.start;
    } else {
      return edge.end;
    }
  }
}

function findEdge(
  target: DomTarget | null | undefined,
  edge: EdgeTypes
): Edge | null | undefined {
  if (target != null) {
    let cursor: Edge | null | undefined = followEdge(target, edge);
    while (cursor != null) {
      if (isPart(cursor)) {
        cursor = followEdge((<Part>cursor).target, edge);
      } else if (isNode(cursor)) {
        return cursor;
      }
    }
  } else {
    return null;
  }
}

function isSVGChild(node: Node | null | undefined): boolean {
  let result = false;
  let cur = node;
  while (cur != null) {
    if (cur.nodeName === "SVG") {
      return true;
    } else {
      cur = cur.parentNode;
    }
  }
  return result;
}

function templateSetup(parts: Array<Part>): WalkFn {
  return function(parent, element) {
    if (element == null) {
      throw new RangeError("invalid <WalkFn> call with null element");
    }
    const nodeType = element && element.nodeType;
    if (nodeType === TEXT_NODE) {
      const isSVG = isSVGChild(element);
      const text = element && element.nodeValue;
      const split = text && text.split("{{}}");
      const end = split != null ? split.length - 1 : null;
      const nodes: Array<Node> = [];
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
            (<number>adjustedPath[len]) += cursor;
            parts.push(new Part(adjustedPath, isSVG));
            cursor++;
          }
        });
        nodes.forEach(node => {
          parent.insertBefore(node, <Node>element);
        });
        if (parent != null && [].indexOf.call(parent.childNodes, element) > -1)
          throw new RangeError();
        parent.removeChild(element);
      }
    } else if (nodeType === ELEMENT_NODE) {
      const isSVG = isSVGChild(element);
      [].forEach.call(element.attributes, (attr: Attr) => {
        if (attr.nodeValue === "{{}}") {
          parts.push(new Part(walkPath.concat(attr.nodeName), isSVG));
        }
      });
    }
  };
}

function getChildTemplate(
  target: HTMLElement | null | undefined
): TemplateResult | undefined {
  if (target == null) return;
  if (
    target.childNodes &&
    target.childNodes.length > 0 &&
    (target.childNodes[0] as any).__template
  ) {
    return (target.childNodes[0] as any).__template;
  }
}

export function flushPart(target: DomTarget): Node {
  const start = findEdge(target, "start");
  const parent = findParentNode(start);
  const end = findEdge(target, "end");
  if (start !== end) {
    let current = end;
    while (current !== start && current != null) {
      const nextNode = (<Node>current).previousSibling;
      parent && parent.removeChild(<Node>current);
      current = nextNode;
    }
  }
  if (start == null || isPart(start)) {
    throw new RangeError();
  }
  return <Node>start;
}

function updateAttribute(part: Part, value: any) {
  const element: HTMLElement | null | undefined = <HTMLElement>findEdge(
    part.target,
    "start"
  );
  const name = typeof part.target.end === "string" ? part.target.end : "";
  try {
    (element as any)[name] = value == null ? "" : value;
  } catch (_) {} // eslint-disable-line
  if (element != null && typeof value !== "function" && isNode(element)) {
    if (value == null) {
      removeAttribute(part, <HTMLElement>element, name);
    } else {
      setAttribute(part, <HTMLElement>element, name, value);
    }
  }
}

function updateNode(part: Part, value: any) {
  const element: HTMLElement | null | undefined = <HTMLElement>findEdge(
    part.target,
    "start"
  );
  const parent = element && element.parentNode;
  if (!parent) throw new RangeError("6");
  if (element !== value) {
    const isFrag = value.nodeType === DOCUMENT_FRAGMENT;
    const newStart = isFrag ? value.firstChild : value;
    const newEnd = isFrag ? value.lastChild : value;
    parent.replaceChild(value, flushPart(part.target));
    part.target.start = newStart;
    part.target.end = newEnd;
  }
}

function updateTextNode(part: Part, value: any) {
  const element = <HTMLElement>findEdge(part.target, "start");
  const parent = element && element.parentNode;
  if (part.target.start !== part.target.end) {
    flushPart(part.target);
  }
  if (element == null) throw new RangeError();
  if (element.nodeType === TEXT_NODE && element.nodeValue !== value) {
    element.nodeValue = value;
  } else {
    const newNode = document.createTextNode(value);
    if (!parent) throw new RangeError("7");
    parent.replaceChild(newNode, element);
    part.target.start = part.target.end = newNode;
  }
}

function updateArray(part: Part, value: Array<PartValue>) {
  repeat(value)(part);
}

function set(part: Part, value: ValidPartValue) {
  if (typeof part.target.end === "string") {
    updateAttribute(part, value);
  } else {
    if (
      typeof value !== "string" &&
      !Array.isArray(value) &&
      typeof (value as any)[Symbol.iterator] === "function"
    ) {
      value = Array.from(<any>value);
    }
    if (isPromise(value)) {
      (value as Promise<ValidPartValue>).then(promised => {
        set(part, promised);
      });
    } else if (isTemplate(value)) {
      render(<TemplateResult>value, part);
    } else if ((<Node>value).nodeType) {
      updateNode(part, value);
    } else if (Array.isArray(value)) {
      updateArray(part, value);
    } else {
      updateTextNode(part, value);
    }
  }
}

export type ValidPartValue = PartValue | PartPromise | PartArray;
export type Directive = (part: Part) => void;
export type PartValue =
  | string
  | number
  | Node
  | DocumentFragment
  | Directive
  | TemplateResult;
export type PartPromise = Promise<PartValue>;
export type PartArray = Array<PartValue>;
export type EdgeTypes = "start" | "end";
export type Edge = StartEdge | EndEdge;
export type StartEdge = Node | Part | null | undefined;
export type EndEdge = StartEdge | string;
export type PartDispose = (part: Part) => void;
export type PulledPart = {
  part: Part;
  fragment: DocumentFragment;
};

function findParentNode(
  part: Node | Edge | Part | null | undefined
): Node | null | undefined {
  if (part != null && isPart(part)) {
    const start = <Node>findEdge((<Part>part).target, "start");
    return start && start.parentNode;
  } else if (isNode(part)) {
    const parent = part && (<Node>part).parentNode;
    if ((part && !isNode(part)) || (parent && !isNode(parent))) {
      throw new RangeError("8");
    }
    return <Node>parent;
  }
}

export class DomTarget {
  constructor(public start: StartEdge, public end: EndEdge) {}
}

export class Part {
  id: symbol;
  target: DomTarget;
  disposers: Array<PartDispose>;
  constructor(
    public path: Array<number | string>,
    public isSVG?: boolean,
    start?: StartEdge,
    end?: EndEdge
  ) {
    this.id = Symbol("part");
    this.disposers = [];
    this.target = new DomTarget(start, end);
  }

  update(value?: ValidPartValue) {
    if (value == null) {
      return;
    }
    set(this, value);
  }

  addDisposer(handler: PartDispose) {
    if (
      typeof handler === "function" &&
      this.disposers.indexOf(handler) === -1
    ) {
      this.disposers.push(handler);
    }
  }

  removeDisposer(handler: PartDispose) {
    const index = this.disposers.indexOf(handler);
    if (index > -1) {
      this.disposers.splice(index, 1);
    }
  }

  pull(): PulledPart {
    const fragment = document.createDocumentFragment();
    const stack = [];
    let cursor = findEdge(this.target, "end");
    const parent = cursor && (<Node>cursor).parentNode;
    if (parent == null) throw new RangeError("9");
    while (cursor !== this.target.start && cursor != null) {
      const next = (<Node>cursor).previousSibling;
      stack.push((<Node>parent).removeChild(<Node>cursor));
      cursor = next;
    }
    while (stack.length > 0) {
      fragment.appendChild(<Node>stack.pop());
    }
    return { part: this, fragment };
  }
}

export class TemplateResult {
  fragment: DocumentFragment;
  target: DomTarget;
  constructor(
    public key: string,
    public template: HTMLTemplateElement,
    public parts: Array<Part>,
    public values: Array<ValidPartValue>
  ) {
    // TODO: change this class...  I want to make a Template and TemplateResult class...
    //  the Template class will have the shape: { template: HTMLTemplateElement, paths: PartPats }
    //  TemplateResult will have the output from cloning Template, and following PartPaths on the HTMLTemplateElement clone...
  }

  dispose() {
    this.parts.forEach(part =>
      part.disposers.forEach(
        dispose => typeof dispose === "function" && dispose(part)
      )
    );
    this.target.start = this.target.end = flushPart(this.target);
  }

  update(values?: Array<ValidPartValue>) {
    if (values != null && Array.isArray(values)) {
      this.values = values;
    }
    if (!this.fragment) {
      const t: HTMLTemplateElement = document.importNode(this.template, true);
      const frag = t.content;
      this.fragment = frag;
      const templateStart: StartEdge | null | undefined = this.fragment
        .firstChild;
      const templateEnd: EndEdge | null | undefined = this.fragment.lastChild;
      this.target.start = isPartComment(templateStart)
        ? this.parts[0]
        : templateStart;
      this.target.end = isPartComment(templateEnd)
        ? this.parts[this.parts.length - 1]
        : templateEnd;
      this.parts.forEach(part => {
        const target = followDOMPath(this.fragment, part.path);
        if (Array.isArray(target)) {
          part.target.start = target[0];
          part.target.end = target[1];
        } else {
          part.target.start = target;
          part.target.end = target;
        }
      });
    }
    this.parts.forEach((part, i) => {
      const newVal: ValidPartValue = this.values[i];
      if (isDirective(part, newVal)) {
        (<Directive>newVal)(part);
      } else {
        part.update(newVal);
      }
    });
  }
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

type NodeAttribute = [Node, string];
function followDOMPath(
  node: Node | null | undefined,
  pointer: Array<string | number>
): Node | NodeAttribute | null | undefined {
  if (
    pointer.length === 0 ||
    node == null ||
    (node && (node.nodeType === TEXT_NODE || node.nodeType === COMMENT_NODE))
  ) {
    return node;
  }
  const cPath = pointer.slice(0);
  const current = cPath.shift();
  const num = typeof current === "string" ? parseInt(current, 10) : current;
  if (typeof current === "string") {
    return [node, current];
  } else if (num != null && !isNaN(<number>num)) {
    const el =
      node &&
      node.childNodes &&
      node.childNodes.length < num &&
      node.childNodes[num]
        ? node.childNodes[<number>num]
        : null;
    return followDOMPath(el, cPath);
  } else {
    throw new RangeError("part path not found");
  }
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
      walkDOM(<HTMLElement>element, child, fn);
      walkPath.pop();
    });
  }
}

export function html(
  strs: TemplateStringsArray,
  ...exprs: Array<ValidPartValue>
) {
  const staticMarkUp = strs.toString();
  const id = idCache.get(staticMarkUp) || generateId(staticMarkUp);
  const cacheEntry = templateCache.get(id);
  let { template, parts } = <DeserializedTemplate>(cacheEntry != null
    ? cacheEntry
    : checkForSerialized(id));
  if (template == null) {
    template = document.createElement("template");
    template.innerHTML = strs.join("{{}}");
    walkDOM(template.content, null, templateSetup(parts));
    templateCache.set(id, { template, parts });
  }
  return new TemplateResult(staticMarkUp, template, parts, exprs);
}

function parseSerializedParts(
  value: string | null | undefined
): Array<Part | null | undefined> {
  if (value == null) {
    return [];
  } else {
    return JSON.parse(value.split("{{parts:")[1].slice(0, -2));
  }
}

type DeserializedTemplate = {
  template: HTMLTemplateElement;
  parts: Array<Part>;
};

function checkForSerialized(
  id: number
): DeserializedTemplate | null | undefined {
  const el:
    | HTMLTemplateElement
    | null
    | undefined = <HTMLTemplateElement>document.getElementById(
    `template-${id}`
  );
  if (el == null) return;
  const frag = (<HTMLTemplateElement>el.cloneNode(true)).content;
  if (frag == null) return;
  const first = frag.firstChild;
  if (first == null) return;
  const isFirstChildSerial = isFirstChildSerializedParts(frag);
  let deserialized: DeserializedTemplate | null | undefined;
  if (isFirstChildSerial) {
    const fc = frag.removeChild(first);
    let parts = <Part[]>parseSerializedParts(fc.nodeValue);
    let template = <HTMLTemplateElement>el;
    if (parts && template) {
      deserialized = { template, parts };
    }
  }
  if (deserialized) {
    return deserialized;
  }
}

export function defaultKeyFn(item: any, index: number): string | number {
  return index;
}

export function defaultTemplateFn(item: any): TemplateResult {
  return html`${item}`;
}

export function repeat(
  items: Array<{}>,
  keyFn: typeof defaultKeyFn = defaultKeyFn,
  templateFn: typeof defaultTemplateFn = defaultTemplateFn
): Directive {
  return (part: Part) => {
    const target = findEdge(part.target, "start");
    const parent = findParentNode(part);
    const id = part.id;
    const isSVG = part.isSVG;
    const normalized = items.map(item => {
      if (isTemplate(item)) {
        return item;
      }
      return templateFn(item);
    });
    const keys = items.map((item, index) => keyFn(item, index));
    /*
    const cacheEntry = repeatCache.get(id);
    let map: { [any]: Part } = {};
    let list: Array<number | string> = [];
    if (cacheEntry && cacheEntry.map && cacheEntry.list) {
      map = cacheEntry.map;
      list = cacheEntry.list;
    }
    let i = 0;
    if (!map && target && target.nodeType === COMMENT_NODE) {
      const fragment = document.createDocumentFragment();
      let len = keys.length;
      for (; i < len; i++) {
        const key = keys[i];
        const node = document.createComment("{{}}");
        let newPart: Part = createPart(
          [0, 0],
          isSVG || false,
          Symbol(),
          node,
          node
        );
        if (i === 0) {
          part.start = newPart;
        } else if (i === len) {
          part.end = newPart;
        }
        list.push(key);
        map[key] = newPart;
        fragment.appendChild(node);
        render(normalized[i], newPart);
      }
      keyMapCache.set(id, { map, list });
      // TODO: figure out why parent is nullish here...
      parent && parent.replaceChild(fragment, target);
      return;
    }
    const normLen = normalized.length;
    const oldLen = list && list.length;
    const maxLen = Math.max(normLen, oldLen || 0);
    Object.keys(map).forEach(key => {
      if (keys.indexOf(key) === -1) {
        const partToRemove = map[key];
        pullPart(partToRemove);
        list.splice(list.indexOf(partToRemove), 1);
        delete map[key];
      }
    });
    for (i = 0; i < maxLen; i++) {
      const newKey = keys[i];
      const newTemplate = normalized[i];
      const oldKey = list[i];
      const oldPart = map[oldKey];
      const newKeyIndexOldList = list.indexOf(newKey);
      if (oldKey === newKey) {
        oldPart.update(newTemplate);
      } else if (newKeyIndexOldList > -1 && parent != null) {
        const p = map[newKey];
        const move = pullPart(p);
        p.update(newTemplate);
        const el = findPartEdge(map[list[i]], "start");
        parent.insertBefore(move.fragment, el);
        list.splice(newKeyIndexOldList, 1);
        list.splice(i, 0, move.part);
      } else {
        const fragment = document.createDocumentFragment();
        const node = document.createComment("{{}}");
        fragment.appendChild(node);
        const newPart = createPart([0], false, Symbol(), node, node);
        render(newTemplate, newPart);
        // TODO: finish logic here to correctly update array/iterable/repeat...
        parent && parent.insertBefore(fragment, findPartEdge(map[list[i]], "start"));
        list.splice(i, 0, newPart);
      }
      parent.removeChild(list[i])
    }
    */
  };
}

export function until(
  promise: Promise<ValidPartValue>,
  defaultContent: ValidPartValue
): Directive {
  return function(part: Part) {
    part.update(defaultContent);
    promise.then(value => part.update(value));
  };
}
